// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Room access keys
/// @notice One key market per creator ("subject"). Keys unlock the creator's room and a share of the room's fees.
///
/// Price of the next key at supply s:  P(s) = 0.002 + 0.00015·s + 0.000002·min(s, 40)²  ETH
///
/// Fees on every buy and sell (starting values, hard-capped in bytecode):
///   creator 4% · protocol 2% · room rewards 2%
///   plus, on a sell within 24h of the seller's last buy, an extra flip fee that starts at 4% and decays
///   linearly to 0; all of it goes to room rewards.
///
/// Room rewards (key-trade share, flip fees and anything deposited by the room's swap-fee splitter) are streamed
/// to current key holders, pro rata, over REWARD_DURATION. A holder earns only while holding, so buying right before
/// a deposit captures only the part that streams while they hold.
///
/// Guards: the creator buys and locks key 1 when creating the market; for a short window after creation only the
/// creator can buy; at most 5 keys and at most 10% of supply per buy; a 30-minute sell cooldown after a wallet's
/// last buy. Keys cannot be transferred.
contract RoomKeys is Ownable2Step, ReentrancyGuard {
    // ---------------------------------------------------------------- curve
    uint256 public constant P0 = 0.002 ether;
    uint256 public constant ALPHA = 0.00015 ether;
    uint256 public constant BETA = 0.000002 ether;
    uint256 public constant CAP = 40;

    // ---------------------------------------------------------------- fees
    uint256 public constant BPS = 10_000;
    /// @notice Hard cap on the base fee (creator + protocol + room), whatever the owner proposes.
    uint256 public constant MAX_BASE_FEE_BPS = 1_000;
    /// @notice The flip fee starts here and decays to 0 over FLIP_WINDOW.
    uint256 public constant FLIP_FEE_BPS = 400;
    uint256 public constant FLIP_WINDOW = 24 hours;
    uint256 public constant FEE_TIMELOCK = 2 days;

    // ---------------------------------------------------------------- guards
    uint256 public constant MAX_KEYS_PER_TX = 5;
    uint256 public constant SELL_COOLDOWN = 30 minutes;
    uint256 public constant MIN_SNIPER_WINDOW = 2 minutes;
    uint256 public constant MAX_SNIPER_WINDOW = 5 minutes;
    uint256 public constant REWARD_DURATION = 3 days;

    uint256 private constant ACC = 1e18;

    struct Fees {
        uint16 creatorBps;
        uint16 protocolBps;
        uint16 roomBps;
    }

    struct PendingFees {
        Fees fees;
        uint64 eta;
    }

    struct Market {
        uint64 createdAt;
        uint64 periodFinish;
        uint64 lastUpdate;
        uint32 supply;
        address coin;
        uint256 rewardRate; // wei per second, scaled by 1e18
        uint256 rewardPerKey; // accumulated, scaled by 1e18
    }

    Fees public fees = Fees({creatorBps: 400, protocolBps: 200, roomBps: 200});
    PendingFees public pendingFees;
    address public protocolRecipient;
    uint256 public sniperWindow = 3 minutes;

    mapping(address subject => Market) internal _markets;
    mapping(address subject => mapping(address holder => uint256)) public balanceOf;
    mapping(address subject => mapping(address holder => uint64)) public lastBuyAt;
    mapping(address subject => mapping(address holder => uint256)) internal _paidPerKey;
    mapping(address subject => mapping(address holder => uint256)) internal _accrued;
    /// @notice Creator and protocol fees waiting to be withdrawn.
    mapping(address account => uint256) public owed;

    address[] public subjects;

    // ---------------------------------------------------------------- events
    event MarketCreated(address indexed subject, address indexed coin);
    event CoinLinked(address indexed subject, address indexed coin);
    event KeysBought(
        address indexed subject,
        address indexed buyer,
        uint256 amount,
        uint256 cost,
        uint256 creatorFee,
        uint256 protocolFee,
        uint256 roomFee,
        uint256 supply
    );
    event KeysSold(
        address indexed subject,
        address indexed seller,
        uint256 amount,
        uint256 proceeds,
        uint256 creatorFee,
        uint256 protocolFee,
        uint256 roomFee,
        uint256 flipFee,
        uint256 supply
    );
    event RewardsDeposited(address indexed subject, address indexed from, uint256 amount, uint256 periodFinish);
    event RewardsClaimed(address indexed subject, address indexed holder, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event FeesProposed(uint16 creatorBps, uint16 protocolBps, uint16 roomBps, uint64 eta);
    event FeesUpdated(uint16 creatorBps, uint16 protocolBps, uint16 roomBps);
    event ProtocolRecipientSet(address recipient);
    event SniperWindowSet(uint256 window);

    // ---------------------------------------------------------------- errors
    error MarketExists();
    error NoMarket();
    error ZeroAmount();
    error TooManyKeys(uint256 max);
    error CreatorOnly(uint256 until);
    error NotEnoughEth(uint256 needed);
    error NotEnoughKeys();
    error CreatorKeyLocked();
    error Cooldown(uint256 until);
    error Slippage(uint256 got);
    error FeeTooHigh();
    error NotReady();
    error BadWindow();
    error ZeroAddress();
    error TransferFailed();

    constructor(address owner_, address protocolRecipient_) Ownable(owner_) {
        if (protocolRecipient_ == address(0)) revert ZeroAddress();
        protocolRecipient = protocolRecipient_;
    }

    // ================================================================ curve math

    /// @notice Price of the next key when `supply` keys exist.
    function priceAt(uint256 supply) public pure returns (uint256) {
        uint256 q = supply < CAP ? supply : CAP;
        return P0 + ALPHA * supply + BETA * q * q;
    }

    /// @notice Sum of P(i) for i in [supply, supply + amount), in closed form.
    function curveCost(uint256 supply, uint256 amount) public pure returns (uint256) {
        if (amount == 0) return 0;
        uint256 end = supply + amount;
        uint256 linear = amount * supply + (amount * (amount - 1)) / 2;
        uint256 a = supply < CAP ? supply : CAP;
        uint256 b = end < CAP ? end : CAP;
        uint256 squares = _sumSquares(b) - _sumSquares(a);
        uint256 capped = (end > CAP ? end : CAP) - (supply > CAP ? supply : CAP);
        squares += capped * CAP * CAP;
        return amount * P0 + ALPHA * linear + BETA * squares;
    }

    /// @dev Sum of i² for i in [0, n).
    function _sumSquares(uint256 n) private pure returns (uint256) {
        if (n == 0) return 0;
        return ((n - 1) * n * (2 * n - 1)) / 6;
    }

    // ================================================================ views

    function getMarket(address subject) external view returns (Market memory) {
        return _markets[subject];
    }

    function marketExists(address subject) public view returns (bool) {
        return _markets[subject].supply > 0;
    }

    function supplyOf(address subject) external view returns (uint256) {
        return _markets[subject].supply;
    }

    function subjectsCount() external view returns (uint256) {
        return subjects.length;
    }

    function baseFeeBps() public view returns (uint256) {
        Fees memory f = fees;
        return uint256(f.creatorBps) + f.protocolBps + f.roomBps;
    }

    function getBuyPrice(address subject, uint256 amount) public view returns (uint256) {
        return curveCost(_markets[subject].supply, amount);
    }

    function getSellPrice(address subject, uint256 amount) public view returns (uint256) {
        uint256 supply = _markets[subject].supply;
        if (amount > supply) return 0;
        return curveCost(supply - amount, amount);
    }

    function getBuyPriceAfterFee(address subject, uint256 amount) external view returns (uint256) {
        uint256 price = getBuyPrice(subject, amount);
        return price + (price * baseFeeBps()) / BPS;
    }

    /// @notice What `holder` would receive for selling `amount` keys now, after the base fee and any flip fee.
    function getSellPriceAfterFee(address subject, address holder, uint256 amount) external view returns (uint256) {
        uint256 price = getSellPrice(subject, amount);
        uint256 fee = (price * baseFeeBps()) / BPS + (price * flipFeeBps(subject, holder)) / BPS;
        return price > fee ? price - fee : 0;
    }

    /// @notice The extra sell fee `holder` would pay right now, in basis points.
    function flipFeeBps(address subject, address holder) public view returns (uint256) {
        uint256 last = lastBuyAt[subject][holder];
        if (last == 0) return 0;
        uint256 elapsed = block.timestamp - last;
        if (elapsed >= FLIP_WINDOW) return 0;
        return (FLIP_FEE_BPS * (FLIP_WINDOW - elapsed)) / FLIP_WINDOW;
    }

    /// @notice The most keys a buyer may take in one transaction right now.
    function maxBuy(address subject) public view returns (uint256) {
        uint256 tenth = uint256(_markets[subject].supply) / 10;
        if (tenth < 1) tenth = 1;
        return tenth < MAX_KEYS_PER_TX ? tenth : MAX_KEYS_PER_TX;
    }

    function sellableAt(address subject, address holder) public view returns (uint256) {
        uint256 last = lastBuyAt[subject][holder];
        return last == 0 ? 0 : last + SELL_COOLDOWN;
    }

    function publicFrom(address subject) public view returns (uint256) {
        return uint256(_markets[subject].createdAt) + sniperWindow;
    }

    /// @notice Room rewards `holder` can claim from `subject`'s market right now.
    function pendingRewards(address subject, address holder) public view returns (uint256) {
        Market storage m = _markets[subject];
        uint256 acc = _rewardPerKeyNow(m);
        return _accrued[subject][holder] + (balanceOf[subject][holder] * (acc - _paidPerKey[subject][holder])) / ACC;
    }

    function _rewardPerKeyNow(Market storage m) private view returns (uint256) {
        if (m.supply == 0) return m.rewardPerKey;
        uint256 until = block.timestamp < m.periodFinish ? block.timestamp : m.periodFinish;
        if (until <= m.lastUpdate) return m.rewardPerKey;
        return m.rewardPerKey + ((until - m.lastUpdate) * m.rewardRate) / m.supply;
    }

    // ================================================================ trading

    /// @notice Open your key market. Buys and locks key 1 for you in the same transaction.
    /// @param coin Optional community coin linked to the room (address(0) for none).
    function createMarket(address coin) external payable nonReentrant {
        address subject = msg.sender;
        Market storage m = _markets[subject];
        if (m.supply > 0) revert MarketExists();
        m.createdAt = uint64(block.timestamp);
        m.lastUpdate = uint64(block.timestamp);
        m.coin = coin;
        subjects.push(subject);
        emit MarketCreated(subject, coin);
        _buy(subject, subject, 1);
    }

    /// @notice Link or change the community coin shown with your room. The coin gate itself lives in RoomAccess.
    function setCoin(address coin) external {
        Market storage m = _markets[msg.sender];
        if (m.supply == 0) revert NoMarket();
        m.coin = coin;
        emit CoinLinked(msg.sender, coin);
    }

    function buyKeys(address subject, uint256 amount) external payable nonReentrant {
        Market storage m = _markets[subject];
        if (m.supply == 0) revert NoMarket();
        if (msg.sender != subject && block.timestamp < publicFrom(subject)) revert CreatorOnly(publicFrom(subject));
        uint256 max = maxBuy(subject);
        if (amount > max) revert TooManyKeys(max);
        _buy(subject, msg.sender, amount);
    }

    function sellKeys(address subject, uint256 amount, uint256 minProceeds) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Market storage m = _markets[subject];
        if (m.supply == 0) revert NoMarket();
        uint256 bal = balanceOf[subject][msg.sender];
        if (bal < amount) revert NotEnoughKeys();
        if (msg.sender == subject && bal - amount < 1) revert CreatorKeyLocked();
        uint256 until = sellableAt(subject, msg.sender);
        if (block.timestamp < until) revert Cooldown(until);

        _updateRewards(subject, msg.sender);

        uint256 price = curveCost(m.supply - amount, amount);
        Fees memory f = fees;
        uint256 creatorFee = (price * f.creatorBps) / BPS;
        uint256 protocolFee = (price * f.protocolBps) / BPS;
        uint256 roomFee = (price * f.roomBps) / BPS;
        uint256 flipFee = (price * flipFeeBps(subject, msg.sender)) / BPS;
        uint256 proceeds = price - creatorFee - protocolFee - roomFee - flipFee;
        if (proceeds < minProceeds) revert Slippage(proceeds);

        balanceOf[subject][msg.sender] = bal - amount;
        m.supply -= uint32(amount);
        owed[subject] += creatorFee;
        owed[protocolRecipient] += protocolFee;
        _addRewards(subject, roomFee + flipFee);

        emit KeysSold(subject, msg.sender, amount, proceeds, creatorFee, protocolFee, roomFee, flipFee, m.supply);
        _send(msg.sender, proceeds);
    }

    function _buy(address subject, address buyer, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        Market storage m = _markets[subject];
        _updateRewards(subject, buyer);

        uint256 price = curveCost(m.supply, amount);
        Fees memory f = fees;
        uint256 creatorFee = (price * f.creatorBps) / BPS;
        uint256 protocolFee = (price * f.protocolBps) / BPS;
        uint256 roomFee = (price * f.roomBps) / BPS;
        uint256 total = price + creatorFee + protocolFee + roomFee;
        if (msg.value < total) revert NotEnoughEth(total);

        balanceOf[subject][buyer] += amount;
        lastBuyAt[subject][buyer] = uint64(block.timestamp);
        m.supply += uint32(amount);
        owed[subject] += creatorFee;
        owed[protocolRecipient] += protocolFee;
        _addRewards(subject, roomFee);

        emit KeysBought(subject, buyer, amount, price, creatorFee, protocolFee, roomFee, m.supply);
        if (msg.value > total) _send(buyer, msg.value - total);
    }

    // ================================================================ room rewards

    /// @notice Add ETH to a market's room-rewards stream. Used by the room's swap-fee splitter; anyone may call.
    function depositRewards(address subject) external payable nonReentrant {
        if (_markets[subject].supply == 0) revert NoMarket();
        if (msg.value == 0) revert ZeroAmount();
        _addRewards(subject, msg.value);
    }

    function claimRewards(address subject) external nonReentrant returns (uint256 amount) {
        _updateRewards(subject, msg.sender);
        amount = _accrued[subject][msg.sender];
        if (amount == 0) return 0;
        _accrued[subject][msg.sender] = 0;
        emit RewardsClaimed(subject, msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// @notice Withdraw creator or protocol fees owed to the caller.
    function withdraw() external nonReentrant returns (uint256 amount) {
        amount = owed[msg.sender];
        if (amount == 0) return 0;
        owed[msg.sender] = 0;
        emit Withdrawn(msg.sender, amount);
        _send(msg.sender, amount);
    }

    function _updateRewards(address subject, address holder) private {
        Market storage m = _markets[subject];
        uint256 acc = _rewardPerKeyNow(m);
        m.rewardPerKey = acc;
        uint256 now_ = block.timestamp < m.periodFinish ? block.timestamp : m.periodFinish;
        if (now_ > m.lastUpdate) m.lastUpdate = uint64(now_);
        uint256 bal = balanceOf[subject][holder];
        if (bal > 0) _accrued[subject][holder] += (bal * (acc - _paidPerKey[subject][holder])) / ACC;
        _paidPerKey[subject][holder] = acc;
    }

    /// @dev Restart the stream with `amount` plus whatever had not streamed yet, spread over REWARD_DURATION.
    function _addRewards(address subject, uint256 amount) private {
        if (amount == 0) return;
        Market storage m = _markets[subject];
        m.rewardPerKey = _rewardPerKeyNow(m);
        uint256 total = amount * ACC;
        if (block.timestamp < m.periodFinish) total += (m.periodFinish - block.timestamp) * m.rewardRate;
        m.rewardRate = total / REWARD_DURATION;
        m.lastUpdate = uint64(block.timestamp);
        m.periodFinish = uint64(block.timestamp + REWARD_DURATION);
        emit RewardsDeposited(subject, msg.sender, amount, m.periodFinish);
    }

    // ================================================================ admin

    /// @notice Propose new fee splits. They take effect after FEE_TIMELOCK and never above MAX_BASE_FEE_BPS.
    function proposeFees(uint16 creatorBps, uint16 protocolBps, uint16 roomBps) external onlyOwner {
        if (uint256(creatorBps) + protocolBps + roomBps > MAX_BASE_FEE_BPS) revert FeeTooHigh();
        uint64 eta = uint64(block.timestamp + FEE_TIMELOCK);
        pendingFees = PendingFees(Fees(creatorBps, protocolBps, roomBps), eta);
        emit FeesProposed(creatorBps, protocolBps, roomBps, eta);
    }

    function executeFees() external {
        PendingFees memory p = pendingFees;
        if (p.eta == 0 || block.timestamp < p.eta) revert NotReady();
        fees = p.fees;
        delete pendingFees;
        emit FeesUpdated(p.fees.creatorBps, p.fees.protocolBps, p.fees.roomBps);
    }

    function setProtocolRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        protocolRecipient = recipient;
        emit ProtocolRecipientSet(recipient);
    }

    function setSniperWindow(uint256 window) external onlyOwner {
        if (window < MIN_SNIPER_WINDOW || window > MAX_SNIPER_WINDOW) revert BadWindow();
        sniperWindow = window;
        emit SniperWindowSet(window);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

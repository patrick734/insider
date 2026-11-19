// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {InsiderKeys} from "./InsiderKeys.sol";

interface IWETH {
    function withdraw(uint256) external;
}

/// @title Splitter factory
/// @notice One fee splitter per room host, at an address known before it is deployed (CREATE2 clone, salt = host).
/// The app uses that address as the swap integrator-fee recipient, so fees can arrive before the splitter exists.
contract SplitterFactory is Ownable2Step {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_TREASURY_BPS = 3_000;
    uint256 public constant SHARES_TIMELOCK = 2 days;

    struct Shares {
        uint16 creatorBps;
        uint16 holdersBps;
        uint16 treasuryBps;
    }

    InsiderKeys public immutable keys;
    address public immutable weth;
    address public immutable implementation;
    address public treasury;

    Shares public shares = Shares({creatorBps: 6_000, holdersBps: 2_000, treasuryBps: 2_000});
    Shares public pendingShares;
    uint64 public pendingEta;

    event SplitterCreated(address indexed host, address splitter);
    event SharesProposed(uint16 creatorBps, uint16 holdersBps, uint16 treasuryBps, uint64 eta);
    event SharesUpdated(uint16 creatorBps, uint16 holdersBps, uint16 treasuryBps);
    event TreasurySet(address treasury);

    error BadShares();
    error NotReady();
    error ZeroAddress();

    constructor(InsiderKeys keys_, address weth_, address treasury_, address owner_) Ownable(owner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        keys = keys_;
        weth = weth_;
        treasury = treasury_;
        implementation = address(new RoomFeeSplitter());
    }

    function predict(address host) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, _salt(host));
    }

    /// @notice Deploy the host's splitter. Anyone may call; returns the existing one if already deployed.
    function create(address host) public returns (address splitter) {
        splitter = predict(host);
        if (splitter.code.length > 0) return splitter;
        Clones.cloneDeterministic(implementation, _salt(host));
        RoomFeeSplitter(payable(splitter)).initialize(host);
        emit SplitterCreated(host, splitter);
    }

    function proposeShares(uint16 creatorBps, uint16 holdersBps, uint16 treasuryBps) external onlyOwner {
        if (uint256(creatorBps) + holdersBps + treasuryBps != BPS || treasuryBps > MAX_TREASURY_BPS) revert BadShares();
        pendingShares = Shares(creatorBps, holdersBps, treasuryBps);
        pendingEta = uint64(block.timestamp + SHARES_TIMELOCK);
        emit SharesProposed(creatorBps, holdersBps, treasuryBps, pendingEta);
    }

    function executeShares() external {
        if (pendingEta == 0 || block.timestamp < pendingEta) revert NotReady();
        shares = pendingShares;
        delete pendingShares;
        pendingEta = 0;
        emit SharesUpdated(shares.creatorBps, shares.holdersBps, shares.treasuryBps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function _salt(address host) private pure returns (bytes32) {
        return bytes32(uint256(uint160(host)));
    }
}

/// @title Room fee splitter
/// @notice Receives in-app swap fees for one host's room (ETH or WETH) and splits them: by default 60% to the host,
/// 20% streamed to the host's current key holders, 20% to the treasury. If the host has no key market yet, the
/// holders' share goes to the host. Fees in any other token go to the host and the treasury only.
contract RoomFeeSplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    SplitterFactory public factory;
    address public host;
    /// @notice Host share that could not be sent directly (for example to a contract that rejects ETH).
    uint256 public hostOwed;

    event FeesDistributed(address indexed host, uint256 hostAmount, uint256 holdersAmount, uint256 treasuryAmount);
    event TokenFeesDistributed(address indexed host, address indexed token, uint256 hostAmount, uint256 treasuryAmount);
    event HostClaimed(address indexed host, uint256 amount);

    error AlreadyInitialized();
    error TransferFailed();

    receive() external payable {}

    function initialize(address host_) external {
        if (address(factory) != address(0)) revert AlreadyInitialized();
        factory = SplitterFactory(msg.sender);
        host = host_;
    }

    /// @notice Split everything held in ETH and WETH. Anyone may call.
    function distribute() external nonReentrant {
        address weth = factory.weth();
        if (weth != address(0)) {
            uint256 w = IERC20(weth).balanceOf(address(this));
            if (w > 0) IWETH(weth).withdraw(w);
        }
        uint256 bal = address(this).balance - hostOwed;
        if (bal == 0) return;

        // The host gets the remainder, so rounding dust never stays behind.
        (, uint16 holdersBps, uint16 treasuryBps) = factory.shares();
        InsiderKeys keys = factory.keys();
        uint256 treasuryAmt = (bal * treasuryBps) / 10_000;
        uint256 holdersAmt = keys.marketExists(host) ? (bal * holdersBps) / 10_000 : 0;
        uint256 hostAmt = bal - treasuryAmt - holdersAmt;

        if (holdersAmt > 0) keys.depositRewards{value: holdersAmt}(host);
        if (treasuryAmt > 0) _send(factory.treasury(), treasuryAmt);
        (bool ok,) = host.call{value: hostAmt, gas: 50_000}("");
        if (!ok) hostOwed += hostAmt;
        emit FeesDistributed(host, hostAmt, holdersAmt, treasuryAmt);
    }

    /// @notice Split fees that arrived in some other token: treasury share to the treasury, the rest to the host.
    function distributeToken(IERC20 token) external nonReentrant {
        uint256 bal = token.balanceOf(address(this));
        if (bal == 0) return;
        (,, uint16 treasuryBps) = factory.shares();
        uint256 treasuryAmt = (bal * treasuryBps) / 10_000;
        token.safeTransfer(factory.treasury(), treasuryAmt);
        token.safeTransfer(host, bal - treasuryAmt);
        emit TokenFeesDistributed(host, address(token), bal - treasuryAmt, treasuryAmt);
    }

    function claimHost() external nonReentrant {
        uint256 amount = hostOwed;
        hostOwed = 0;
        emit HostClaimed(host, amount);
        _send(host, amount);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

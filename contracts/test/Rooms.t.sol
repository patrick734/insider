// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {InsiderKeys} from "../src/InsiderKeys.sol";
import {RoomAccess} from "../src/RoomAccess.sol";
import {SplitterFactory, RoomFeeSplitter} from "../src/RoomFeeSplitter.sol";

contract Coin is ERC20 {
    constructor() ERC20("Coin", "COIN") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
    }
}

contract RejectsEth {
    function create(InsiderKeys keys) external payable {
        keys.createMarket{value: msg.value}(address(0));
    }
}

contract RoomsTest is Test {
    InsiderKeys keys;
    RoomAccess access;
    SplitterFactory factory;
    MockWETH weth;
    Coin coin;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address host = makeAddr("host");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(1_800_000_000);
        keys = new InsiderKeys(owner, treasury);
        access = new RoomAccess(keys);
        weth = new MockWETH();
        factory = new SplitterFactory(keys, address(weth), treasury, owner);
        coin = new Coin();
        vm.deal(host, 10 ether);
        vm.deal(alice, 10 ether);
    }

    // ------------------------------------------------------------ access

    function test_accessByKeyOrCoin() public {
        assertTrue(access.canEnter(host, host));
        assertFalse(access.canEnter(host, alice));

        vm.prank(host);
        access.setCoinGate(address(coin), 1_000e18);
        coin.mint(alice, 999e18);
        assertFalse(access.canEnter(host, alice));
        coin.mint(alice, 1e18);
        assertTrue(access.canEnter(host, alice));
        assertTrue(access.hasCoin(host, alice));
        assertFalse(access.hasKey(host, alice));

        // Spending the coin drops access.
        vm.prank(alice);
        coin.transfer(host, 1e18);
        assertFalse(access.canEnter(host, alice));

        // A key lets her back in.
        vm.prank(host);
        keys.createMarket{value: 1 ether}(address(coin));
        vm.warp(vm.getBlockTimestamp() + 5 minutes);
        uint256 cost = keys.getBuyPriceAfterFee(host, 1);
        vm.prank(alice);
        keys.buyKeys{value: cost}(host, 1);
        assertTrue(access.canEnter(host, alice));
        assertTrue(access.hasKey(host, alice));
    }

    function test_gateNeedsThreshold() public {
        vm.prank(host);
        vm.expectRevert(RoomAccess.ZeroThreshold.selector);
        access.setCoinGate(address(coin), 0);
        vm.prank(host);
        access.setCoinGate(address(0), 0);
    }

    function test_badCoinDoesNotRevert() public {
        vm.prank(host);
        access.setCoinGate(address(0xdead), 1);
        assertFalse(access.canEnter(host, alice));
    }

    // ------------------------------------------------------------ splitter

    function test_feesArriveBeforeDeploy() public {
        address predicted = factory.predict(host);
        vm.deal(predicted, 1 ether); // swap fees sent to the counterfactual address
        address splitter = factory.create(host);
        assertEq(splitter, predicted);
        assertEq(factory.create(host), splitter); // idempotent
        assertEq(RoomFeeSplitter(payable(splitter)).host(), host);
    }

    function test_splitWithKeyMarket() public {
        vm.prank(host);
        keys.createMarket{value: 1 ether}(address(0));
        RoomFeeSplitter s = RoomFeeSplitter(payable(factory.create(host)));

        uint256 hostBefore = host.balance;
        vm.deal(address(s), 1 ether);
        s.distribute();
        assertEq(host.balance - hostBefore, 0.6 ether);
        assertEq(treasury.balance, 0.2 ether);
        // The holders' 20% streams to key holders (only the host so far).
        vm.warp(vm.getBlockTimestamp() + 3 days);
        assertApproxEqAbs(keys.pendingRewards(host, host), 0.2 ether + (keys.priceAt(0) * 200) / 10_000, 1e9);
    }

    function test_splitWithoutKeyMarketGoesToHost() public {
        RoomFeeSplitter s = RoomFeeSplitter(payable(factory.create(host)));
        uint256 hostBefore = host.balance;
        vm.deal(address(s), 1 ether);
        s.distribute();
        assertEq(host.balance - hostBefore, 0.8 ether);
        assertEq(treasury.balance, 0.2 ether);
    }

    function test_unwrapsWeth() public {
        RoomFeeSplitter s = RoomFeeSplitter(payable(factory.create(host)));
        vm.prank(alice);
        weth.deposit{value: 1 ether}();
        vm.prank(alice);
        weth.transfer(address(s), 1 ether);
        uint256 hostBefore = host.balance;
        s.distribute();
        assertEq(host.balance - hostBefore, 0.8 ether);
        assertEq(weth.balanceOf(address(s)), 0);
    }

    function test_otherTokenSplit() public {
        RoomFeeSplitter s = RoomFeeSplitter(payable(factory.create(host)));
        coin.mint(address(s), 100e18);
        s.distributeToken(coin);
        assertEq(coin.balanceOf(host), 80e18);
        assertEq(coin.balanceOf(treasury), 20e18);
    }

    function test_hostThatRejectsEthCanClaimLater() public {
        RejectsEth h = new RejectsEth();
        h.create{value: keys.getBuyPriceAfterFee(address(h), 1)}(keys);
        RoomFeeSplitter s = RoomFeeSplitter(payable(factory.create(address(h))));
        vm.deal(address(s), 1 ether);
        s.distribute();
        assertEq(s.hostOwed(), 0.6 ether);
        // A second distribute doesn't re-split what the host is owed.
        s.distribute();
        assertEq(s.hostOwed(), 0.6 ether);
        assertEq(treasury.balance, 0.2 ether);
    }

    function test_sharesTimelockAndCap() public {
        vm.prank(owner);
        vm.expectRevert(SplitterFactory.BadShares.selector);
        factory.proposeShares(5_000, 1_000, 4_000);
        vm.prank(owner);
        factory.proposeShares(7_000, 2_000, 1_000);
        vm.expectRevert(SplitterFactory.NotReady.selector);
        factory.executeShares();
        vm.warp(vm.getBlockTimestamp() + 2 days);
        factory.executeShares();
        (uint16 c,, uint16 t) = factory.shares();
        assertEq(c, 7_000);
        assertEq(t, 1_000);
    }

    function test_distributeWithoutWethDeployed() public {
        SplitterFactory f = new SplitterFactory(keys, address(0x4200000000000000000000000000000000000006), treasury, owner);
        RoomFeeSplitter s = RoomFeeSplitter(payable(f.create(host)));
        vm.deal(address(s), 1 ether);
        uint256 hostBefore = host.balance;
        s.distribute();
        assertEq(host.balance - hostBefore, 0.8 ether);
    }

    function test_cannotReinitialize() public {
        RoomFeeSplitter s = RoomFeeSplitter(payable(factory.create(host)));
        vm.expectRevert(RoomFeeSplitter.AlreadyInitialized.selector);
        s.initialize(alice);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {InsiderKeys} from "../src/InsiderKeys.sol";

contract InsiderKeysTest is Test {
    InsiderKeys keys;
    address owner = makeAddr("owner");
    address protocol = makeAddr("protocol");
    address host = makeAddr("host");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address coin = makeAddr("coin");

    function setUp() public {
        vm.warp(1_800_000_000);
        keys = new InsiderKeys(owner, protocol);
        vm.deal(host, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ------------------------------------------------------------ helpers

    function _create() internal {
        vm.prank(host);
        keys.createMarket{value: 1 ether}(coin);
    }

    function _open() internal {
        _create();
        vm.warp(vm.getBlockTimestamp() + keys.sniperWindow());
    }

    function _buy(address who, uint256 amount) internal {
        uint256 cost = keys.getBuyPriceAfterFee(host, amount);
        vm.prank(who);
        keys.buyKeys{value: cost}(host, amount);
    }

    /// Grow supply one key at a time from fresh wallets, so max-buy and cooldowns don't get in the way.
    function _grow(uint256 to) internal {
        uint256 i;
        while (keys.supplyOf(host) < to) {
            address w = address(uint160(0x10000 + i++));
            vm.deal(w, 10 ether);
            _buy(w, 1);
        }
    }

    function _loop(uint256 supply, uint256 amount) internal view returns (uint256 sum) {
        for (uint256 i; i < amount; i++) sum += keys.priceAt(supply + i);
    }

    // ------------------------------------------------------------ curve

    function test_curveMatchesPlanTable() public view {
        // Key n is priced at supply n - 1; cumulative 1..n is curveCost(0, n).
        uint256[9] memory n = [uint256(1), 2, 5, 10, 20, 40, 60, 80, 100];
        uint256[9] memory price = [uint256(0.002 ether), 0.002152 ether, 0.002632 ether, 0.003512 ether, 0.005572 ether, 0.010892 ether, 0.01405 ether, 0.01705 ether, 0.02005 ether];
        uint256[9] memory cum = [uint256(0.002 ether), 0.004152 ether, 0.01156 ether, 0.02732 ether, 0.07344 ether, 0.23808 ether, 0.49058 ether, 0.80308 ether, 1.17558 ether];
        for (uint256 i; i < 9; i++) {
            assertEq(keys.priceAt(n[i] - 1), price[i], "price");
            assertEq(keys.curveCost(0, n[i]), cum[i], "cumulative");
        }
    }

    function testFuzz_closedFormMatchesLoop(uint16 supply, uint8 amount) public view {
        uint256 s = bound(supply, 0, 5_000);
        uint256 a = bound(amount, 0, 60);
        assertEq(keys.curveCost(s, a), _loop(s, a));
    }

    // ------------------------------------------------------------ create

    function test_createBuysAndLocksFirstKey() public {
        uint256 before = host.balance;
        _create();
        assertEq(keys.balanceOf(host, host), 1);
        assertEq(keys.supplyOf(host), 1);
        // Paid key 1 plus 8% and got the rest of the 1 ETH back.
        assertEq(before - host.balance, 0.002 ether * 108 / 100);
        assertEq(keys.getMarket(host).coin, coin);

        vm.warp(vm.getBlockTimestamp() + 1 days);
        vm.prank(host);
        vm.expectRevert(InsiderKeys.CreatorKeyLocked.selector);
        keys.sellKeys(host, 1, 0);
    }

    function test_cannotCreateTwice() public {
        _create();
        vm.prank(host);
        vm.expectRevert(InsiderKeys.MarketExists.selector);
        keys.createMarket{value: 1 ether}(address(0));
    }

    function test_buyNeedsMarket() public {
        vm.prank(alice);
        vm.expectRevert(InsiderKeys.NoMarket.selector);
        keys.buyKeys{value: 1 ether}(host, 1);
    }

    // ------------------------------------------------------------ guards

    function test_sniperWindowOnlyCreator() public {
        _create();
        uint256 cost = keys.getBuyPriceAfterFee(host, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InsiderKeys.CreatorOnly.selector, keys.publicFrom(host)));
        keys.buyKeys{value: cost}(host, 1);

        // The creator can still buy inside the window.
        _buy(host, 1);
        assertEq(keys.balanceOf(host, host), 2);

        vm.warp(keys.publicFrom(host));
        _buy(alice, 1);
        assertEq(keys.balanceOf(host, alice), 1);
    }

    function test_maxBuy() public {
        _open();
        assertEq(keys.maxBuy(host), 1);
        uint256 cost = keys.getBuyPriceAfterFee(host, 2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InsiderKeys.TooManyKeys.selector, 1));
        keys.buyKeys{value: cost}(host, 2);

        _grow(20);
        assertEq(keys.maxBuy(host), 2);
        _grow(49);
        assertEq(keys.maxBuy(host), 4);
        _grow(50);
        assertEq(keys.maxBuy(host), 5);
        _grow(200);
        assertEq(keys.maxBuy(host), 5);
    }

    function test_sellCooldown() public {
        _open();
        _buy(alice, 1);
        uint256 until = vm.getBlockTimestamp() + 30 minutes;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InsiderKeys.Cooldown.selector, until));
        keys.sellKeys(host, 1, 0);

        vm.warp(until);
        vm.prank(alice);
        keys.sellKeys(host, 1, 0);
        assertEq(keys.balanceOf(host, alice), 0);
    }

    function test_flipFeeDecays() public {
        _open();
        _buy(alice, 1);
        assertEq(keys.flipFeeBps(host, alice), 400);
        vm.warp(vm.getBlockTimestamp() + 6 hours);
        assertEq(keys.flipFeeBps(host, alice), 300);
        vm.warp(vm.getBlockTimestamp() + 6 hours);
        assertEq(keys.flipFeeBps(host, alice), 200);
        vm.warp(vm.getBlockTimestamp() + 12 hours);
        assertEq(keys.flipFeeBps(host, alice), 0);
    }

    function test_sellPaysCurveMinusFees() public {
        _open();
        _buy(alice, 1);
        vm.warp(vm.getBlockTimestamp() + 12 hours); // flip fee 2%
        uint256 price = keys.getSellPrice(host, 1);
        uint256 expected = price - (price * 800) / 10_000 - (price * 200) / 10_000;
        assertEq(keys.getSellPriceAfterFee(host, alice, 1), expected);

        uint256 before = alice.balance;
        vm.prank(alice);
        keys.sellKeys(host, 1, expected);
        assertEq(alice.balance - before, expected);
    }

    function test_sellSlippage() public {
        _open();
        _buy(alice, 1);
        vm.warp(vm.getBlockTimestamp() + 2 days);
        uint256 out = keys.getSellPriceAfterFee(host, alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InsiderKeys.Slippage.selector, out));
        keys.sellKeys(host, 1, out + 1);
    }

    function test_buyRefundsExcessAndRejectsShort() public {
        _open();
        uint256 cost = keys.getBuyPriceAfterFee(host, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InsiderKeys.NotEnoughEth.selector, cost));
        keys.buyKeys{value: cost - 1}(host, 1);

        uint256 before = alice.balance;
        vm.prank(alice);
        keys.buyKeys{value: cost + 1 ether}(host, 1);
        assertEq(before - alice.balance, cost);
    }

    // ------------------------------------------------------------ fees

    function test_feesOwedAndWithdrawn() public {
        _open();
        _buy(alice, 1);
        uint256 price = keys.priceAt(1);
        uint256 hostFirst = (keys.priceAt(0) * 400) / 10_000;
        assertEq(keys.owed(host), hostFirst + (price * 400) / 10_000);
        assertEq(keys.owed(protocol), (keys.priceAt(0) * 200) / 10_000 + (price * 200) / 10_000);

        uint256 before = protocol.balance;
        vm.prank(protocol);
        keys.withdraw();
        assertEq(protocol.balance - before, (keys.priceAt(0) * 200) / 10_000 + (price * 200) / 10_000);
        assertEq(keys.owed(protocol), 0);
    }

    function test_feeTimelockAndCap() public {
        vm.prank(owner);
        vm.expectRevert(InsiderKeys.FeeTooHigh.selector);
        keys.proposeFees(500, 300, 300);

        vm.prank(owner);
        keys.proposeFees(300, 200, 300);
        vm.expectRevert(InsiderKeys.NotReady.selector);
        keys.executeFees();

        vm.warp(vm.getBlockTimestamp() + 2 days);
        keys.executeFees();
        (uint16 c, uint16 p, uint16 r) = keys.fees();
        assertEq(c, 300);
        assertEq(p, 200);
        assertEq(r, 300);
    }

    function test_onlyOwnerAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        keys.proposeFees(100, 100, 100);
        vm.prank(alice);
        vm.expectRevert();
        keys.setProtocolRecipient(alice);
        vm.prank(owner);
        vm.expectRevert(InsiderKeys.BadWindow.selector);
        keys.setSniperWindow(10 minutes);
    }

    // ------------------------------------------------------------ room rewards

    function test_rewardsStreamToHolders() public {
        _open();
        _buy(alice, 1);
        // Clear the stream started by the key-trade fees.
        vm.warp(vm.getBlockTimestamp() + 4 days);
        uint256 hostBase = keys.pendingRewards(host, host);
        uint256 aliceBase = keys.pendingRewards(host, alice);

        keys.depositRewards{value: 3 ether}(host);
        vm.warp(vm.getBlockTimestamp() + 1 days); // a third of the stream
        assertApproxEqAbs(keys.pendingRewards(host, host) - hostBase, 0.5 ether, 1e9);
        assertApproxEqAbs(keys.pendingRewards(host, alice) - aliceBase, 0.5 ether, 1e9);

        vm.warp(vm.getBlockTimestamp() + 2 days);
        assertApproxEqAbs(keys.pendingRewards(host, alice) - aliceBase, 1.5 ether, 1e9);

        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 got = keys.claimRewards(host);
        assertEq(alice.balance - before, got);
        assertEq(keys.pendingRewards(host, alice), 0);
    }

    function test_lateBuyerOnlyEarnsWhileHolding() public {
        _open();
        vm.warp(vm.getBlockTimestamp() + 4 days);
        keys.depositRewards{value: 3 ether}(host);
        vm.warp(vm.getBlockTimestamp() + 2 days); // two thirds streamed to the host alone

        _buy(alice, 1); // buys just before the rest streams
        assertEq(keys.pendingRewards(host, alice), 0);
        // The 1 ETH still unstreamed (plus her buy's room fee) restarts over 3 days; Alice holds half the keys.
        vm.warp(vm.getBlockTimestamp() + 3 days);
        uint256 alicePending = keys.pendingRewards(host, alice);
        assertGt(alicePending, 0.5 ether);
        assertLt(alicePending, 0.51 ether);
        // She never sees the 2 ETH that streamed before she bought.
        assertGt(keys.pendingRewards(host, host), 2.5 ether);
    }

    function test_sellerStopsEarning() public {
        _open();
        _buy(alice, 1);
        vm.warp(vm.getBlockTimestamp() + 4 days);
        vm.prank(alice);
        keys.sellKeys(host, 1, 0);
        uint256 frozen = keys.pendingRewards(host, alice);
        keys.depositRewards{value: 1 ether}(host);
        vm.warp(vm.getBlockTimestamp() + 4 days);
        assertEq(keys.pendingRewards(host, alice), frozen);
        vm.prank(alice);
        keys.claimRewards(host);
        assertEq(keys.pendingRewards(host, alice), 0);
    }

    function test_flipFeeGoesToRoomRewards() public {
        _open();
        _buy(alice, 1);
        vm.warp(vm.getBlockTimestamp() + 4 days);
        _buy(bob, 1);
        vm.warp(vm.getBlockTimestamp() + 30 minutes);
        uint256 hostBefore = keys.pendingRewards(host, host);
        vm.prank(bob);
        keys.sellKeys(host, 1, 0);
        vm.warp(vm.getBlockTimestamp() + 4 days);
        // Room fee 2% plus a flip fee just under 4% of the sell price, streamed to host and alice.
        uint256 price = keys.priceAt(2);
        uint256 got = keys.pendingRewards(host, host) - hostBefore;
        assertGt(got, (price * 590) / 10_000 / 2 - 1e9);
    }

    // ------------------------------------------------------------ solvency

    function testFuzz_solvent(uint8 seed) public {
        _open();
        address[4] memory who = [alice, bob, makeAddr("c"), makeAddr("d")];
        for (uint256 i; i < 4; i++) vm.deal(who[i], 100 ether);
        uint256 r = seed;
        for (uint256 step; step < 40; step++) {
            r = uint256(keccak256(abi.encode(r, step)));
            address w = who[r % 4];
            vm.warp(vm.getBlockTimestamp() + (r % 3 hours));
            if (r % 3 == 0 && keys.balanceOf(host, w) > 0 && vm.getBlockTimestamp() >= keys.sellableAt(host, w)) {
                vm.prank(w);
                keys.sellKeys(host, 1, 0);
            } else if (r % 5 == 0) {
                keys.depositRewards{value: (r % 1e15) + 1}(host);
            } else if (r % 7 == 0) {
                vm.prank(w);
                keys.claimRewards(host);
            } else {
                _buy(w, 1);
            }
        }
        vm.warp(vm.getBlockTimestamp() + 4 days);
        // Everyone sells and claims; the contract must cover it all.
        for (uint256 i; i < 4; i++) {
            uint256 b = keys.balanceOf(host, who[i]);
            if (b > 0) {
                vm.prank(who[i]);
                keys.sellKeys(host, b, 0);
            }
        }
        // Let the room fees from those last sells finish streaming, then everyone claims.
        vm.warp(vm.getBlockTimestamp() + 4 days);
        for (uint256 i; i < 4; i++) {
            vm.prank(who[i]);
            keys.claimRewards(host);
        }
        vm.prank(host);
        keys.claimRewards(host);
        vm.prank(host);
        keys.withdraw();
        vm.prank(protocol);
        keys.withdraw();
        // Only key 1's reserve and rounding dust are left.
        assertGe(address(keys).balance, keys.priceAt(0));
        assertLt(address(keys).balance, keys.priceAt(0) + 1e6);
    }

    receive() external payable {}
}

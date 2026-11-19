// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RoomKeys} from "./RoomKeys.sol";

/// @title Room access gate
/// @notice A wallet can enter a host's room if it holds at least one of the host's keys, or holds at least the host's
/// threshold of the linked community coin. Both are live balances: selling the key or the coin drops access.
/// The app checks this from indexed balances on join and on every balance change; this contract is the source of truth.
contract RoomAccess {
    struct Gate {
        address coin;
        uint256 threshold;
    }

    RoomKeys public immutable keys;
    mapping(address host => Gate) public gates;

    event GateUpdated(address indexed host, address indexed coin, uint256 threshold);

    error ZeroThreshold();

    constructor(RoomKeys keys_) {
        keys = keys_;
    }

    /// @notice Set the coin and minimum balance that let holders into your room. Pass coin = address(0) to remove it.
    function setCoinGate(address coin, uint256 threshold) external {
        if (coin != address(0) && threshold == 0) revert ZeroThreshold();
        gates[msg.sender] = Gate(coin, coin == address(0) ? 0 : threshold);
        emit GateUpdated(msg.sender, coin, threshold);
    }

    function hasKey(address host, address user) public view returns (bool) {
        return user == host || keys.balanceOf(host, user) > 0;
    }

    function hasCoin(address host, address user) public view returns (bool) {
        Gate memory g = gates[host];
        if (g.coin == address(0)) return false;
        // A coin that reverts, has no code or returns junk counts as "no balance" instead of blocking the key check.
        (bool ok, bytes memory data) = g.coin.staticcall(abi.encodeCall(IERC20.balanceOf, (user)));
        if (!ok || data.length < 32) return false;
        return abi.decode(data, (uint256)) >= g.threshold;
    }

    function canEnter(address host, address user) external view returns (bool) {
        return hasKey(host, user) || hasCoin(host, user);
    }
}

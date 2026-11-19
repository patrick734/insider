// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {RoomKeys} from "../src/RoomKeys.sol";
import {RoomAccess} from "../src/RoomAccess.sol";
import {SplitterFactory} from "../src/RoomFeeSplitter.sol";

/// Deploys RoomKeys, RoomAccess and SplitterFactory.
///   OWNER     admin (use a Safe on mainnet); required on mainnet, defaults to the deployer elsewhere
///   TREASURY  receives the protocol fee and the treasury share of swap fees; required on mainnet
///   WETH      defaults to Base's WETH (same address on Base Sepolia)
contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;
        // On Base mainnet the admin and treasury must be named explicitly (a Safe is strongly recommended).
        if (block.chainid == 8453) {
            require(vm.envOr("OWNER", address(0)) != address(0), "Set OWNER (the admin; use a Safe) for mainnet");
            require(vm.envOr("TREASURY", address(0)) != address(0), "Set TREASURY for mainnet");
        }
        address owner = vm.envOr("OWNER", deployer);
        address treasury = vm.envOr("TREASURY", owner);
        address weth = vm.envOr("WETH", address(0x4200000000000000000000000000000000000006));

        vm.startBroadcast();
        RoomKeys keys = new RoomKeys(owner, treasury);
        RoomAccess access = new RoomAccess(keys);
        SplitterFactory splitters = new SplitterFactory(keys, weth, treasury, owner);
        vm.stopBroadcast();

        console.log("NEXT_PUBLIC_KEYS_ADDRESS=%s", address(keys));
        console.log("NEXT_PUBLIC_ROOM_ACCESS_ADDRESS=%s", address(access));
        console.log("NEXT_PUBLIC_SPLITTER_FACTORY_ADDRESS=%s", address(splitters));
        console.log("START_BLOCK=%s", block.number);
    }
}

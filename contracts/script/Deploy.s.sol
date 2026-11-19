// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {InsiderKeys} from "../src/InsiderKeys.sol";
import {RoomAccess} from "../src/RoomAccess.sol";
import {SplitterFactory} from "../src/RoomFeeSplitter.sol";

/// Deploys InsiderKeys, RoomAccess and SplitterFactory.
///   OWNER     admin (use a Safe on mainnet); defaults to the deployer
///   TREASURY  receives the protocol fee and the treasury share of swap fees; defaults to OWNER
///   WETH      defaults to Base's WETH (same address on Base Sepolia)
contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);
        address treasury = vm.envOr("TREASURY", owner);
        address weth = vm.envOr("WETH", address(0x4200000000000000000000000000000000000006));

        vm.startBroadcast();
        InsiderKeys keys = new InsiderKeys(owner, treasury);
        RoomAccess access = new RoomAccess(keys);
        SplitterFactory splitters = new SplitterFactory(keys, weth, treasury, owner);
        vm.stopBroadcast();

        console.log("NEXT_PUBLIC_KEYS_ADDRESS=%s", address(keys));
        console.log("NEXT_PUBLIC_ROOM_ACCESS_ADDRESS=%s", address(access));
        console.log("NEXT_PUBLIC_SPLITTER_FACTORY_ADDRESS=%s", address(splitters));
    }
}

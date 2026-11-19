"""Regenerate packages/core/src/abi.ts from forge build output: run `forge build` then `python3 scripts/abi.py` here."""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
items = [("keysAbi", "RoomKeys", "RoomKeys"), ("roomAccessAbi", "RoomAccess", "RoomAccess"),
         ("splitterFactoryAbi", "RoomFeeSplitter", "SplitterFactory"), ("splitterAbi", "RoomFeeSplitter", "RoomFeeSplitter")]
s = "// Generated from contracts/out by scripts/abi.py. Do not edit.\n\n"
for name, file, contract in items:
    abi = json.load(open(os.path.join(root, "out", f"{file}.sol", f"{contract}.json")))["abi"]
    s += f"export const {name} = {json.dumps(abi, separators=(',', ':'))} as const;\n\n"
open(os.path.join(root, "..", "packages", "core", "src", "abi.ts"), "w").write(s)

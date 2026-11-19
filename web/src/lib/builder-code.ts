import { concat, toHex, type Hex } from "viem";
import { BUILDER_CODE } from "./config";

/** ERC-8021 marker that closes every attribution suffix. */
const ERC_8021_MARKER: Hex = "0x80218021802180218021802180218021";

/**
 * The Base Builder Code suffix (ERC-8021, schema 0) appended to every transaction's calldata:
 * codes (ASCII, comma-separated) ‖ codes length (1 byte) ‖ schema id 0x00 ‖ marker.
 * Contracts ignore trailing calldata; Base reads it for attribution. Empty when no code is configured.
 */
export function builderSuffix(): Hex | undefined {
  if (!BUILDER_CODE) return undefined;
  const codes = toHex(BUILDER_CODE);
  const len = (codes.length - 2) / 2;
  if (len > 255) return undefined;
  return concat([codes, toHex(len, { size: 1 }), "0x00", ERC_8021_MARKER]);
}

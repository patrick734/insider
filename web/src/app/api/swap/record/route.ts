import { NextResponse } from "next/server";
import { isHash } from "viem";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";

/** Note a swap the user just sent through a room; the indexer confirms it and it counts toward verified PnL. */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const b = await body<{ txHash: string; roomId: string; coin: string; side: "buy" | "sell"; ethWei: string; tokenAmount: string }>(req);
  if (!isHash(b.txHash) || !/^\d+$/.test(b.ethWei) || !/^\d+$/.test(b.tokenAmount)) throw new HttpError(400, "Bad swap.");
  await sql()`
    insert into swaps (tx_hash, user_id, room_id, coin, side, eth_wei, token_amount)
    values (${b.txHash.toLowerCase()}, ${me.id}, ${b.roomId}, ${b.coin.toLowerCase()}, ${b.side === "sell" ? "sell" : "buy"}, ${b.ethWei}, ${b.tokenAmount})
    on conflict do nothing`;
  return NextResponse.json({ ok: true });
});

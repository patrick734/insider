import { NextResponse } from "next/server";
import { erc20Abi, isAddress } from "viem";
import { publicClient, sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";

async function myList(userId: string): Promise<string> {
  const [w] = await sql()`
    insert into watchlists (owner_id, name) values (${userId}, 'Watchlist')
    on conflict (owner_id) where room_id is null do update set name = watchlists.name returning id`;
  return String(w.id);
}

/** Add a coin to your watchlist (any ERC-20 on Base; new coins are read from the chain). */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const { coin } = await body<{ coin: string }>(req);
  if (!isAddress(coin)) throw new HttpError(400, "That isn't a coin address.");
  const addr = coin.toLowerCase();
  const [known] = await sql()`select address from coins where address = ${addr}`;
  if (!known) {
    try {
      const c = publicClient();
      const [symbol, name, decimals] = await Promise.all([
        c.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
        c.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "name" }),
        c.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
      ]);
      await sql()`insert into coins (address, symbol, name, decimals) values (${addr}, ${symbol.slice(0, 16)}, ${name.slice(0, 40)}, ${decimals}) on conflict do nothing`;
    } catch {
      throw new HttpError(400, "Couldn't read that coin on Base.");
    }
  }
  const id = await myList(me.id);
  const [{ n }] = await sql()`select count(*)::int as n from watchlist_items where watchlist_id = ${id}`;
  if (n >= 100) throw new HttpError(400, "Watchlists hold 100 coins at most.");
  await sql()`insert into watchlist_items (watchlist_id, coin_address) values (${id}, ${addr}) on conflict do nothing`;
  return NextResponse.json({ watching: true });
});

export const DELETE = handle(async (req: Request) => {
  const me = await requireMe();
  const coin = new URL(req.url).searchParams.get("coin")?.toLowerCase() ?? "";
  await sql()`delete from watchlist_items i using watchlists w where i.watchlist_id = w.id and w.owner_id = ${me.id} and w.room_id is null and i.coin_address = ${coin}`;
  return NextResponse.json({ watching: false });
});

import { NextResponse } from "next/server";
import { erc20Abi, isAddress } from "viem";
import { contractsDeployed, publicClient, sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";

/** Open a room. Hosts can open up to 3 a day (anti-farm), each optionally linked to a Base coin. */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  if (!me.handle) throw new HttpError(400, "Pick a handle in Settings first.");
  const b = await body<{ slug: string; title: string; topic?: string; coin?: string; access?: "open" | "gated" }>(req);
  const slug = String(b.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,32}$/.test(slug)) throw new HttpError(400, "Room links are 2 to 32 letters, numbers or dashes.");
  const title = String(b.title ?? "").trim();
  if (!title || title.length > 60) throw new HttpError(400, "Give the room a name (60 characters at most).");
  const [{ n }] = await sql()`select count(*)::int as n from rooms where host_id = ${me.id} and created_at > now() - interval '1 day'`;
  if (n >= 3) throw new HttpError(429, "You can open 3 rooms a day.");

  let coin: string | null = null;
  if (b.coin) {
    if (!isAddress(b.coin)) throw new HttpError(400, "That isn't a coin address.");
    coin = b.coin.toLowerCase();
    const [known] = await sql()`select address from coins where address = ${coin}`;
    if (!known) {
      // Read the coin's name and symbol from the chain; refuse anything that isn't an ERC-20.
      try {
        const c = publicClient();
        const [symbol, name, decimals] = await Promise.all([
          c.readContract({ address: coin as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
          c.readContract({ address: coin as `0x${string}`, abi: erc20Abi, functionName: "name" }),
          c.readContract({ address: coin as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
        ]);
        await sql()`insert into coins (address, symbol, name, decimals) values (${coin}, ${symbol.slice(0, 16)}, ${name.slice(0, 40)}, ${decimals}) on conflict do nothing`;
      } catch {
        throw new HttpError(400, contractsDeployed() ? "Couldn't read that coin on Base." : "Couldn't read that coin on this network.");
      }
    }
  }
  try {
    const [r] = await sql()`
      insert into rooms (host_id, slug, title, topic, coin_address, access)
      values (${me.id}, ${slug}, ${title}, ${b.topic?.trim().slice(0, 120) || null}, ${coin}, ${b.access === "open" ? "open" : "gated"})
      returning id`;
    await sql()`insert into room_members (room_id, user_id, role) values (${r.id}, ${me.id}, 'host')`;
    return NextResponse.json({ slug });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "That room link is taken.");
    throw e;
  }
});

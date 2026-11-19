import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { recentMessages, roomAccess, sql } from "@insider/core";
import { getMe } from "@/server/auth";
import { postsByUser, roomBySlug, roomStats } from "@/server/queries";
import { market } from "@/server/market";
import { RoomClient } from "@/components/room-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const room = await roomBySlug((await params).slug);
  return room ? { title: room.title, description: room.topic ?? `${room.title} on Insider` } : {};
}

export default async function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const room = await roomBySlug(slug);
  if (!room) notFound();
  const me = await getMe();
  const access = await roomAccess(sql(), room.id, me?.id ?? null);
  const [messages, stats, mkt, holders, trades, calls, gate] = await Promise.all([
    access.ok ? recentMessages(sql(), room.id) : Promise.resolve([]),
    roomStats(room.host.address, room.coinAddress),
    market(room.coinAddress),
    sql()`
      select kb.holder, kb.balance, u.handle, u.name
      from key_balances kb left join users u on u.address = kb.holder
      where kb.subject = ${room.host.address} and kb.balance > 0 order by kb.balance desc limit 50`,
    sql()`
      select kt.tx_hash, kt.is_buy, kt.amount, kt.eth_wei, kt.block_time, u.handle, kt.trader
      from key_trades kt left join users u on u.address = kt.trader
      where kt.subject = ${room.host.address} order by kt.block_number desc, kt.log_index desc limit 30`,
    postsByUser(room.host.id, me?.id ?? null, "calls"),
    sql()`select coin, threshold::text from gates where host = ${room.host.address}`,
  ]);
  return (
    <RoomClient
      room={room}
      me={me}
      access={access}
      initialMessages={messages}
      stats={stats}
      market={mkt}
      gate={gate[0] ? { coin: gate[0].coin as string | null, threshold: String(gate[0].threshold) } : null}
      holders={holders.map((h) => ({ address: h.holder as string, balance: Number(h.balance), handle: (h.handle as string) ?? null, name: (h.name as string) ?? null }))}
      trades={trades.map((t) => ({
        txHash: t.tx_hash as string,
        side: t.is_buy ? "buy" : "sell",
        amount: Number(t.amount),
        ethWei: String(t.eth_wei),
        at: (t.block_time as Date).toISOString(),
        who: (t.handle as string) ?? `${String(t.trader).slice(0, 6)}…${String(t.trader).slice(-3)}`,
      }))}
      calls={calls}
    />
  );
}

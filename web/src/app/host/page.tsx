import type { Metadata } from "next";
import Link from "next/link";
import { Corners, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { HostForm } from "@/components/host-form";
import { getMe } from "@/server/auth";
import { roomsOfHost } from "@/server/queries";
import { SITE } from "@/lib/config";
import { sql } from "@insider/core";
import { CoinTile } from "@/components/avatar";
import { eth } from "@/lib/format";
import type { RoomLite } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Host a room" };

export default async function Host() {
  const me = await getMe();
  const rooms = me ? await roomsOfHost(me.id) : [];
  return (
    <>
      <Main>
        <PageHeader title="Host a room" sub="FOUNDING HOSTS" />
        <section className="panel mx-4 mt-4 p-5 sm:mx-5">
          <Corners />
          <span className="label">// HOW HOSTING PAYS</span>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-body">
            {[
              "Your room's holders chat, call trades and swap the coin without leaving the room.",
              `Every in-app swap pays a 1% fee: 60% to you, 20% to your key holders, 20% to ${SITE.name}.`,
              "Open keys and you earn 4% of every key trade. Holders get the key chat and a share of room fees.",
              "Coin holders get in free at the balance you set. Keys are optional.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="dot mt-1.5 flex-none" />
                {t}
              </li>
            ))}
          </ul>
        </section>
        {rooms.length > 0 && me && <Dashboard hostAddress={me.address} rooms={rooms} />}
        <HostForm signedIn={!!me} hasHandle={!!me?.handle} />
      </Main>
      <Rail />
    </>
  );
}

/** What each of your rooms is doing and what it has earned you. */
async function Dashboard({ hostAddress, rooms }: { hostAddress: string; rooms: RoomLite[] }) {
  const db = sql();
  const [earned] = await db`
    select
      coalesce((select sum(creator_fee) from key_trades where subject = ${hostAddress}), 0)::text as key_fees,
      coalesce((select sum(host_amount) from fee_events where host = ${hostAddress} and kind = 'swap_split'), 0)::text as swap_fees,
      coalesce((select sum(room_fee + flip_fee) from key_trades where subject = ${hostAddress}), 0)
        + coalesce((select sum(holders_amount) from fee_events where host = ${hostAddress} and kind = 'swap_split'), 0) as to_holders,
      (select count(*) from key_balances where subject = ${hostAddress} and balance > 0)::int as holders`;
  const stats = await Promise.all(
    rooms.map(async (r) => {
      const [x] = await db`
        select (select count(*) from room_members where room_id = ${r.id} and not banned)::int as members,
               (select count(*) from messages where room_id = ${r.id} and created_at > now() - interval '7 days')::int as msgs`;
      return { members: Number(x.members), msgs: Number(x.msgs) };
    }),
  );
  return (
    <>
      <div className="mx-4 mt-4 grid grid-cols-2 gap-2 sm:mx-5 sm:grid-cols-4">
        {[
          ["KEY FEES EARNED", eth(String(earned.key_fees))],
          ["SWAP FEES EARNED", eth(String(earned.swap_fees))],
          ["PAID TO HOLDERS", eth(String(earned.to_holders))],
          ["KEY HOLDERS", String(earned.holders)],
        ].map(([k, v]) => (
          <div key={k} className="panel p-3">
            <span className="mono text-[9.5px] tracking-[0.12em] text-muted">{k}</span>
            <b className="mono mt-1.5 block text-lg">{v}</b>
          </div>
        ))}
      </div>
      <p className="mono mx-4 mt-2 text-[10.5px] text-dim sm:mx-5">Withdraw key fees from Wallet. Swap fees arrive in your wallet when a room&apos;s splitter pays out.</p>
      <section className="mt-4">
        <span className="label px-4 sm:px-5">// YOUR ROOMS</span>
        <div className="divide-line mt-2 border-y border-line">
          {rooms.map((r, i) => (
            <Link key={r.id} href={`/rooms/${r.slug}`} className="flex items-center gap-3 px-4 py-3 text-text hover:text-text sm:px-5">
              <CoinTile symbol={r.coinSymbol ?? r.slug} size={40} on={r.isLive} />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate">{r.title}</b>
                <span className="mono text-[11px] text-muted">
                  {stats[i].members} members · {stats[i].msgs} messages this week · {r.access === "gated" ? "holders only" : "open"}
                </span>
              </span>
              <span className="mono text-[11px] text-accent">● {r.online}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { CoinTile } from "@/components/avatar";
import { Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { liveRooms } from "@/server/queries";
import { getMe } from "@/server/auth";
import { sql } from "@insider/core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rooms" };

export default async function Rooms({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "mine" ? "mine" : "live";
  const me = await getMe();
  const all = await liveRooms(100);
  const mine = me ? new Set((await sql()`select room_id from room_members where user_id = ${me.id} and not banned`).map((r) => String(r.room_id))) : new Set<string>();
  const list = tab === "mine" ? all.filter((r) => mine.has(r.id)) : all;
  return (
    <>
      <Main>
        <PageHeader
          title="Rooms"
          right={
            <Link href="/host" className="btn btn-on">
              HOST A ROOM
            </Link>
          }
          tabs={[
            { label: "Live & busy", href: "/rooms", selected: tab === "live" },
            { label: "My rooms", href: "/rooms?tab=mine", selected: tab === "mine" },
          ]}
        />
        {list.length === 0 ? (
          <Empty title={tab === "mine" ? "// YOU'RE NOT IN ANY ROOMS YET" : "// NO ROOMS YET"}>
            {tab === "mine" ? "Rooms you join show up here, with their chats in Messages." : "Founding hosts are opening the first rooms."}
          </Empty>
        ) : (
          <div className="divide-line">
            {list.map((r, i) => (
              <Link key={r.id} href={`/rooms/${r.slug}`} className="flex items-center gap-3 px-4 py-3.5 text-text hover:bg-accent/4 hover:text-text sm:px-5">
                <CoinTile symbol={r.coinSymbol ?? r.slug} size={44} on={r.isLive || (i === 0 && r.online > 0)} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <b className="truncate text-[15px] font-semibold">{r.title}</b>
                    {r.isLive && (
                      <span className="mono inline-flex items-center gap-1 text-[9.5px] font-bold tracking-[0.14em] text-accent">
                        <span className="dot !h-1.5 !w-1.5" />
                        LIVE
                      </span>
                    )}
                  </span>
                  <span className="mono truncate text-[11px] text-muted">
                    @{r.host.handle} · {r.isLive ? (r.liveTitle ?? "live now") : (r.topic ?? (r.access === "gated" ? "holders only" : "open room"))}
                  </span>
                </span>
                <span className="mono flex flex-col items-end text-[11px]">
                  <b className="text-accent">● {r.online}</b>
                  <span className="text-dim">{r.access === "gated" ? "HOLDERS" : "OPEN"}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Main>
      <Rail />
    </>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "@insider/core";
import { CoinTile } from "@/components/avatar";
import { Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { AddCoin, WatchButton } from "@/components/watch-button";
import { getMe } from "@/server/auth";
import { market } from "@/server/market";
import { pct, usd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Watchlist" };

export default async function Watchlist() {
  const me = await getMe();
  if (!me) redirect("/");
  const rows = await sql()`
    select c.address, c.symbol, c.name, r.slug
    from watchlists w join watchlist_items i on i.watchlist_id = w.id join coins c on c.address = i.coin_address
    left join lateral (select slug from rooms where coin_address = c.address order by id limit 1) r on true
    where w.owner_id = ${me.id} and w.room_id is null order by i.added_at desc`;
  const markets = await Promise.all(rows.map((r) => market(r.address as string)));
  return (
    <>
      <Main>
        <PageHeader title="Watchlist" sub="PRICES FROM BASE, REFRESHED EVERY MINUTE" />
        <AddCoin />
        {rows.length === 0 ? (
          <Empty title="// NOTHING ON YOUR WATCHLIST">Star coins in Explore → Tokens, or add one by address above.</Empty>
        ) : (
          <div className="divide-line border-t border-line">
            {rows.map((c, i) => {
              const m = markets[i];
              return (
                <div key={c.address as string} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <CoinTile symbol={c.symbol as string} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="font-semibold">${c.symbol as string}</b>
                    <span className="mono truncate text-[11px] text-muted">{c.name as string}</span>
                  </span>
                  <span className="mono flex flex-col items-end text-xs">
                    <b className="text-text">{usd(m?.mcUsd ?? null)}</b>
                    <span className={(m?.change24h ?? 0) >= 0 ? "text-accent" : "text-muted"}>{pct(m?.change24h ?? null)}</span>
                  </span>
                  {c.slug ? (
                    <Link href={`/rooms/${c.slug}`} className="btn btn-off h-8 px-2.5 text-[10px]">
                      ROOM
                    </Link>
                  ) : null}
                  <WatchButton coin={c.address as string} watching />
                </div>
              );
            })}
          </div>
        )}
      </Main>
      <Rail />
    </>
  );
}

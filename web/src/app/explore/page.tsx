import Link from "next/link";
import type { Metadata } from "next";
import { Avatar, CoinTile } from "@/components/avatar";
import { BaseChip, Corners, Empty, Main, PageHeader, Section, Tabs } from "@/components/page";
import { Rail } from "@/components/rail";
import { coins, liveRooms, roomStats, topEarners, users } from "@/server/queries";
import { compact, displayName, eth, profileHref } from "@/lib/format";
import { sql } from "@insider/core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore" };

const TABS = [
  ["explore", "Explore"],
  ["perps", "Perps"],
  ["preds", "Preds"],
  ["tokens", "Tokens"],
  ["users", "Users"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function Explore({ searchParams }: { searchParams: Promise<{ tab?: string; sort?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "explore") as Tab;
  return (
    <>
      <Main>
        <PageHeader title="Explore" right={<BaseChip />} tabs={TABS.map(([k, label]) => ({ label, href: k === "explore" ? "/explore" : `/explore?tab=${k}`, selected: k === tab }))} />
        {sp.q ? <SearchResults q={sp.q} /> : null}
        {!sp.q && tab === "explore" && <ExploreTab />}
        {!sp.q && tab === "perps" && <ComingSoon what="Perps" line="Trade perpetuals from inside a room, with the host earning on the volume." />}
        {!sp.q && tab === "preds" && <ComingSoon what="Predictions" line="Up-or-down rounds and market questions, settled on-chain, right next to the chat." />}
        {!sp.q && tab === "tokens" && <TokensTab />}
        {!sp.q && tab === "users" && <UsersTab sort={sp.sort === "new" ? "new" : sp.sort === "earners" ? "earners" : "top"} />}
      </Main>
      <Rail />
    </>
  );
}

function ComingSoon({ what, line }: { what: string; line: string }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="panel art flex min-h-[260px] flex-col justify-end p-6" style={{ ["--x" as string]: "75%", ["--y" as string]: "25%" }}>
        <Corners />
        <span className="label">// COMING SOON</span>
        <h2 className="glow mono mt-2 text-4xl font-bold tracking-[0.06em]">{what.toUpperCase()}</h2>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-soft">{line}</p>
      </div>
    </div>
  );
}

async function ExploreTab() {
  const [earners, rooms] = await Promise.all([topEarners("7d", 6), liveRooms(4)]);
  const stats = await Promise.all(rooms.map((r) => roomStats(r.host.address, r.coinAddress)));
  return (
    <>
      <Section label="// TOP EARNERS · VERIFIED PNL · 7D" right={<Link href="/explore?tab=users&sort=earners" className="mono text-[11px]">LEADERBOARD →</Link>}>
        {earners.length === 0 ? (
          <Empty title="// NO VERIFIED TRADES YET" />
        ) : (
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 sm:grid sm:grid-cols-3 sm:px-5">
            {earners.map((e) => (
              <Link key={e.id} href={profileHref(e)} className="panel flex w-[160px] flex-none flex-col gap-2 p-3.5 text-text hover:text-text sm:w-auto">
                <span className="mono absolute right-3 top-2.5 text-[11px] text-dim">#{e.rank}</span>
                <span className="flex items-center gap-2.5">
                  <Avatar user={e} size={34} on={e.rank === 1} />
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate font-semibold">{displayName(e)}</b>
                    <span className="mono truncate text-[11px] text-muted">@{e.handle}</span>
                  </span>
                </span>
                <b className="mono glow text-[22px] text-accent">{eth(e.pnlWei, { sign: true })}</b>
                <span className="mono text-[10.5px] tracking-[0.06em] text-muted">
                  WIN {Math.round(e.winRate * 100)}% · {e.trades} TRADES
                </span>
                <span className="flex items-center justify-between border-t border-accent/12 pt-2">
                  <span className="mono text-[11px] text-accent-soft">{e.keySupply ? `${e.keySupply} KEYS` : "NO KEYS YET"}</span>
                  <span className="btn btn-on h-[26px] px-2.5 text-[10px]">{e.keySupply ? "BUY KEY" : "VIEW"}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>
      <Section label="// TRENDING ROOMS" right={<Link href="/rooms" className="mono text-[11px]">ALL ROOMS →</Link>}>
        <div className="grid gap-2.5 px-4 sm:grid-cols-2 sm:px-5">
          {rooms.map((r, i) => (
            <Link key={r.id} href={`/rooms/${r.slug}`} className="panel flex flex-col gap-2.5 p-3.5 text-text hover:text-text">
              <span className="flex items-center gap-2.5">
                <CoinTile symbol={r.coinSymbol ?? r.slug} on={i === 0} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[15px] font-semibold">{r.title}</b>
                  <span className="mono truncate text-[11px] text-muted">
                    host @{r.host.handle} · {r.access === "gated" ? "HOLDERS ONLY" : "OPEN"}
                  </span>
                </span>
                <span className="mono text-[11px] text-accent">● {r.online}</span>
              </span>
              <span className="mono grid grid-cols-2 gap-1.5 text-[10.5px] tracking-[0.04em] text-muted">
                <span>
                  KEY VOL 24H<b className="mt-0.5 block text-[13px] text-text">{eth(stats[i].vol24hWei)}</b>
                </span>
                <span>
                  TO KEY HOLDERS<b className="mt-0.5 block text-[13px] text-accent-soft">{eth(stats[i].toHolders24hWei)}</b>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Section>
      <div className="h-6" />
    </>
  );
}

async function TokensTab() {
  const list = await coins();
  return (
    <>
      <div className="p-4 sm:p-5">
        <div className="panel art flex items-center justify-between gap-4 p-4" style={{ ["--x" as string]: "85%", ["--y" as string]: "50%" }}>
          <div>
            <span className="label text-[10px]">// LAUNCH FROM A ROOM</span>
            <p className="mt-1 font-bold">Rooms will launch their own community coins.</p>
            <p className="mono mt-1 text-[11px] text-muted">Coming after rooms are busy. For now, link any Base coin to your room.</p>
          </div>
          <Link href="/host" className="btn btn-on flex-none">
            HOST A ROOM
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3 sm:px-5">
        <span className="chip chip-on">ALL</span>
        <span className="chip">BASE</span>
      </div>
      {list.length === 0 ? (
        <Empty title="// NO COINS LINKED YET" />
      ) : (
        <div className="divide-line border-t border-line">
          {list.map((c) => (
            <div key={c.address} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <CoinTile symbol={c.symbol} size={38} />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="font-semibold">${c.symbol}</b>
                <span className="mono truncate text-[11px] text-muted">
                  {c.name} · {compact(c.holders)} holders
                </span>
              </span>
              {c.room ? (
                <Link href={`/rooms/${c.room.slug}`} className="btn btn-off h-[30px] px-3 text-[10px]">
                  ROOM · {c.room.online}
                </Link>
              ) : (
                <span className="mono text-[10.5px] text-dim">NO ROOM</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

async function UsersTab({ sort }: { sort: "top" | "new" | "earners" }) {
  const sub = (
    <Tabs
      stretch
      className="border-b border-line"
      tabs={[
        { label: "Top", href: "/explore?tab=users", selected: sort === "top" },
        { label: "Earners", href: "/explore?tab=users&sort=earners", selected: sort === "earners" },
        { label: "New", href: "/explore?tab=users&sort=new", selected: sort === "new" },
      ]}
    />
  );
  if (sort === "earners") {
    const list = await topEarners("30d", 50);
    return (
      <>
        {sub}
        <p className="mono px-4 pb-2 pt-4 text-[11px] text-muted sm:px-5">Profit on trades checked on-chain, last 30 days.</p>
        <div className="divide-line">
          {list.map((e) => (
            <Link key={e.id} href={profileHref(e)} className="flex items-center gap-3 px-4 py-3 text-text hover:text-text sm:px-5">
              <span className="mono w-6 text-[11px] text-dim">{e.rank}</span>
              <Avatar user={e} size={40} on={e.rank <= 3} />
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate font-semibold">{displayName(e)}</b>
                <span className="mono truncate text-[11px] text-muted">
                  @{e.handle} · WIN {Math.round(e.winRate * 100)}%
                </span>
              </span>
              <b className="mono text-accent">{eth(e.pnlWei, { sign: true })}</b>
            </Link>
          ))}
        </div>
      </>
    );
  }
  const list = await users(sort === "new" ? "new" : "top");
  return (
    <>
      {sub}
      <p className="mono px-4 pb-2 pt-4 text-[11px] text-muted sm:px-5">{sort === "new" ? "Newest people on Insider." : "People with the most key holders."}</p>
      <div className="divide-line">
        {list.map((u) => (
          <Link key={u.id} href={profileHref(u)} className="flex items-center gap-3 px-4 py-3 text-text hover:text-text sm:px-5">
            <Avatar user={u} size={40} on={u.isOfficial} />
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate font-semibold">{displayName(u)}</b>
              <span className="mono truncate text-[11px] text-muted">
                @{u.handle} · {compact(u.followers)} followers
              </span>
            </span>
            <span className="mono flex flex-col items-end text-[11px]">
              <b className="text-text">{u.keySupply}</b>
              <span className="text-dim">KEYS</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

async function SearchResults({ q }: { q: string }) {
  const like = `%${q.replace(/[%_]/g, "").slice(0, 40)}%`;
  const [people, rooms] = await Promise.all([
    sql()`select id, address, handle, name, avatar_url from users where handle ilike ${like} or name ilike ${like} order by handle limit 20`,
    sql()`select r.slug, r.title, c.symbol from rooms r left join coins c on c.address = r.coin_address where r.title ilike ${like} or r.slug ilike ${like} or c.symbol ilike ${like} limit 20`,
  ]);
  return (
    <>
      <Section label={`// RESULTS FOR "${q.slice(0, 40).toUpperCase()}"`} />
      {rooms.map((r) => (
        <Link key={r.slug as string} href={`/rooms/${r.slug}`} className="flex items-center gap-3 border-t border-line px-4 py-3 text-text hover:text-text sm:px-5">
          <CoinTile symbol={(r.symbol as string) ?? (r.slug as string)} />
          <b>{r.title as string}</b>
        </Link>
      ))}
      {people.map((u) => {
        const user = { id: String(u.id), address: u.address as string, handle: (u.handle as string) ?? null, name: (u.name as string) ?? null, avatarUrl: (u.avatar_url as string) ?? null };
        return (
          <Link key={user.id} href={profileHref(user)} className="flex items-center gap-3 border-t border-line px-4 py-3 text-text hover:text-text sm:px-5">
            <Avatar user={user} size={38} />
            <b>{displayName(user)}</b>
            <span className="mono text-[11px] text-muted">@{user.handle}</span>
          </Link>
        );
      })}
      {people.length + rooms.length === 0 && <Empty title="// NOTHING MATCHED" />}
    </>
  );
}

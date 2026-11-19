import Link from "next/link";
import { Composer } from "@/components/composer";
import { PostList } from "@/components/post";
import { BaseChip, Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { CoinTile } from "@/components/avatar";
import { getMe } from "@/server/auth";
import { feed, liveRooms } from "@/server/queries";
import { sql } from "@insider/core";

export const dynamic = "force-dynamic";

const TABS = [
  ["for-you", "For you"],
  ["following", "Following"],
  ["rooms", "Rooms"],
  ["latest", "Latest"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; compose?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "for-you") as Tab;
  const me = await getMe();
  const [posts, live, myRooms] = await Promise.all([
    feed(me?.id ?? null, tab),
    liveRooms(6),
    me ? sql()`select r.id, r.title from room_members m join rooms r on r.id = m.room_id where m.user_id = ${me.id} and not m.banned order by r.title` : [],
  ]);
  return (
    <>
      <Main>
        <PageHeader title="Home" right={<BaseChip />} tabs={TABS.map(([k, label]) => ({ label, href: k === "for-you" ? "/" : `/?tab=${k}`, selected: k === tab }))} />
        <Composer rooms={myRooms.map((r) => ({ id: String(r.id), title: r.title as string }))} autoFocus={sp.compose === "1"} />
        {live.length > 0 && (
          <section aria-label="Live rooms" className="border-b border-line pb-4 pt-3.5">
            <div className="label px-4 pb-2.5 sm:px-5">// LIVE NOW</div>
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 sm:px-5">
              {live.map((r, i) => (
                <Link key={r.id} href={`/rooms/${r.slug}`} className={`panel flex w-[146px] flex-none flex-col gap-1.5 p-2.5 text-text hover:text-text ${i === 0 && r.online > 0 ? "!border-accent" : ""}`}>
                  <span className="flex items-center justify-between">
                    <CoinTile symbol={r.coinSymbol ?? r.slug} size={30} on={i === 0 && r.online > 0} />
                    <span className="mono text-[10px] text-accent">● {r.online}</span>
                  </span>
                  <b className="truncate text-[13.5px] font-semibold">{r.title}</b>
                  <span className="mono truncate text-[10.5px] text-muted">{r.liveTitle ?? r.topic ?? "open room"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {posts.length === 0 ? (
          <Empty title={tab === "following" ? "// NOTHING FROM PEOPLE YOU FOLLOW YET" : "// NO POSTS YET"}>
            {tab === "following" ? "Follow hosts and callers from Explore, and their posts show up here." : "Be the first: post a call above."}
          </Empty>
        ) : (
          <PostList posts={posts} />
        )}
      </Main>
      <Rail />
    </>
  );
}

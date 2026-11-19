import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, CoinTile } from "@/components/avatar";
import { Corners, Empty, Main, Tabs } from "@/components/page";
import { Rail } from "@/components/rail";
import { PostList } from "@/components/post";
import { ProfileActions } from "@/components/profile-actions";
import { getMe } from "@/server/auth";
import { postsByUser, profile } from "@/server/queries";
import { compact, displayName, eth, shortAddr } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = await profile((await params).handle, null);
  return p ? { title: displayName(p), description: p.bio ?? undefined } : {};
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { handle } = await params;
  const me = await getMe();
  const p = await profile(handle, me?.id ?? null);
  if (!p) notFound();
  const want = (await searchParams).tab;
  const tab = (["posts", "calls", "rooms"] as const).find((t) => t === want) ?? "posts";
  const posts = tab === "rooms" ? [] : await postsByUser(p.id, me?.id ?? null, tab);
  const base = `/u/${p.handle ?? p.address}`;
  const isMe = me?.id === p.id;
  const mainRoom = p.rooms[0];
  return (
    <>
      <Main>
        <header className="sticky top-[52px] z-20 flex items-center gap-3.5 border-b border-accent/22 bg-black/90 px-4 py-2.5 backdrop-blur sm:px-5 lg:top-0">
          <Link href="/" aria-label="Back" className="mono text-base text-text">
            ←
          </Link>
          <span className="flex flex-col">
            <b className="text-[17px]">{displayName(p)}</b>
            <span className="mono text-[11px] text-muted">{p.keyHolders} key holders</span>
          </span>
        </header>
        <div className="art relative h-[128px] border-b border-accent/35 sm:h-[170px]" style={{ ["--x" as string]: "78%", ["--y" as string]: "30%" }}>
          {p.bannerUrl && <img src={p.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          {mainRoom?.coinSymbol && <span className="mono absolute bottom-2.5 right-4 text-2xl font-bold tracking-[0.06em] text-text/90 [text-shadow:0_0_20px_rgba(46,168,255,0.9)] sm:text-[34px]">${mainRoom.coinSymbol}</span>}
        </div>
        <section className="border-b border-line px-4 pb-4 sm:px-5">
          <div className="-mt-9 flex flex-col gap-3 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <span className="relative z-10 self-start border-4 border-black shadow-[0_0_26px_rgba(46,168,255,0.6)]">
              <Avatar user={p} size={88} on />
            </span>
            <ProfileActions profile={p} isMe={isMe} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <b className="text-[22px] font-bold">{displayName(p)}</b>
            {p.isOfficial && <span className="mono bg-accent px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-on-accent">OFFICIAL</span>}
            {p.pnl && <span className="mono border border-accent/50 px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-accent-soft">PNL VERIFIED ✓</span>}
          </div>
          <span className="mono text-xs text-muted">
            {p.handle ? `@${p.handle}` : shortAddr(p.address)}
            {mainRoom && (
              <>
                {" "}
                · host of the <Link href={`/rooms/${mainRoom.slug}`}>{mainRoom.title}</Link>
              </>
            )}
            {p.xHandle && (
              <>
                {" "}
                ·{" "}
                <a href={`https://x.com/${p.xHandle}`} target="_blank" rel="noreferrer">
                  x.com/{p.xHandle}
                </a>
              </>
            )}
          </span>
          {p.bio && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-body">{p.bio}</p>}
          <div className="mono mt-3 flex flex-wrap gap-x-[18px] gap-y-1 text-xs text-muted">
            <span>
              <b className="text-text">{compact(p.following)}</b> Following
            </span>
            <span>
              <b className="text-text">{compact(p.followers)}</b> Followers
            </span>
            <span>
              <b className="text-text">{p.keyHolders}</b> Key holders
            </span>
            <span>
              <b className="text-text">{p.rooms.length}</b> Rooms
            </span>
          </div>
          {p.pnl && (
            <div className="panel mt-4 grid grid-cols-2 sm:grid-cols-4">
              <Corners />
              {[
                ["PNL · 30D", eth(p.pnl.pnlWei, { sign: true }), "glow text-accent"],
                ["WIN RATE", `${Math.round(p.pnl.winRate * 100)}%`, ""],
                ["TRADES", String(p.pnl.trades), ""],
                ["BEST CALL", p.pnl.bestCoin ? `$${p.pnl.bestCoin} ${p.pnl.bestPct !== null ? `+${Math.round(p.pnl.bestPct)}%` : ""}` : "—", "text-[15px]"],
              ].map(([k, v, c]) => (
                <div key={k} className="border-l border-t border-accent/10 px-3.5 py-3 sm:border-t-0">
                  <span className="mono text-[10px] tracking-[0.14em] text-muted">{k}</span>
                  <b className={`mono mt-1.5 block text-lg ${c}`}>{v}</b>
                </div>
              ))}
            </div>
          )}
        </section>
        <Tabs
          className="border-b border-accent/22"
          tabs={[
            { label: "Posts", href: base, selected: tab === "posts" },
            { label: "Calls", href: `${base}?tab=calls`, selected: tab === "calls" },
            { label: "Rooms", href: `${base}?tab=rooms`, selected: tab === "rooms" },
          ]}
        />
        {tab === "rooms" ? (
          p.rooms.length ? (
            <div className="divide-line">
              {p.rooms.map((r) => (
                <Link key={r.id} href={`/rooms/${r.slug}`} className="flex items-center gap-3 px-4 py-3.5 text-text hover:text-text sm:px-5">
                  <CoinTile symbol={r.coinSymbol ?? r.slug} size={42} on={r.isLive} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b>{r.title}</b>
                    <span className="mono text-[11px] text-muted">{r.access === "gated" ? "HOLDERS ONLY" : "OPEN"}</span>
                  </span>
                  <span className="mono text-[11px] text-accent">● {r.online}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="// NO ROOMS YET" />
          )
        ) : posts.length ? (
          <PostList posts={posts} />
        ) : (
          <Empty title={tab === "calls" ? "// NO CALLS YET" : "// NO POSTS YET"} />
        )}
      </Main>
      <Rail />
    </>
  );
}

import Link from "next/link";
import { activity, liveRooms } from "@/server/queries";
import { ago } from "@/lib/format";
import { CoinTile } from "./avatar";
import { Corners } from "./page";
import { Icon } from "./icons";

const KIND_COLOR: Record<string, string> = { BUY: "text-accent", SELL: "text-text", KEY: "text-accent-soft", JOIN: "text-muted" };

/** Desktop right column: search, live rooms, the keys card and recent activity. */
export async function Rail() {
  const [rooms, feed] = await Promise.all([liveRooms(5), activity(6)]);
  return (
    <aside aria-label="Live now" className="sticky top-0 hidden h-dvh w-[340px] flex-none flex-col gap-4 overflow-y-auto py-4 pl-6 pr-5 xl:flex [&>*]:flex-none">
      <form action="/explore" className="panel flex h-[42px] items-center gap-2.5 px-3.5">
        <span className="text-muted">
          <Icon name="search" size={16} />
        </span>
        <input name="q" placeholder="Search rooms, coins, people" aria-label="Search" className="mono min-w-0 flex-1 bg-transparent text-xs outline-none" />
      </form>

      <section className="panel">
        <Corners />
        <header className="flex items-center justify-between border-b border-accent/16 px-3.5 py-3">
          <span className="label inline-flex items-center gap-2">
            <span className="dot" />
            // LIVE ROOMS
          </span>
          <Link href="/rooms" className="mono text-[11px]">
            ALL →
          </Link>
        </header>
        {rooms.length === 0 && <p className="px-3.5 py-4 text-sm text-muted">No rooms yet.</p>}
        {rooms.map((r, i) => (
          <Link key={r.id} href={`/rooms/${r.slug}`} className="flex items-center gap-3 border-t border-accent/8 px-3.5 py-2.5 text-text first-of-type:border-t-0 hover:bg-accent/5 hover:text-text">
            <CoinTile symbol={r.coinSymbol ?? r.slug} on={i === 0 && r.online > 0} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="truncate text-sm font-semibold">{r.title}</b>
              <span className="mono truncate text-[11px] text-muted">{r.isLive ? (r.liveTitle ?? "live now") : (r.topic ?? (r.access === "gated" ? "holders only" : "open room"))}</span>
            </span>
            <span className="mono flex flex-col items-end gap-0.5 text-[11px]">
              <b className="font-semibold text-text">{r.online}</b>
              <span className="text-dim">ONLINE</span>
            </span>
          </Link>
        ))}
      </section>

      <Link href="/explore?tab=users" className="block border border-accent bg-gradient-to-br from-accent/16 to-accent/3 p-4 shadow-[0_0_24px_rgba(46,168,255,0.18)]">
        <span className="label block text-[10px]">// ACCESS KEYS</span>
        <span className="mt-1.5 block text-lg font-bold leading-tight text-text">Key holders share the room&apos;s fees.</span>
        <span className="mt-1.5 block text-[13px] leading-relaxed text-[#9FB3C6]">Every swap made inside a room pays a fee. Part of it streams to the people who hold that room&apos;s keys.</span>
        <span className="btn btn-on mt-3 h-auto py-[7px] text-[11px]">SEE KEYS</span>
      </Link>

      <section className="panel">
        <header className="label border-b border-accent/16 px-3.5 py-3">// ACTIVITY</header>
        {feed.length === 0 && <p className="px-3.5 py-4 text-sm text-muted">Nothing yet.</p>}
        {feed.map((f, i) => (
          <div key={i} className="mono flex items-baseline gap-2.5 border-t border-accent/8 px-3.5 py-2 text-[11.5px] leading-normal first-of-type:border-t-0">
            <span className={`w-11 flex-none font-bold ${KIND_COLOR[f.kind]}`}>{f.kind}</span>
            <span className="flex-1 text-soft">{f.text}</span>
            <span className="text-dim">{ago(f.at)}</span>
          </div>
        ))}
      </section>

      <p className="mono text-[10.5px] leading-relaxed tracking-[0.04em] text-dim">
        <Link href="/terms" className="text-dim">TERMS</Link> · <Link href="/privacy" className="text-dim">PRIVACY</Link> · BUILT ON BASE
      </p>
    </aside>
  );
}

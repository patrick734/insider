import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Empty, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { MarkRead } from "@/components/mark-read";
import { getMe } from "@/server/auth";
import { notifications } from "@/server/queries";
import { ago, eth, pct } from "@/lib/format";
import type { Notification } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

const FILTERS = [
  ["all", "All", null],
  ["mentions", "Mentions", ["mention", "reply"]],
  ["trades", "Trades", ["call_up", "tip"]],
  ["keys", "Keys", ["key_bought", "key_sold", "fees_streamed"]],
  ["rooms", "Rooms", ["room_live"]],
] as const;

/** Each notification kind: its tag, whether it's a highlight, and its text. */
function render(n: Notification): { tag: string; hot: boolean; who: string; what: string; sub: string; href: string } {
  const d = n.data as Record<string, string | number | null>;
  const who = n.actor ? `@${n.actor.handle ?? n.actor.address.slice(0, 8)}` : "";
  const href = n.actor ? `/u/${n.actor.handle ?? n.actor.address}` : "/";
  switch (n.kind) {
    case "key_bought":
      return { tag: "KEY", hot: true, who, what: `bought ${d.amount} of your keys`, sub: d.earnedWei ? `You earned ${eth(String(d.earnedWei))} · key price ${eth(String(d.priceWei))}` : "", href };
    case "key_sold":
      return { tag: "KEY", hot: true, who, what: `sold ${d.amount} of your keys`, sub: d.priceWei ? `Key price is now ${eth(String(d.priceWei))}` : "", href };
    case "fees_streamed":
      return { tag: "FEE", hot: true, who: "Room fees", what: "streamed to you", sub: `${eth(String(d.amountWei))} from the ${d.title ?? "room"} · see Wallet`, href: "/wallet?tab=rooms" };
    case "room_live":
      return { tag: "LIVE", hot: true, who, what: `went live in the ${d.title || "room"}`, sub: "Tap to join", href: `/rooms/${d.room}` };
    case "tip":
      return { tag: "TIP", hot: false, who, what: `tipped you ${eth(String(d.amountWei))}`, sub: d.excerpt ? `on: "${d.excerpt}"` : "", href };
    case "mention":
      return { tag: "@", hot: false, who, what: "mentioned you", sub: d.excerpt ? `"${d.excerpt}"` : "", href: d.postId ? `/p/${d.postId}` : href };
    case "reply":
      return { tag: "RE", hot: false, who, what: "replied to you", sub: d.excerpt ? `"${d.excerpt}"` : "", href: d.postId ? `/p/${d.postId}` : href };
    case "follow":
      return { tag: "FOLLOW", hot: false, who, what: d.others ? `and ${d.others} others followed you` : "followed you", sub: "", href };
    case "call_up":
      return { tag: "CALL", hot: false, who: `$${d.symbol}`, what: `is ${pct(Number(d.changePct))} since your call`, sub: "Checked on Base", href: "/" };
    default:
      return { tag: "•", hot: false, who, what: n.kind, sub: "", href };
  }
}

export default async function Notifications({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/");
  const key = (await searchParams).f;
  const f = FILTERS.find(([k]) => k === key) ?? FILTERS[0];
  const all = await notifications(me.id);
  const list = f[2] ? all.filter((n) => (f[2] as readonly string[]).includes(n.kind)) : all;
  const dayAgo = Date.now() - 86_400_000;
  const groups = [
    ["// TODAY", list.filter((n) => new Date(n.createdAt).getTime() > dayAgo)],
    ["// EARLIER", list.filter((n) => new Date(n.createdAt).getTime() <= dayAgo)],
  ] as const;
  return (
    <>
      <Main>
        <MarkRead />
        <PageHeader title="Notifications" tabs={FILTERS.map(([k, label]) => ({ label, href: k === "all" ? "/notifications" : `/notifications?f=${k}`, selected: k === f[0] }))} />
        {list.length === 0 && <Empty title="// NOTHING HERE YET">Key trades, fee payouts, rooms going live, tips and mentions show up here.</Empty>}
        {groups.map(([label, items]) =>
          items.length ? (
            <section key={label}>
              <div className="label px-4 pb-2 pt-4 sm:px-5">{label}</div>
              {items.map((n) => {
                const r = render(n);
                return (
                  <Link key={n.id} href={r.href} className={`flex items-start gap-3.5 border-b border-line px-4 py-3.5 text-text hover:text-text sm:px-5 ${n.read ? "" : "bg-accent/5"}`}>
                    <span className={`mono grid h-[30px] w-[52px] flex-none place-items-center text-[10px] font-bold tracking-[0.1em] ${r.hot ? "bg-accent text-on-accent shadow-[0_0_12px_rgba(46,168,255,0.4)]" : "border border-accent/40 text-accent-soft"}`}>
                      {r.tag}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[15px] leading-snug">
                        <b className="font-semibold">{r.who}</b> {r.what}
                      </span>
                      {r.sub && <span className="mono text-[11.5px] leading-normal text-muted">{r.sub}</span>}
                    </span>
                    <span className="mono flex flex-col items-end gap-2 text-[11px] text-dim">
                      {ago(n.createdAt)}
                      {!n.read && <span className="dot !h-2 !w-2" />}
                    </span>
                  </Link>
                );
              })}
            </section>
          ) : null,
        )}
      </Main>
      <Rail />
    </>
  );
}

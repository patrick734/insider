"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, LogoMark, Wordmark, type IconName } from "./icons";
import { Avatar } from "./avatar";
import { readClient, useSession } from "@/lib/session";
import { eth } from "@/lib/format";

type Counts = { notifications: number; messages: number };

const MAIN: { href: string; label: string; icon: IconName; badge?: keyof Counts }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "explore" },
  { href: "/rooms", label: "Rooms", icon: "rooms" },
  { href: "/notifications", label: "Notifications", icon: "bell", badge: "notifications" },
  { href: "/messages", label: "Messages", icon: "messages", badge: "messages" },
  { href: "/wallet", label: "Wallet", icon: "wallet" },
  { href: "/announcements", label: "Announcements", icon: "announce" },
  { href: "/articles", label: "Articles", icon: "articles" },
];

export const MORE: { href: string; label: string; icon: IconName; tag?: string }[] = [
  { href: "/bookmarks", label: "Bookmarks", icon: "bookmark" },
  { href: "/watchlist", label: "Watchlist", icon: "star" },
  { href: "/wallet?tab=keys", label: "Keys portfolio", icon: "key" },
  { href: "/explore?tab=users", label: "Leaderboard", icon: "board" },
  { href: "/invite", label: "Invite & earn", icon: "plus", tag: "FEE SHARE" },
  { href: "/fees", label: "Fee discounts", icon: "discount" },
  { href: "/launch", label: "Launch a coin", icon: "rocket", tag: "LATER" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Unread badges, refreshed every 30 seconds while signed in. */
export function useCounts(initial: Counts): Counts {
  const { me } = useSession();
  const [c, setC] = useState(initial);
  useEffect(() => {
    if (!me) return;
    const tick = () => fetch("/api/counts").then((r) => (r.ok ? r.json() : null)).then((x) => x && setC(x)).catch(() => {});
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [me]);
  return c;
}

/** Desktop left menu. */
export function SideNav({ counts: initial }: { counts: Counts }) {
  const path = usePathname();
  const { me, login } = useSession();
  const counts = useCounts(initial);
  const [more, setMore] = useState(false);
  return (
    <nav aria-label="Main" className="sticky top-0 flex h-dvh w-[250px] flex-col gap-1 overflow-y-auto px-4 py-[18px] [&>*]:flex-none">
      <Link href="/" aria-label="Insider home" className="flex items-center gap-2.5 px-1.5 pb-4 pt-1 text-text hover:text-text">
        <LogoMark />
        <Wordmark />
      </Link>
      <Link href="/host" className="mb-3.5 block border border-accent bg-accent/8 p-3 shadow-[0_0_18px_rgba(46,168,255,0.15)]">
        <span className="label block text-[10px]">// FOUNDING HOSTS</span>
        <span className="mono mt-1 block text-[13px] font-bold tracking-[0.1em] text-text">HOST A ROOM. EARN THE FEES.</span>
      </Link>
      {MAIN.map((n) => {
        const on = isActive(path, n.href);
        const badge = n.badge ? counts[n.badge] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex h-11 items-center gap-3.5 border-l-2 px-3 text-[15px] ${on ? "border-accent bg-accent/10 font-bold text-text" : "border-transparent font-medium text-[#9FB3C6] hover:text-text"}`}
          >
            <Icon name={n.icon} />
            <span className="flex-1">{n.label}</span>
            {badge > 0 && <span className="mono bg-accent px-1.5 text-[10px] font-bold text-on-accent">{badge > 99 ? "99+" : badge}</span>}
          </Link>
        );
      })}
      <button
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className={`flex h-11 items-center gap-3.5 border-l-2 px-3 text-left text-[15px] ${more ? "border-accent bg-accent/10 font-bold text-text" : "border-transparent font-medium text-[#9FB3C6] hover:text-text"}`}
      >
        <Icon name="more" />
        More
      </button>
      {more && (
        <div role="menu" className="mb-1.5 mt-1 border border-accent/40 bg-[#02070D] shadow-[0_0_30px_rgba(46,168,255,0.15)]">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} role="menuitem" className="flex justify-between border-t border-accent/10 px-3.5 py-2.5 text-sm text-soft first:border-t-0 hover:text-text">
              {m.label}
              {m.tag && <span className="mono text-[10px] tracking-[0.1em] text-dim">{m.tag}</span>}
            </Link>
          ))}
        </div>
      )}
      <Link href="/?compose=1" className="btn btn-on mt-3.5 h-[46px] text-[13px] tracking-[0.18em]">
        POST
      </Link>
      <div className="mt-auto flex items-center gap-2.5 pt-6">
        {me ? (
          <Link href={`/u/${me.handle ?? me.address}`} className="flex min-w-0 flex-1 items-center gap-2.5 text-text hover:text-text">
            <Avatar user={me} size={36} />
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-sm font-semibold">{me.name || me.handle || "You"}</b>
              <span className="mono truncate text-[11px] text-muted">@{me.handle ?? "set-a-handle"}</span>
            </span>
          </Link>
        ) : (
          <button onClick={login} className="btn btn-off w-full">
            SIGN IN
          </button>
        )}
      </div>
    </nav>
  );
}

/** Mobile: top bar (avatar opens the drawer, balance opens the wallet), bottom tabs and the drawer. */
export function MobileChrome({ counts: initial }: { counts: Counts }) {
  const path = usePathname();
  const { me, login, logout } = useSession();
  const balanceWei = useBalance();
  const counts = useCounts(initial);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  // Inside a room or a chat the composer takes the bottom of the screen.
  const immersive = /^\/rooms\/[^/]+$/.test(path) || /^\/messages\/[^/]+$/.test(path);
  const tabs: { href: string; label: string; icon: IconName; badge?: number }[] = [
    { href: "/", label: "HOME", icon: "home" },
    { href: "/explore", label: "EXPLORE", icon: "explore" },
    { href: "/rooms", label: "ROOMS", icon: "rooms" },
    { href: "/notifications", label: "ALERTS", icon: "bell", badge: counts.notifications },
    { href: "/messages", label: "MESSAGES", icon: "messages", badge: counts.messages },
  ];
  return (
    <>
      {!immersive && (
        <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-accent/22 bg-black/90 px-4 backdrop-blur lg:hidden">
          {me ? (
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="tile h-8 w-8 border-accent text-[11px] text-accent">
              <Avatar user={me} size={32} />
            </button>
          ) : (
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-muted">
              <Icon name="more" size={22} />
            </button>
          )}
          <Link href="/" className="flex items-center gap-2 text-text hover:text-text">
            <LogoMark size={24} />
            <Wordmark size={13} />
          </Link>
          {me ? (
            <Link href="/wallet" aria-label="Wallet" className="mono flex h-[30px] items-center gap-1.5 border border-accent/40 px-2.5 text-[11.5px] text-text">
              <span className="dot !h-1.5 !w-1.5" />
              {balanceWei ? eth(balanceWei) : "WALLET"}
            </Link>
          ) : (
            <button onClick={login} className="btn btn-on h-[30px] px-3 text-[10px]">
              SIGN IN
            </button>
          )}
        </header>
      )}

      {!immersive && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(64px+env(safe-area-inset-bottom))] border-t border-accent/25 bg-black/95 pb-[env(safe-area-inset-bottom)] lg:hidden">
          {tabs.map((t) => {
            const on = isActive(path, t.href);
            return (
              <Link key={t.href} href={t.href} aria-label={t.label} className={`relative flex flex-1 flex-col items-center justify-center gap-1 ${on ? "text-accent drop-shadow-[0_0_6px_rgba(46,168,255,0.6)]" : "text-muted"}`}>
                <span className={`absolute -top-px left-[28%] right-[28%] h-0.5 ${on ? "bg-accent" : ""}`} />
                <Icon name={t.icon} size={22} />
                <span className="mono text-[9.5px] tracking-[0.12em]">{t.label}</span>
                {!!t.badge && <span className="mono absolute left-[calc(50%+6px)] top-1.5 bg-accent px-1 text-[9px] font-bold text-on-accent">{t.badge}</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
          <aside aria-label="Menu" className="absolute inset-y-0 left-0 flex w-[304px] flex-col border-r border-accent/45 bg-[#02070D] shadow-[0_0_40px_rgba(46,168,255,0.2)]">
            <div className="border-b border-accent/16 px-[18px] pb-4 pt-[calc(16px+env(safe-area-inset-top))]">
              {me ? (
                <>
                  <Avatar user={me} size={44} />
                  <b className="mt-2.5 block text-[17px]">{me.name || me.handle || "You"}</b>
                  <span className="mono text-[11px] text-muted">@{me.handle ?? "set-a-handle"}</span>
                </>
              ) : (
                <button onClick={login} className="btn btn-on w-full">
                  SIGN IN
                </button>
              )}
            </div>
            {me && (
              <Link href="/wallet" className="panel mx-[18px] mb-1 mt-3.5 flex items-center justify-between px-3 py-2.5 text-text">
                <span className="mono text-[10px] tracking-[0.14em] text-muted">WALLET</span>
                <b className="mono text-[15px]">{balanceWei ? eth(balanceWei) : "—"}</b>
              </Link>
            )}
            <div className="flex-1 overflow-y-auto py-1.5">
              {[
                { href: me ? `/u/${me.handle ?? me.address}` : "/settings", label: "Profile", icon: "user" as IconName },
                { href: "/announcements", label: "Announcements", icon: "announce" as IconName },
                { href: "/articles", label: "Articles", icon: "articles" as IconName },
                ...MORE,
              ].map((m) => (
                <Link key={m.href + m.label} href={m.href} className="flex h-11 items-center gap-3.5 px-[18px] text-[15px] text-soft hover:text-text">
                  <span className="text-muted">
                    <Icon name={m.icon} size={19} />
                  </span>
                  <span className="flex-1">{m.label}</span>
                  {"tag" in m && m.tag && <span className="mono text-[9.5px] tracking-[0.1em] text-dim">{m.tag}</span>}
                </Link>
              ))}
            </div>
            <Link href="/host" className="mx-[18px] block border border-accent bg-accent/8 p-3">
              <span className="label block text-[9.5px]">// FOUNDING HOSTS</span>
              <span className="mono mt-0.5 block text-xs font-bold tracking-[0.08em] text-text">HOST A ROOM. EARN THE FEES.</span>
            </Link>
            <div className="mono flex justify-between px-[18px] pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 text-[11px] text-muted">
              <Link href="/settings" className="text-muted">
                SETTINGS
              </Link>
              {me && (
                <button onClick={() => void logout()} className="text-muted">
                  LOG OUT
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

/** The signed-in wallet's ETH balance on Base, refreshed every 30 seconds. */
export function useBalance(): string | null {
  const { address } = useSession();
  const [b, setB] = useState<string | null>(null);
  useEffect(() => {
    if (!address) {
      setB(null);
      return;
    }
    const tick = () => readClient().getBalance({ address }).then((v) => setB(v.toString())).catch(() => {});
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [address]);
  return b;
}

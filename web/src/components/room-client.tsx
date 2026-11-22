"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseEther, parseUnits, zeroAddress, erc20Abi } from "viem";
import type { Access, ChatMessage } from "@insider/core";
import { ADDRESSES, contractsDeployed } from "@insider/core/chain";
import { keysAbi, roomAccessAbi } from "@insider/core/abi";
import type { Post, RoomLite } from "@/lib/types";
import type { Me } from "@/lib/session";
import { readClient, txError, useSession } from "@/lib/session";
import { builderSuffix } from "@/lib/builder-code";
import { buyTotal, maxBuy, priceAt, sellNet } from "@/lib/curve";
import { ago, eth, pct, profileHref, usd } from "@/lib/format";
import { Avatar, CoinTile } from "./avatar";
import { Corners } from "./page";
import { Icon } from "./icons";
import { PostList } from "./post";
import { presenceText } from "./presence";

type Holder = { address: string; balance: number; handle: string | null; name: string | null };
type Trade = { txHash: string; side: "buy" | "sell"; amount: number; ethWei: string; at: string; who: string };
type Market = { priceUsd: number | null; mcUsd: number | null; change24h: number | null; volume24hUsd: number | null; spark: number[] } | null;
type Stats = { vol24hWei: string; toHolders24hWei: string; holders: number; keySupply: number };

const TAG_STYLE: Record<string, string> = {
  HOST: "bg-accent text-on-accent font-bold",
  MOD: "border border-accent text-accent",
  HOLDER: "border border-[#2A4058] text-[#9FB3C6]",
};
const tagClass = (badge: string | null) => (badge?.startsWith("KEY") ? "border border-accent text-accent" : TAG_STYLE[badge ?? "HOLDER"] ?? TAG_STYLE.HOLDER);

// ------------------------------------------------------------------ socket

// Socket events: RoomEvent plus ready / error / denied from the service.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SocketEvent = { type: string; [k: string]: any };

function useRoomSocket(slug: string, enabled: boolean, onEvent: (e: SocketEvent) => void) {
  const ws = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const connect = async () => {
      const t = await fetch(`/api/rooms/${slug}/ticket`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (stop) return;
      if (!t) return void (timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** tries++)));
      const s = new WebSocket(`${t.url}?ticket=${encodeURIComponent(t.ticket)}`);
      ws.current = s;
      s.onopen = () => {
        tries = 0;
        setConnected(true);
      };
      s.onmessage = (m) => {
        try {
          handler.current(JSON.parse(m.data));
        } catch {}
      };
      s.onclose = (e) => {
        setConnected(false);
        if (stop || e.code === 4003) return;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** tries++));
      };
    };
    void connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [slug, enabled]);

  const send = useCallback(
    async (body: string) => {
      if (ws.current?.readyState === WebSocket.OPEN) return ws.current.send(JSON.stringify({ type: "send", body }));
      // Socket down: the REST route applies the same checks and publishes to the room.
      const r = await fetch(`/api/rooms/${slug}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't send.");
      handler.current({ type: "message", message: j.message });
    },
    [slug],
  );
  const mod = useCallback((action: unknown) => ws.current?.send(JSON.stringify({ type: "mod", action })), []);
  return { connected, send, mod };
}

// ------------------------------------------------------------------ page

export function RoomClient(props: {
  room: RoomLite;
  me: Me | null;
  access: Access;
  initialMessages: ChatMessage[];
  stats: Stats;
  market: Market;
  gate: { coin: string | null; threshold: string } | null;
  holders: Holder[];
  trades: Trade[];
  calls: Post[];
}) {
  const { room, me, stats, market } = props;
  const { login } = useSession();
  const router = useRouter();
  const [access, setAccess] = useState(props.access);
  const [messages, setMessages] = useState(props.initialMessages);
  const [online, setOnline] = useState(room.online);
  const [live, setLive] = useState({ isLive: room.isLive, title: room.liveTitle });
  const [tab, setTab] = useState<"chat" | "trades" | "holders" | "calls">("chat");
  const [sheet, setSheet] = useState<null | "keys" | "trade">(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const isHost = me?.id === room.host.id;
  const isMod = isHost || access.role === "mod";
  const bottom = useRef<HTMLDivElement>(null);

  const { connected, send, mod } = useRoomSocket(room.slug, access.ok && !!me, (e) => {
    if (e.type === "message") {
      const msg = e.message as ChatMessage;
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m.slice(-300), msg]));
    }
    if (e.type === "deleted") setMessages((m) => m.filter((x) => x.id !== e.id));
    if (e.type === "presence" || e.type === "ready") setOnline(Number(e.online));
    if (e.type === "live") setLive({ isLive: Boolean(e.isLive), title: e.title ?? null });
    if (e.type === "error") setNotice(String(e.message));
    if (e.type === "denied") {
      setAccess((a) => ({ ...a, ok: false, reason: "no-key-or-coin" }));
      setNotice("Your key or coin balance changed, so you've left the room.");
    }
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, tab]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await send(body);
    } catch (e) {
      setNotice((e as Error).message);
      setDraft(body);
    }
  };

  const recheck = async () => {
    if (!me) return login();
    const a = (await fetch(`/api/rooms/${room.slug}/join`, { method: "POST" }).then((r) => r.json())) as Access;
    setAccess(a);
    if (a.ok) router.refresh();
    else setNotice("Still no key or coin on this wallet.");
  };

  return (
    <main className="min-w-0 flex-1 border-accent/18 bg-black/55 lg:border-r">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-accent/22 bg-black/90 px-4 backdrop-blur sm:px-5">
        <Link href="/rooms" aria-label="Back" className="mono text-lg text-text lg:hidden">
          ←
        </Link>
        <CoinTile symbol={room.coinSymbol ?? room.slug} size={34} on />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-base">{room.title}</b>
          <span className="mono truncate text-[10px] tracking-[0.1em] text-accent">
            {online > 0 ? `● ${online} ONLINE` : <span className="text-muted">{presenceText({ ...room, online }).text.toUpperCase()}</span>} · <span className="text-muted">{room.access === "gated" ? "HOLDERS ONLY" : "OPEN"}</span>
            {connected ? "" : access.ok && me ? <span className="text-dim"> · CONNECTING…</span> : ""}
          </span>
        </span>
        <button onClick={() => setSheet("keys")} className="btn btn-off h-[30px] px-2.5 text-[10px] xl:hidden">
          KEYS
        </button>
        <Link href={profileHref(room.host)} className="hidden items-center gap-2 text-text sm:flex">
          <span className="mono text-[11px] text-muted">HOST</span>
          <Avatar user={room.host} size={28} />
        </Link>
      </header>

      <div className="flex">
        <div className="flex min-h-[calc(100dvh-56px)] min-w-0 flex-1 flex-col">
          {/* Stats */}
          <div className="grid grid-cols-4 border-b border-accent/14">
            {[
              ["MCAP", usd(market?.mcUsd ?? null), ""],
              ["24H", pct(market?.change24h ?? null), (market?.change24h ?? 0) >= 0 ? "glow text-accent" : "text-muted"],
              ["HOLDERS", stats.holders ? String(stats.holders) : "—", ""],
              ["TO KEYS 24H", eth(stats.toHolders24hWei), "text-accent-soft"],
            ].map(([k, v, c]) => (
              <div key={k} className="px-4 py-2.5 sm:px-5">
                <span className="mono block text-[9px] tracking-[0.14em] text-muted">{k}</span>
                <b className={`mono mt-0.5 block text-sm font-bold sm:text-base ${c}`}>{v}</b>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="border-b border-accent/14 px-4 py-3 sm:px-5">
            {market?.spark?.length ? (
              <Spark values={market.spark} />
            ) : (
              <div className="art flex h-[92px] items-end p-3" style={{ ["--x" as string]: "80%", ["--y" as string]: "20%" }}>
                <span className="mono text-[10.5px] text-muted">{room.coinAddress ? "Chart shows once the coin trades on Base." : "No coin linked to this room yet."}</span>
              </div>
            )}
          </div>

          {/* Live bar */}
          {live.isLive && (
            <div className="mx-4 mt-3 flex items-center gap-3 border border-accent bg-gradient-to-r from-accent/14 to-accent/3 px-3.5 py-2.5 sm:mx-5">
              <span className="mono inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.14em] text-accent">
                <span className="dot" />
                LIVE
              </span>
              <b className="flex-1 truncate text-sm">{live.title ?? "Live now"}</b>
              <span className="mono text-[10.5px] text-muted">{online} IN THE ROOM</span>
            </div>
          )}

          {/* Tabs */}
          <nav role="tablist" className="mt-2 flex border-b border-accent/22">
            {(["chat", "trades", "holders", "calls"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="tab flex-1 text-center">
                {t}
              </button>
            ))}
          </nav>

          <div className="flex-1 pb-36 lg:pb-4">
            {tab === "chat" &&
              (access.ok ? (
                <div className="py-1.5">
                  {messages.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">No messages yet. Say hello.</p>}
                  {messages.map((m) => (
                    <ChatLine key={m.id} m={m} canMod={isMod && m.user?.id !== me?.id} onMod={(a) => mod(a)} />
                  ))}
                  <div ref={bottom} />
                </div>
              ) : (
                <GateCard room={room} access={access} gate={props.gate} signedIn={!!me} onLogin={login} onRecheck={() => void recheck()} onKeys={() => setSheet("keys")} />
              ))}
            {tab === "trades" && <Trades trades={props.trades} />}
            {tab === "holders" && <Holders holders={props.holders} host={room.host.address} />}
            {tab === "calls" && (props.calls.length ? <PostList posts={props.calls} compactCards /> : <p className="px-5 py-10 text-center text-sm text-muted">No calls from the host yet.</p>)}
          </div>

          {/* Composer (sticky on mobile) */}
          {access.ok && me && tab === "chat" && (
            <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-accent/25 bg-black/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 lg:sticky lg:px-5 lg:pb-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void submit()}
                placeholder={access.mutedUntil && new Date(access.mutedUntil) > new Date() ? "You're muted for now" : "Say something to holders"}
                aria-label="Message"
                className="input h-[42px] min-w-0 flex-1"
              />
              <button onClick={() => void submit()} aria-label="Send" className="btn btn-on h-[42px] w-[42px] p-0">
                <Icon name="send" size={18} />
              </button>
              {room.coinAddress && (
                <button onClick={() => setSheet("trade")} className="btn btn-off h-[42px] px-3 lg:hidden">
                  TRADE
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right panel (desktop) */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-56px)] w-[340px] flex-none flex-col gap-3 overflow-y-auto border-l border-accent/18 p-4 xl:flex [&>*]:flex-none">
          <KeysPanel room={room} me={me} supplyHint={stats.keySupply} heldHint={access.keys} onDone={() => router.refresh()} />
          {room.coinAddress && <TradePanel room={room} me={me} onDone={() => router.refresh()} />}
          {isHost && <HostTools room={room} live={live} gate={props.gate} onChange={() => router.refresh()} />}
        </aside>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button aria-label="Close" onClick={() => setSheet(null)} className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
          <section role="dialog" className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto border-t border-accent bg-[#02070D] px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-10px_40px_rgba(46,168,255,0.22)]">
            <div className="mx-auto mb-3.5 h-1 w-10 bg-accent-soft/35" />
            {sheet === "keys" && <KeysPanel room={room} me={me} supplyHint={stats.keySupply} heldHint={access.keys} onDone={() => (setSheet(null), router.refresh())} />}
            {sheet === "trade" && <TradePanel room={room} me={me} onDone={() => (setSheet(null), router.refresh())} />}
            {sheet === "keys" && isHost && (
              <div className="mt-3">
                <HostTools room={room} live={live} gate={props.gate} onChange={() => router.refresh()} />
              </div>
            )}
          </section>
        </div>
      )}

      {notice && <div className="mono fixed bottom-24 left-1/2 z-50 -translate-x-1/2 border border-accent bg-[#02070D] px-4 py-2.5 text-xs text-text shadow-[0_0_24px_rgba(46,168,255,0.3)] lg:bottom-6">{notice}</div>}
    </main>
  );
}

// ------------------------------------------------------------------ pieces

function Spark({ values }: { values: number[] }) {
  const w = 600;
  const h = 92;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - 6 - ((v - lo) / (hi - lo || 1)) * (h - 14)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-[92px] w-full" role="img" aria-label="Price over the last 24 hours">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2EA8FF" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2EA8FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#spark)" />
      <polyline points={pts} fill="none" stroke="#2EA8FF" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px rgba(46,168,255,0.8))" }} />
    </svg>
  );
}

function ChatLine({ m, canMod, onMod }: { m: ChatMessage; canMod: boolean; onMod: (a: unknown) => void }) {
  const trade = m.kind === "trade";
  return (
    <div className={`group flex flex-col gap-0.5 border-l-2 px-4 py-2 sm:px-5 ${trade ? "border-accent/50 bg-accent/4" : "border-transparent"}`}>
      <span className="mono flex items-center gap-2 text-[10.5px]">
        <span className={`px-1.5 text-[9.5px] tracking-[0.1em] ${trade ? (m.meta?.side === "sell" ? "border border-dim text-[#BFC9D4]" : "bg-accent/20 text-accent-soft") : tagClass(m.user?.badge ?? null)}`}>
          {trade ? String(m.meta?.side ?? "trade").toUpperCase() : (m.user?.badge ?? "")}
        </span>
        {m.user ? (
          <Link href={profileHref(m.user)} className="font-semibold text-text">
            @{m.user.handle ?? m.user.address.slice(0, 8)}
          </Link>
        ) : (
          <b className="text-text">system</b>
        )}
        <span className="text-dim">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {canMod && m.user && (
          <span className="ml-auto hidden gap-2 text-dim group-hover:flex">
            <button onClick={() => onMod({ type: "delete", messageId: m.id })}>DELETE</button>
            <button onClick={() => onMod({ type: "mute", userId: m.user!.id, minutes: 30 })}>MUTE 30M</button>
            <button onClick={() => confirm("Remove this person from the room?") && onMod({ type: "ban", userId: m.user!.id })}>REMOVE</button>
          </span>
        )}
      </span>
      <span className={trade ? "mono text-[11.5px] text-muted" : "whitespace-pre-wrap break-words text-sm leading-normal text-soft"}>{m.body}</span>
    </div>
  );
}

function GateCard(p: { room: RoomLite; access: Access; gate: { coin: string | null; threshold: string } | null; signedIn: boolean; onLogin: () => void; onRecheck: () => void; onKeys: () => void }) {
  const need = p.gate?.coin && BigInt(p.gate.threshold) > 0n;
  return (
    <div className="p-4 sm:p-5">
      <div className="panel p-5">
        <Corners />
        <span className="label">// {p.access.reason === "banned" ? "REMOVED" : "HOLDERS ONLY"}</span>
        <h2 className="mt-2 text-xl font-bold">{p.access.reason === "banned" ? "The host removed you from this room." : `Get into the ${p.room.title}`}</h2>
        {p.access.reason !== "banned" && (
          <>
            <ul className="mt-4 space-y-2.5 text-sm text-body">
              <li className="flex gap-2.5">
                <span className="dot mt-1.5 flex-none" />
                Hold at least one of @{p.room.host.handle}&apos;s keys. Keys also earn a share of the room&apos;s fees.
              </li>
              {need && (
                <li className="flex gap-2.5">
                  <span className="dot mt-1.5 flex-none" />
                  Or hold {formatEther(BigInt(p.gate!.threshold))} ${p.room.coinSymbol ?? "coin"} in this wallet.
                </li>
              )}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              {p.signedIn ? (
                <>
                  <button onClick={p.onKeys} className="btn btn-on">
                    BUY A KEY
                  </button>
                  <button onClick={p.onRecheck} className="btn btn-off">
                    CHECK AGAIN
                  </button>
                </>
              ) : (
                <button onClick={p.onLogin} className="btn btn-on">
                  SIGN IN TO JOIN
                </button>
              )}
            </div>
            <p className="mono mt-4 text-[10.5px] leading-relaxed text-dim">Access follows your live balance: sell the key or the coin and you leave the room.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Trades({ trades }: { trades: Trade[] }) {
  if (!trades.length) return <p className="px-5 py-10 text-center text-sm text-muted">No key trades yet.</p>;
  return (
    <div className="mono divide-line text-[12px]">
      {trades.map((t) => (
        <div key={t.txHash + t.amount} className="grid grid-cols-[70px_1fr_auto_44px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <span className={t.side === "buy" ? "font-bold text-accent" : "text-[#BFC9D4]"}>{t.side === "buy" ? "▲ BUY" : "▼ SELL"}</span>
          <span className="truncate text-soft">
            {t.who} · {t.amount} key{t.amount === 1 ? "" : "s"}
          </span>
          <span className="text-text">{eth(t.ethWei)}</span>
          <span className="text-right text-dim">{ago(t.at)}</span>
        </div>
      ))}
    </div>
  );
}

function Holders({ holders, host }: { holders: Holder[]; host: string }) {
  if (!holders.length) return <p className="px-5 py-10 text-center text-sm text-muted">No key holders yet.</p>;
  const top = holders[0].balance;
  return (
    <div className="divide-line">
      {holders.map((h, i) => (
        <Link key={h.address} href={`/u/${h.handle ?? h.address}`} className="flex items-center gap-3 px-4 py-2.5 text-text hover:text-text sm:px-5">
          <span className="mono w-6 text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
          <span className="flex-1 truncate">@{h.handle ?? h.address.slice(0, 8)}</span>
          <span className={`mono px-1.5 text-[9.5px] tracking-[0.1em] ${h.address === host ? TAG_STYLE.HOST : "border border-accent text-accent"}`}>{h.address === host ? "HOST" : `KEY×${h.balance}`}</span>
          <span className="hidden h-1.5 w-24 bg-accent/10 sm:block">
            <span className="block h-full bg-accent shadow-[0_0_8px_rgba(46,168,255,0.6)]" style={{ width: `${Math.round((h.balance / top) * 100)}%` }} />
          </span>
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ keys

export function KeysPanel({ room, me, supplyHint, heldHint = 0, onDone }: { room: RoomLite; me: Me | null; supplyHint: number; heldHint?: number; onDone: () => void }) {
  const { login, send } = useSession();
  const live = contractsDeployed();
  const host = room.host.address as `0x${string}`;
  const isHost = me?.id === room.host.id;
  const [supply, setSupply] = useState<bigint>(BigInt(supplyHint));
  const [mine, setMine] = useState<bigint>(BigInt(heldHint));
  const [rewards, setRewards] = useState<bigint>(0n);
  const [flipBps, setFlipBps] = useState<bigint>(0n);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!live) return;
    const c = readClient();
    const s = await c.readContract({ address: ADDRESSES.keys, abi: keysAbi, functionName: "supplyOf", args: [host] }).catch(() => null);
    if (s !== null) setSupply(s);
    if (me) {
      const [b, r, f] = await Promise.all([
        c.readContract({ address: ADDRESSES.keys, abi: keysAbi, functionName: "balanceOf", args: [host, me.address as `0x${string}`] }).catch(() => 0n),
        c.readContract({ address: ADDRESSES.keys, abi: keysAbi, functionName: "pendingRewards", args: [host, me.address as `0x${string}`] }).catch(() => 0n),
        c.readContract({ address: ADDRESSES.keys, abi: keysAbi, functionName: "flipFeeBps", args: [host, me.address as `0x${string}`] }).catch(() => 0n),
      ]);
      setMine(b);
      setRewards(r);
      setFlipBps(f);
    }
  }, [live, host, me]);
  useEffect(() => {
    void load();
  }, [load]);

  const max = side === "buy" ? maxBuy(supply) : Number(isHost ? (mine > 0n ? mine - 1n : 0n) : mine);
  const amount = BigInt(Math.max(1, Math.min(n, Math.max(1, max))));
  const total = side === "buy" ? buyTotal(supply, amount) : sellNet(supply, amount, flipBps);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!me) return login();
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} done.`);
      await load();
      setTimeout(onDone, 1500);
    } catch (e) {
      setMsg(txError(e));
    } finally {
      setBusy(false);
    }
  };

  const write = (functionName: "buyKeys" | "sellKeys" | "createMarket" | "claimRewards", args: readonly unknown[], value?: bigint) =>
    send((w) => w.writeContract({ account: w.account!, chain: w.chain, address: ADDRESSES.keys, abi: keysAbi, functionName, args, value, dataSuffix: builderSuffix() } as never));

  const noMarket = supply === 0n;

  return (
    <section className="panel p-4">
      <Corners />
      <div className="flex items-center gap-3">
        <Avatar user={room.host} size={40} on />
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate">@{room.host.handle}&apos;s keys</b>
          <span className="mono text-[10.5px] text-muted">
            {noMarket ? "NOT OPEN YET" : `${supply} KEYS · NEXT ${eth(priceAt(supply))}`}
          </span>
        </span>
      </div>

      {noMarket ? (
        isHost ? (
          <div className="mt-3.5">
            <p className="text-sm leading-relaxed text-soft">Open your keys: you buy and keep key 1. Holders get your room and a share of its fees.</p>
            <button disabled={busy || !live} onClick={() => void run("Keys opened", () => write("createMarket", [room.coinAddress ?? zeroAddress], (buyTotal(0n, 1n) * 101n) / 100n))} className="btn btn-on mt-3 h-11 w-full">
              {live ? `OPEN KEYS · ${eth(buyTotal(0n, 1n))}` : "KEYS AREN'T LIVE YET"}
            </button>
          </div>
        ) : (
          <p className="mt-3.5 text-sm text-muted">The host hasn&apos;t opened keys yet. You can still get in by holding the room&apos;s coin.</p>
        )
      ) : (
        <>
          <div className="mt-3.5 grid grid-cols-2 border border-accent/30">
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} onClick={() => (setSide(s), setN(1))} className={`mono h-10 text-xs font-bold tracking-[0.16em] ${side === s ? (s === "buy" ? "btn-on" : "btn-sell") : "text-muted"}`}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="mono text-[10px] tracking-[0.14em] text-muted">KEYS · MAX {max}</span>
            <span className="flex items-center">
              <button onClick={() => setN((x) => Math.max(1, x - 1))} className="mono grid h-9 w-9 place-items-center border border-accent/40 text-accent-soft">
                −
              </button>
              <b className="mono w-12 text-center text-xl">{amount.toString()}</b>
              <button onClick={() => setN((x) => Math.min(Math.max(1, max), x + 1))} className="mono grid h-9 w-9 place-items-center bg-accent text-on-accent">
                +
              </button>
            </span>
          </div>
          <div className="mono mt-3 space-y-1 text-[11.5px] text-muted">
            <div className="flex justify-between">
              <span>{side === "buy" ? "YOU PAY (INCL. 8% FEE)" : "YOU GET (AFTER FEES)"}</span>
              <b className="text-text">{eth(total)}</b>
            </div>
            {side === "sell" && flipBps > 0n && (
              <div className="flex justify-between">
                <span>FLIP FEE (DECAYS OVER 24H)</span>
                <span className="text-accent-soft">{(Number(flipBps) / 100).toFixed(2)}%</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>YOU HOLD</span>
              <span className="text-soft">{mine.toString()}</span>
            </div>
          </div>
          <button
            disabled={busy || !live || (side === "sell" && max < 1)}
            onClick={() =>
              void run(side === "buy" ? "Buy" : "Sell", () =>
                side === "buy" ? write("buyKeys", [host, amount], (total * 101n) / 100n) : write("sellKeys", [host, amount, (total * 98n) / 100n]),
              )
            }
            className={`btn mt-3 h-11 w-full text-xs ${side === "buy" ? "btn-on" : "btn-sell"}`}
          >
            {!live ? "KEYS AREN'T LIVE YET" : busy ? "CONFIRM IN WALLET…" : `${side === "buy" ? "BUY" : "SELL"} ${amount} KEY${amount === 1n ? "" : "S"}`}
          </button>
          {rewards > 0n && (
            <div className="mt-3 flex items-center justify-between border-t border-accent/16 pt-3">
              <span className="mono text-[11px] text-muted">
                ROOM REWARDS <b className="text-accent">{eth(rewards)}</b>
              </span>
              <button disabled={busy} onClick={() => void run("Claim", () => write("claimRewards", [host]))} className="btn btn-off h-8 px-3">
                CLAIM
              </button>
            </div>
          )}
          <p className="mono mt-3 text-[10px] leading-relaxed text-dim">Holders share 2% of key trades and 20% of in-app swap fees in this room, streamed over 3 days. Sell cooldown 30 min after a buy.</p>
        </>
      )}
      {msg && <p className="mono mt-2.5 text-[11px] text-accent-soft">{msg}</p>}
    </section>
  );
}

// ------------------------------------------------------------------ swap

function TradePanel({ room, me, onDone }: { room: RoomLite; me: Me | null; onDone: () => void }) {
  const { login, send } = useSession();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.01");
  const [quote, setQuote] = useState<null | { buyAmount: string; minBuyAmount: string; allowanceTarget: string | null; tx: { to: `0x${string}`; data: `0x${string}`; value: string }; roomId: string }>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const symbol = room.coinSymbol ?? "COIN";

  const raw = useMemo(() => {
    try {
      return side === "buy" ? parseEther(amount || "0") : parseUnits(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount, side]);

  const getQuote = async () => {
    if (!me) return login();
    setBusy(true);
    setMsg(null);
    setQuote(null);
    const r = await fetch("/api/swap/quote", { method: "POST", body: JSON.stringify({ room: room.slug, side, amount: raw.toString() }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "No quote right now.");
    setQuote(j);
  };

  const execute = async () => {
    if (!quote || !me) return;
    setBusy(true);
    setMsg(null);
    try {
      if (side === "sell" && quote.allowanceTarget) {
        await send((w) =>
          w.writeContract({ account: w.account!, chain: w.chain, address: room.coinAddress as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [quote.allowanceTarget as `0x${string}`, raw] }),
        );
      }
      const suffix = builderSuffix();
      const hash = await send((w) =>
        w.sendTransaction({ account: w.account!, chain: w.chain, to: quote.tx.to, data: suffix ? ((quote.tx.data + suffix.slice(2)) as `0x${string}`) : quote.tx.data, value: BigInt(quote.tx.value || "0") }),
      );
      await fetch("/api/swap/record", {
        method: "POST",
        body: JSON.stringify({ txHash: hash, roomId: quote.roomId, coin: room.coinAddress, side, ethWei: side === "buy" ? raw.toString() : quote.buyAmount, tokenAmount: side === "buy" ? quote.buyAmount : raw.toString() }),
      });
      setMsg("Swap done.");
      setQuote(null);
      setTimeout(onDone, 1500);
    } catch (e) {
      setMsg(txError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-4">
      <Corners />
      <div className="flex items-center justify-between">
        <b className="text-[17px]">Trade ${symbol}</b>
        <span className="mono text-[10px] text-muted">IN THIS ROOM</span>
      </div>
      <div className="mt-3 grid grid-cols-2 border border-accent/30">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => (setSide(s), setQuote(null), setAmount(s === "buy" ? "0.01" : "1000"))} className={`mono h-10 text-xs font-bold tracking-[0.16em] ${side === s ? (s === "buy" ? "btn-on" : "btn-sell") : "text-muted"}`}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>
      <label className="panel mt-3 block px-3.5 py-3">
        <span className="mono text-[10px] tracking-[0.14em] text-muted">{side === "buy" ? "YOU PAY (ETH)" : `YOU SELL (${symbol})`}</span>
        <input value={amount} onChange={(e) => (setAmount(e.target.value.replace(/[^0-9.]/g, "")), setQuote(null))} inputMode="decimal" className="mono mt-1 w-full bg-transparent text-[26px] font-bold outline-none" />
      </label>
      {side === "buy" && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {["0.01", "0.05", "0.1", "0.5"].map((v) => (
            <button key={v} onClick={() => (setAmount(v), setQuote(null))} className={`mono h-8 border text-xs ${amount === v ? "border-accent bg-accent/14 text-text" : "border-accent/25 text-accent-soft"}`}>
              {v}
            </button>
          ))}
        </div>
      )}
      {quote && (
        <div className="mono mt-3 space-y-1 text-[11.5px] text-muted">
          <div className="flex justify-between">
            <span>YOU GET ABOUT</span>
            <b className="text-text">{side === "buy" ? `${Number(formatEther(BigInt(quote.buyAmount))).toLocaleString()} ${symbol}` : eth(quote.buyAmount)}</b>
          </div>
          <div className="flex justify-between">
            <span>ROOM FEE · HOST + KEY HOLDERS</span>
            <span className="text-accent-soft">1%</span>
          </div>
        </div>
      )}
      <button disabled={busy || raw === 0n} onClick={() => void (quote ? execute() : getQuote())} className={`btn mt-3 h-12 w-full text-[13px] tracking-[0.18em] ${side === "buy" ? "btn-on" : "btn-sell"}`}>
        {busy ? "WORKING…" : quote ? `EXECUTE ${side.toUpperCase()}` : "GET QUOTE"}
      </button>
      {msg && <p className="mono mt-2.5 text-[11px] text-accent-soft">{msg}</p>}
    </section>
  );
}

// ------------------------------------------------------------------ host

function HostTools({ room, live, gate, onChange }: { room: RoomLite; live: { isLive: boolean; title: string | null }; gate: { coin: string | null; threshold: string } | null; onChange: () => void }) {
  const { send } = useSession();
  const [title, setTitle] = useState(live.title ?? "");
  const [threshold, setThreshold] = useState(gate?.threshold && gate.threshold !== "0" ? formatEther(BigInt(gate.threshold)) : "");
  const [msg, setMsg] = useState<string | null>(null);

  const patch = async (b: Record<string, unknown>) => {
    const r = await fetch(`/api/rooms/${room.slug}`, { method: "PATCH", body: JSON.stringify(b) });
    setMsg(r.ok ? "Saved." : ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
    if (r.ok) onChange();
  };

  const setGate = async () => {
    if (!room.coinAddress) return setMsg("Link a coin to the room first.");
    try {
      const t = parseUnits(threshold || "0", 18);
      await send((w) =>
        w.writeContract({ account: w.account!, chain: w.chain, address: ADDRESSES.roomAccess, abi: roomAccessAbi, functionName: "setCoinGate", args: [t > 0n ? (room.coinAddress as `0x${string}`) : zeroAddress, t], dataSuffix: builderSuffix() }),
      );
      setMsg("Coin gate set on-chain.");
      onChange();
    } catch (e) {
      setMsg(txError(e));
    }
  };

  return (
    <section className="panel p-4">
      <span className="label">// HOST TOOLS</span>
      <div className="mt-3 flex gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the call about?" className="input h-9 min-w-0 flex-1 text-sm" />
        <button onClick={() => void patch(live.isLive ? { isLive: false } : { isLive: true, liveTitle: title || "Live now" })} className={`btn h-9 ${live.isLive ? "btn-sell" : "btn-on"}`}>
          {live.isLive ? "END LIVE" : "GO LIVE"}
        </button>
      </div>
      <div className="mono mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>SLOW MODE</span>
        <select onChange={(e) => void patch({ slowModeSeconds: Number(e.target.value) })} defaultValue="" className="border border-accent/30 bg-black px-1.5 py-1 text-text">
          <option value="" disabled>
            SET…
          </option>
          {[0, 5, 15, 30, 60, 300].map((s) => (
            <option key={s} value={s}>
              {s ? `${s}s` : "OFF"}
            </option>
          ))}
        </select>
      </div>
      <div className="mono mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>ACCESS</span>
        <span className="flex gap-1.5">
          <button onClick={() => void patch({ access: "gated" })} className={`chip ${room.access === "gated" ? "chip-on" : ""}`}>
            HOLDERS
          </button>
          <button onClick={() => void patch({ access: "open" })} className={`chip ${room.access === "open" ? "chip-on" : ""}`}>
            OPEN
          </button>
        </span>
      </div>
      {room.coinAddress && contractsDeployed() && (
        <div className="mt-3 border-t border-accent/16 pt-3">
          <span className="mono text-[10px] tracking-[0.14em] text-muted">COIN HOLDERS GET IN WITH AT LEAST</span>
          <div className="mt-1.5 flex gap-2">
            <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="input mono h-9 min-w-0 flex-1 text-sm" />
            <button onClick={() => void setGate()} className="btn btn-off h-9">
              SET
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mono mt-2.5 text-[11px] text-accent-soft">{msg}</p>}
    </section>
  );
}

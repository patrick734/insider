"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { Icon } from "./icons";

/** Star a coin onto your watchlist (or take it off). */
export function WatchButton({ coin, watching: initial }: { coin: string; watching: boolean }) {
  const { me, login } = useSession();
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const toggle = async () => {
    if (!me) return login();
    setOn(!on);
    const r = on ? await fetch(`/api/watchlist?coin=${coin}`, { method: "DELETE" }) : await fetch("/api/watchlist", { method: "POST", body: JSON.stringify({ coin }) });
    if (!r.ok) setOn(on);
    router.refresh();
  };
  return (
    <button onClick={() => void toggle()} aria-pressed={on} aria-label={on ? "Remove from watchlist" : "Add to watchlist"} className={on ? "text-accent drop-shadow-[0_0_6px_rgba(46,168,255,0.6)]" : "text-dim hover:text-text"}>
      <Icon name="star" size={18} />
    </button>
  );
}

/** Add any Base coin by address. */
export function AddCoin() {
  const router = useRouter();
  const [coin, setCoin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setError(null);
    const r = await fetch("/api/watchlist", { method: "POST", body: JSON.stringify({ coin: coin.trim() }) });
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add it.");
    setCoin("");
    router.refresh();
  };
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex gap-2">
        <input value={coin} onChange={(e) => setCoin(e.target.value)} placeholder="Coin address on Base (0x…)" className="input mono min-w-0 flex-1 text-xs" />
        <button onClick={() => void add()} disabled={!/^0x[0-9a-fA-F]{40}$/.test(coin.trim())} className="btn btn-on h-10">
          ADD
        </button>
      </div>
      {error && <p className="mono mt-2 text-[11px] text-accent-soft">{error}</p>}
    </div>
  );
}

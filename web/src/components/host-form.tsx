"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { SITE } from "@/lib/config";

export function HostForm({ signedIn, hasHandle }: { signedIn: boolean; hasHandle: boolean }) {
  const { login } = useSession();
  const router = useRouter();
  const [f, setF] = useState({ title: "", slug: "", topic: "", coin: "", access: "gated" as "gated" | "open" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn)
    return (
      <div className="px-5 py-8 text-center">
        <button onClick={login} className="btn btn-on">
          SIGN IN TO HOST
        </button>
      </div>
    );
  if (!hasHandle)
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        Pick a handle in <Link href="/settings">Settings</Link> first.
      </p>
    );

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/rooms", { method: "POST", body: JSON.stringify({ ...f, coin: f.coin.trim() || undefined }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "Couldn't open the room.");
    router.push(`/rooms/${j.slug}`);
  };

  return (
    <div className="space-y-3 px-4 py-5 sm:px-5">
      <span className="label">// OPEN A ROOM</span>
      <input
        value={f.title}
        onChange={(e) => setF({ ...f, title: e.target.value, slug: f.slug || "" })}
        onBlur={() => !f.slug && setF((x) => ({ ...x, slug: x.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) }))}
        maxLength={60}
        placeholder="Room name, e.g. $GRID room"
        className="input"
      />
      <label className="mono flex items-center gap-2 text-xs text-muted">
        {SITE.domain}/rooms/
        <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={32} placeholder="grid" className="input h-9 flex-1" />
      </label>
      <input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={120} placeholder="What the room is about (optional)" className="input" />
      <input value={f.coin} onChange={(e) => setF({ ...f, coin: e.target.value.trim() })} placeholder="Community coin address on Base (optional)" className="input mono text-xs" />
      <div className="mono flex items-center gap-2 text-[11px] text-muted">
        WHO CAN CHAT
        <button onClick={() => setF({ ...f, access: "gated" })} className={`chip ${f.access === "gated" ? "chip-on" : ""}`}>
          HOLDERS ONLY
        </button>
        <button onClick={() => setF({ ...f, access: "open" })} className={`chip ${f.access === "open" ? "chip-on" : ""}`}>
          ANYONE
        </button>
      </div>
      {error && <p className="mono text-[11px] text-accent-soft">{error}</p>}
      <button disabled={busy || !f.title.trim() || f.slug.length < 2} onClick={() => void create()} className="btn btn-on h-11 w-full">
        {busy ? "OPENING…" : "OPEN THE ROOM"}
      </button>
      <p className="mono text-[10.5px] leading-relaxed text-dim">After it opens, set the coin balance that lets holders in and open your keys from the room&apos;s host tools.</p>
    </div>
  );
}

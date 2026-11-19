"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { displayName } from "@/lib/format";
import { Avatar } from "./avatar";

type Host = { id: string; address: string; handle: string | null; name: string | null; avatarUrl: string | null; bio: string | null; members: number };

/** First sign-in: handle and name, then follow some hosts. */
export function WelcomeForm({ me, hosts }: { me: { handle: string; name: string }; hosts: Host[] }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [step, setStep] = useState<"name" | "follow">(me.handle ? "follow" : "name");
  const [handle, setHandle] = useState(me.handle);
  const [name, setName] = useState(me.name);
  const [follows, setFollows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/me", { method: "PATCH", body: JSON.stringify({ handle, name: name || undefined }) });
    setBusy(false);
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
    await refresh();
    setStep("follow");
  };

  const follow = async (id: string) => {
    setFollows((s) => new Set(s).add(id));
    await fetch(`/api/follow/${id}`, { method: "POST" });
  };

  if (step === "name")
    return (
      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="mono mb-1.5 block text-[10px] tracking-[0.14em] text-muted">HANDLE</span>
          <div className="flex items-center gap-1">
            <span className="mono text-muted">@</span>
            <input autoFocus value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="yourname" className="input" />
          </div>
          <span className="mono mt-1 block text-[10px] text-dim">3 to 20 letters, numbers or underscores.</span>
        </label>
        <label className="block">
          <span className="mono mb-1.5 block text-[10px] tracking-[0.14em] text-muted">NAME (OPTIONAL)</span>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} className="input" />
        </label>
        {error && <p className="mono text-[11px] text-accent-soft">{error}</p>}
        <button disabled={busy || handle.length < 3} onClick={() => void save()} className="btn btn-on h-11 w-full">
          {busy ? "SAVING…" : "CONTINUE"}
        </button>
      </div>
    );

  return (
    <div className="mt-8">
      <span className="label">// HOSTS TO FOLLOW</span>
      <div className="mt-3 space-y-2">
        {hosts.length === 0 && <p className="text-sm text-muted">Hosts show up here once the first rooms open.</p>}
        {hosts.map((h) => (
          <div key={h.id} className="panel flex items-center gap-3 p-3">
            <Avatar user={h} size={40} />
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate">{displayName(h)}</b>
              <span className="mono truncate text-[11px] text-muted">
                @{h.handle} · {h.members} in their rooms
              </span>
            </span>
            <button disabled={follows.has(h.id)} onClick={() => void follow(h.id)} className={`btn h-8 px-3 ${follows.has(h.id) ? "btn-off" : "btn-on"}`}>
              {follows.has(h.id) ? "FOLLOWING" : "FOLLOW"}
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => router.push("/rooms")} className="btn btn-on mt-6 h-11 w-full">
        FIND A ROOM
      </button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";

/** The "What's the call?" box. Posts to the timeline or, if you're in rooms, into one of them. */
export function Composer({ rooms, autoFocus = false }: { rooms: { id: string; title: string }[]; autoFocus?: boolean }) {
  const { me, login } = useSession();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async () => {
    if (!me) return login();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/posts", { method: "POST", body: JSON.stringify({ body, roomId: roomId || null }) });
    setBusy(false);
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't post.");
    setBody("");
    router.refresh();
  };

  return (
    <section aria-label="Write a post" className="flex gap-3 border-b border-line px-4 py-4 sm:px-5">
      {me ? <Avatar user={me} size={42} on /> : <span className="tile tile-on h-[42px] w-[42px] text-[13px]">?</span>}
      <div className="min-w-0 flex-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          onFocus={() => !me && login()}
          autoFocus={autoFocus}
          placeholder="What's the call?"
          rows={2}
          className="w-full resize-none bg-transparent pt-2 text-lg outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-accent/10 pt-3">
          <span className="mono text-[10.5px] text-dim">{body.length}/500</span>
          <span className="flex-1" />
          <label className="mono flex items-center gap-1.5 text-[10.5px] tracking-[0.12em] text-muted">
            POST TO
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="border border-accent/30 bg-black px-1.5 py-1 font-bold text-text outline-none">
              <option value="">TIMELINE</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => void post()} disabled={busy || !body.trim()} className="btn btn-on">
            {busy ? "POSTING…" : "POST"}
          </button>
        </div>
        {error && <p className="mono mt-2 text-[11px] text-accent-soft">{error}</p>}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { UserLite } from "@/lib/types";
import { displayName, profileHref } from "@/lib/format";
import { Avatar } from "./avatar";
import { Icon } from "./icons";

type Msg = { id: string; body: string; createdAt: string; mine: boolean };

/** A direct-message conversation. New messages arrive by polling every few seconds (sockets are for rooms). */
export function DmClient({ other, initial }: { other: UserLite; initial: Msg[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const who = other.handle ?? other.address;

  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch(`/api/dm/${who}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (r?.messages) setMessages(r.messages);
    }, 5000);
    return () => clearInterval(t);
  }, [who]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const r = await fetch(`/api/dm/${who}`, { method: "POST", body: JSON.stringify({ body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error ?? "Couldn't send.");
      setDraft(body);
      return;
    }
    setError(null);
    setMessages(j.messages);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-accent/22 bg-black/90 px-4 backdrop-blur sm:px-5">
        <Link href="/messages?tab=dm" aria-label="Back" className="mono text-lg text-text">
          ←
        </Link>
        <Avatar user={other} size={34} on />
        <Link href={profileHref(other)} className="flex min-w-0 flex-1 flex-col text-text">
          <b className="truncate">{displayName(other)}</b>
          <span className="mono text-[10px] tracking-[0.1em] text-muted">DIRECT MESSAGE</span>
        </Link>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4 pb-28 sm:px-5 lg:pb-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Say hello to {displayName(other)}.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : ""}`}>
            <div className={`max-w-[78%] px-3 py-2.5 text-[14.5px] leading-snug ${m.mine ? "bg-accent text-on-accent shadow-[0_0_14px_rgba(46,168,255,0.35)]" : "border border-accent/28 bg-[#030A12] text-text"}`}>{m.body}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <p className="mono px-5 pb-2 text-[11px] text-accent-soft">{error}</p>}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-accent/25 bg-black/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 lg:sticky lg:px-5 lg:pb-3">
        <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 1000))} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder={`Message ${displayName(other)}`} aria-label="Message" className="input h-[42px] min-w-0 flex-1" />
        <button onClick={() => void send()} aria-label="Send" className="btn btn-on h-[42px] w-[42px] p-0">
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  );
}

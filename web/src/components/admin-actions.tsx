"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminActions({ userId, held, access }: { userId: string; held: boolean; access: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (action: "hold" | "clear" | "grant" | "revoke") => {
    setBusy(true);
    const r = await fetch("/api/admin/waitlist", { method: "POST", body: JSON.stringify({ action, userId }) });
    setBusy(false);
    if (!r.ok) alert(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Failed.");
    router.refresh();
  };
  return (
    <span className="flex gap-1.5">
      <button disabled={busy} onClick={() => void act(held ? "clear" : "hold")} className="chip">
        {held ? "CLEAR" : "HOLD"}
      </button>
      <button disabled={busy} onClick={() => void act(access ? "revoke" : "grant")} className={`chip ${access ? "" : "chip-on"}`}>
        {access ? "REMOVE ACCESS" : "GIVE ACCESS"}
      </button>
    </span>
  );
}

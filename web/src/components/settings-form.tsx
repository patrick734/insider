"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession, type Me } from "@/lib/session";

export function SettingsForm({ me, pnlVisible }: { me: Me; pnlVisible: boolean }) {
  const { logout } = useSession();
  const router = useRouter();
  const [f, setF] = useState({ handle: me.handle ?? "", name: me.name ?? "", bio: me.bio ?? "", xHandle: me.xHandle ?? "", pnlVisible });
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    const r = await fetch("/api/me", { method: "PATCH", body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved." : (j.error ?? "Couldn't save."));
    if (r.ok) router.refresh();
  };

  return (
    <div className="space-y-4 px-4 py-5 sm:px-5">
      <Field label="HANDLE">
        <div className="flex items-center gap-1">
          <span className="mono text-muted">@</span>
          <input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} maxLength={20} className="input" />
        </div>
      </Field>
      <Field label="NAME">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} className="input" />
      </Field>
      <Field label="BIO">
        <textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={280} rows={3} className="input h-auto py-2.5" />
      </Field>
      <Field label="X HANDLE">
        <input value={f.xHandle} onChange={(e) => setF({ ...f, xHandle: e.target.value })} maxLength={30} placeholder="optional" className="input" />
      </Field>
      <label className="flex items-center justify-between gap-3">
        <span>
          <b className="block text-sm">Show my verified PnL</b>
          <span className="text-xs text-muted">Profit on trades made through Insider, checked on-chain. Hide it any time.</span>
        </span>
        <input type="checkbox" checked={f.pnlVisible} onChange={(e) => setF({ ...f, pnlVisible: e.target.checked })} className="h-5 w-5 accent-[#2EA8FF]" />
      </label>
      <button onClick={() => void save()} className="btn btn-on h-11 w-full">
        SAVE
      </button>
      {msg && <p className="mono text-[11px] text-accent-soft">{msg}</p>}
      <button onClick={() => void logout()} className="btn btn-off w-full">
        LOG OUT
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono mb-1.5 block text-[10px] tracking-[0.14em] text-muted">{label}</span>
      {children}
    </label>
  );
}

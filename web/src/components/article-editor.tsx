"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ArticleEditor() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", dek: "", body: "", tag: "ROOMS" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const publish = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/articles", { method: "POST", body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "Couldn't publish.");
    router.push(`/articles/${j.id}`);
  };

  return (
    <div className="space-y-3 px-4 py-5 sm:px-5">
      <input value={f.title} onChange={set("title")} maxLength={120} placeholder="Title" className="input h-12 text-lg font-bold" />
      <input value={f.dek} onChange={set("dek")} maxLength={240} placeholder="One line on what it's about" className="input" />
      <select value={f.tag} onChange={set("tag")} className="input mono text-xs">
        {["ROOMS", "KEYS", "MARKETS", "PNL", "HOSTING"].map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
      <textarea value={f.body} onChange={set("body")} rows={14} placeholder="Write it here." className="input h-auto py-3 leading-relaxed" />
      {error && <p className="mono text-[11px] text-accent-soft">{error}</p>}
      <button disabled={busy || !f.title.trim() || f.body.trim().length < 200} onClick={() => void publish()} className="btn btn-on h-11 w-full">
        {f.body.trim().length < 200 ? `${200 - f.body.trim().length} MORE CHARACTERS TO PUBLISH` : busy ? "PUBLISHING…" : "PUBLISH"}
      </button>
    </div>
  );
}

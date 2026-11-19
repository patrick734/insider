"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { Avatar } from "./avatar";
import { Icon } from "./icons";

type Upload = { id: string; url: string };

/** The "What's the call?" box: text, up to four images, posted to the timeline or one of your rooms. */
export function Composer({ rooms, autoFocus = false }: { rooms: { id: string; title: string }[]; autoFocus?: boolean }) {
  const { me, login } = useSession();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [roomId, setRoomId] = useState("");
  const [images, setImages] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    for (const f of Array.from(files).slice(0, 4 - images.length)) {
      const form = new FormData();
      form.append("file", f);
      const r = await fetch("/api/media", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "Couldn't upload that image.");
        break;
      }
      setImages((x) => [...x, j as Upload]);
    }
    setUploading(false);
    if (picker.current) picker.current.value = "";
  };

  const post = async () => {
    if (!me) return login();
    if (!body.trim() && !images.length) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/posts", { method: "POST", body: JSON.stringify({ body, roomId: roomId || null, mediaIds: images.map((i) => i.id) }) });
    setBusy(false);
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't post.");
    setBody("");
    setImages([]);
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
        {images.length > 0 && (
          <div className="mb-3 flex gap-2">
            {images.map((im) => (
              <span key={im.id} className="relative h-20 w-20 overflow-hidden border border-accent/30">
                <img src={im.url} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setImages((x) => x.filter((y) => y.id !== im.id))} aria-label="Remove image" className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center bg-black/80 text-text">
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-accent/10 pt-3">
          <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <button
            onClick={() => (me ? picker.current?.click() : login())}
            disabled={uploading || images.length >= 4}
            className="mono border border-accent/30 px-2 py-1 text-[10.5px] tracking-[0.1em] text-accent-soft disabled:opacity-40"
          >
            {uploading ? "UPLOADING…" : "IMG"}
          </button>
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
          <button onClick={() => void post()} disabled={busy || uploading || (!body.trim() && !images.length)} className="btn btn-on">
            {busy ? "POSTING…" : "POST"}
          </button>
        </div>
        {error && <p className="mono mt-2 text-[11px] text-accent-soft">{error}</p>}
      </div>
    </section>
  );
}

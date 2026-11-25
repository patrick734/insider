"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSession, type Me } from "@/lib/session";
import { PRIVY_APP_ID, SITE } from "@/lib/config";
import { Avatar } from "./avatar";

export function SettingsForm({ me, pnlVisible, bannerUrl: initialBanner }: { me: Me; pnlVisible: boolean; bannerUrl: string | null }) {
  const { logout, refresh, x } = useSession();
  const router = useRouter();
  const [f, setF] = useState({ handle: me.handle ?? "", name: me.name ?? "", bio: me.bio ?? "", xHandle: me.xHandle ?? "", pnlVisible });
  const [msg, setMsg] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const bannerFile = useRef<HTMLInputElement>(null);
  const [bannerUrl, setBannerUrl] = useState(initialBanner);
  // Linked through X sign-in: the X handle comes from X and can't be typed over.
  const xLocked = !!me.xHandle && !!x.username && x.username.toLowerCase() === me.xHandle.toLowerCase();

  const photo = async (fn: () => Promise<Response>) => {
    setPhotoBusy(true);
    setPhotoMsg(null);
    const r = await fn().catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { me?: Me; error?: string } | undefined;
    setPhotoBusy(false);
    if (!r?.ok) return setPhotoMsg(j?.error ?? "Couldn't update your photo.");
    setAvatarUrl(j?.me?.avatarUrl ?? null);
    await refresh();
    router.refresh();
  };
  const uploadTo = (field: "avatar" | "banner", f: File) =>
    photo(async () => {
      const form = new FormData();
      form.append("file", f);
      const up = await fetch("/api/media", { method: "POST", body: form });
      if (!up.ok) return up;
      const { id } = (await up.json()) as { id: string };
      if (field === "banner") setBannerUrl(`/api/media/${id}`);
      return fetch("/api/me", { method: "PATCH", body: JSON.stringify({ [field]: id }) });
    });
  const upload = (f: File) => uploadTo("avatar", f);
  const removeBanner = () => (setBannerUrl(null), photo(() => fetch("/api/me", { method: "PATCH", body: JSON.stringify({ banner: null }) })));
  const pickX = () => photo(async () => fetch("/api/me/x", { method: "POST", body: JSON.stringify({ ...(PRIVY_APP_ID ? await x.getTokens() : {}), photo: true, photoUrl: x.photoUrl }) }));
  const pickGenerated = () => photo(() => fetch("/api/me", { method: "PATCH", body: JSON.stringify({ avatar: null }) }));

  const save = async () => {
    setMsg(null);
    const r = await fetch("/api/me", { method: "PATCH", body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved." : (j.error ?? "Couldn't save."));
    if (r.ok) router.refresh();
  };

  return (
    <div className="space-y-4 px-4 py-5 sm:px-5">
      <div>
        <span className="mono mb-2 block text-[10px] tracking-[0.14em] text-muted">PHOTO</span>
        <div className="flex items-center gap-4">
          <Avatar user={{ ...me, avatarUrl }} size={76} />
          <div className="flex flex-wrap gap-2">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <button disabled={photoBusy} onClick={() => file.current?.click()} className="btn btn-on h-9 px-3.5">
              {photoBusy ? "SAVING…" : "UPLOAD PHOTO"}
            </button>
            {x.username && (
              <button disabled={photoBusy} onClick={() => void pickX()} className="btn btn-off h-9 px-3.5">
                USE X PHOTO
              </button>
            )}
            {avatarUrl && (
              <button disabled={photoBusy} onClick={() => void pickGenerated()} className="btn btn-off h-9 px-3.5">
                REMOVE PHOTO
              </button>
            )}
          </div>
        </div>
        <span className="mono mt-2 block text-[10px] text-dim">{photoMsg ?? "JPEG, PNG, WebP or GIF, up to 5 MB."}</span>
      </div>
      <div>
        <span className="mono mb-2 block text-[10px] tracking-[0.14em] text-muted">BANNER</span>
        <div className="art relative h-[96px] overflow-hidden border border-accent/30">
          {bannerUrl && <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={bannerFile} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadTo("banner", e.target.files[0])} />
          <button disabled={photoBusy} onClick={() => bannerFile.current?.click()} className="btn btn-off h-9 px-3.5">
            UPLOAD BANNER
          </button>
          {bannerUrl && (
            <button disabled={photoBusy} onClick={() => void removeBanner()} className="btn btn-off h-9 px-3.5">
              REMOVE BANNER
            </button>
          )}
        </div>
        <span className="mono mt-2 block text-[10px] text-dim">Wide images work best (1500×500).</span>
      </div>
      {PRIVY_APP_ID && (
        <div className="panel flex items-center justify-between gap-3 p-3.5">
          <span className="flex min-w-0 flex-col">
            <b className="text-sm">{x.username ? `X connected: @${x.username}` : "Connect your X account"}</b>
            <span className="text-xs text-muted">{x.username ? "Your X photo, name and handle come over automatically." : "Brings your X photo, name and handle over, and shows your X on your profile."}</span>
          </span>
          {!x.username && (
            <button onClick={x.link} className="btn btn-on h-9 flex-none px-3.5">
              CONNECT X
            </button>
          )}
        </div>
      )}
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
        <input value={f.xHandle} readOnly={xLocked} onChange={(e) => setF({ ...f, xHandle: e.target.value })} maxLength={30} placeholder="optional" className={`input ${xLocked ? "opacity-60" : ""}`} />
        {xLocked && <span className="mono mt-1 block text-[10px] text-dim">Linked through your X sign-in.</span>}
      </Field>
      <label className="flex items-center justify-between gap-3">
        <span>
          <b className="block text-sm">Show my verified PnL</b>
          <span className="text-xs text-muted">Profit on trades made through {SITE.name}, checked on-chain. Hide it any time.</span>
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

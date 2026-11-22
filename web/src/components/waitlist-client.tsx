"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { Corners } from "./page";
import { CopyButton } from "./copy-button";

type Me = {
  joined: boolean;
  code: string | null;
  xHandle: string | null;
  followState: "none" | "pending" | "verified";
  founderNo: number | null;
  verifiedInvites: number;
  pendingInvites: number;
  rank: number | null;
};

/** Your waitlist status: the three steps, then your link, rank and invites. */
export function WaitlistClient({ initial, projectX, siteUrl }: { initial: Me | null; projectX: string; siteUrl: string }) {
  const { me, login, x } = useSession();
  const router = useRouter();
  const [w, setW] = useState<Me | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const call = async (path: string, body?: unknown) => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Something went wrong.");
    setW(j);
    if (j.message) setMsg(j.message);
    router.refresh();
  };

  // Signed in but not on the list yet: join straight away (this is what credits your inviter's link).
  useEffect(() => {
    if (me && w && !w.joined) void call("/api/waitlist/join");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // Once Privy has an X account linked, record it.
  useEffect(() => {
    if (me && w?.joined && !w.xHandle && x.username) void call("/api/waitlist/x", { idToken: x.idToken });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, w?.joined, x.username]);

  if (!me)
    return (
      <div className="border-b border-line px-4 py-6 sm:px-6">
        <button onClick={login} className="btn btn-on h-12 px-6 text-[13px] shadow-[0_0_30px_rgba(46,168,255,0.6)]">
          JOIN WITH X
        </button>
        <p className="mono mt-3 text-[11px] text-dim">Sign in with X. Your wallet can come later.</p>
      </div>
    );

  const link = w?.code ? `${siteUrl}/s/${w.code}` : "";
  const shareText = `I'm on the @${projectX} founder list. Rooms for coin holders on Base, with receipts on every call.`;
  const step = (done: boolean, n: string, title: string, children: React.ReactNode) => (
    <div className={`panel p-4 ${done ? "" : "border-accent/50"}`}>
      <div className="flex items-center gap-3">
        <span className={`mono grid h-7 w-7 flex-none place-items-center text-[11px] font-bold ${done ? "bg-accent text-on-accent" : "border border-accent/50 text-accent"}`}>{done ? "✓" : n}</span>
        <b className="flex-1">{title}</b>
      </div>
      <div className="mt-3 pl-10">{children}</div>
    </div>
  );

  return (
    <section className="space-y-2.5 border-b border-line px-4 py-6 sm:px-6">
      {w?.founderNo && (
        <div className="panel mb-4 border-accent p-4 shadow-[0_0_30px_rgba(46,168,255,0.35)]">
          <Corners />
          <span className="label">// YOU&apos;RE IN</span>
          <b className="mono glow mt-1 block text-2xl text-accent">FOUNDER #{w.founderNo}</b>
          <span className="text-sm text-muted">Your badge shows on your profile when the app opens.</span>
        </div>
      )}
      {step(!!w?.xHandle, "1", w?.xHandle ? `X linked: @${w.xHandle}` : "Link your X account", w?.xHandle ? <span className="text-sm text-muted">One spot per X account.</span> : (
        <button disabled={busy} onClick={x.link} className="btn btn-on">
          LINK X
        </button>
      ))}
      {step(w?.followState === "verified", "2", `Follow @${projectX} on X`, w?.followState === "verified" ? <span className="text-sm text-muted">Follow checked. You&apos;re verified.</span> : (
        <div className="flex flex-wrap items-center gap-2">
          <a href={`https://x.com/intent/follow?screen_name=${projectX}`} target="_blank" rel="noreferrer" className="btn btn-off">
            FOLLOW ON X ↗
          </a>
          <button disabled={busy || !w?.xHandle} onClick={() => void call("/api/waitlist/verify-follow")} className="btn btn-on">
            {busy ? "CHECKING…" : "I'VE FOLLOWED"}
          </button>
          {w?.followState === "pending" && <span className="mono text-[11px] text-accent-soft">PENDING CHECK</span>}
        </div>
      ))}
      {step(false, "3", "Share your link", (
        <div className="space-y-2.5">
          <div className="flex gap-2">
            <input readOnly value={link} className="input mono min-w-0 flex-1 text-xs" />
            <CopyButton text={link} />
          </div>
          <a href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer" className="btn btn-off">
            POST ON X ↗
          </a>
          <div className="mono flex flex-wrap gap-x-5 gap-y-1 pt-1 text-[11.5px] text-muted">
            <span>
              <b className="text-text">{w?.verifiedInvites ?? 0}</b> VERIFIED INVITES
            </span>
            <span>
              <b className="text-text">{w?.pendingInvites ?? 0}</b> WAITING TO VERIFY
            </span>
            <span>
              RANK <b className="text-text">{w?.rank ? `#${w.rank}` : "—"}</b>
            </span>
          </div>
        </div>
      ))}
      {msg && <p className="mono pt-1 text-[11px] text-accent-soft">{msg}</p>}
    </section>
  );
}

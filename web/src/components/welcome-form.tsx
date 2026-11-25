"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readClient, useSession } from "@/lib/session";
import { displayName, eth, shortAddr } from "@/lib/format";
import { Avatar } from "./avatar";
import { DepositSheet } from "./deposit";
import { Corners } from "./page";

type Host = { id: string; address: string; handle: string | null; name: string | null; avatarUrl: string | null; bio: string | null; members: number };
type Step = "profile" | "wallet" | "follow";

const STEPS: { id: Step; label: string }[] = [
  { id: "profile", label: "PROFILE" },
  { id: "wallet", label: "WALLET" },
  { id: "follow", label: "FOLLOW" },
];

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

/** First sign-in: pick a handle, see your wallet (and fund it if you like), follow some hosts, then into a room. */
export function WelcomeForm({ me, hosts }: { me: { handle: string; name: string; address: string; xHandle: string | null }; hosts: Host[] }) {
  const router = useRouter();
  const { refresh, x, walletKind } = useSession();
  const [step, setStep] = useState<Step>(me.handle ? "wallet" : "profile");
  // Start from the X handle when there is one: most people want the same name here.
  const [handle, setHandle] = useState(me.handle || clean(me.xHandle ?? x.username ?? ""));
  const [name, setName] = useState(me.name);
  const [check, setCheck] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [follows, setFollows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [deposit, setDeposit] = useState(false);

  // X can arrive a moment after the page: fill the handle then, if it's still empty.
  useEffect(() => {
    if (!handle && x.username) setHandle(clean(x.username));
  }, [x.username, handle]);

  // Is the handle free? Checked as you type.
  useEffect(() => {
    if (handle.length < 3) return setCheck("idle");
    setCheck("checking");
    const t = setTimeout(async () => {
      const r = await fetch(`/api/handle?h=${encodeURIComponent(handle)}`).then((r) => r.json()).catch(() => null);
      setCheck(r?.available ? "free" : "taken");
    }, 350);
    return () => clearTimeout(t);
  }, [handle]);

  useEffect(() => {
    void readClient().getBalance({ address: me.address as `0x${string}` }).then(setBalance).catch(() => {});
  }, [me.address, deposit]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/me", { method: "PATCH", body: JSON.stringify({ handle, name: name || undefined }) });
    setBusy(false);
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
    await refresh();
    setStep("wallet");
  };

  const follow = async (id: string) => {
    setFollows((s) => new Set(s).add(id));
    await fetch(`/api/follow/${id}`, { method: "POST" });
  };

  const at = STEPS.findIndex((s) => s.id === step);

  return (
    <>
      <ol className="mono mt-6 grid grid-cols-3 gap-1.5 text-[10.5px] tracking-[0.12em]">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <span className={`block h-1 ${i <= at ? "bg-accent shadow-[0_0_10px_rgba(46,168,255,0.7)]" : "bg-accent/15"}`} />
            <span className={`mt-2 block ${i === at ? "text-accent" : i < at ? "text-soft" : "text-dim"}`}>
              {String(i + 1).padStart(2, "0")} {s.label}
            </span>
          </li>
        ))}
      </ol>

      {step === "profile" && (
        <section className="mt-7">
          <h2 className="text-[20px] font-bold">Pick your handle</h2>
          <p className="mt-1 text-sm text-muted">This is how people find you, tag you in calls and buy your keys.</p>

          <div className="panel mt-5 flex items-center gap-3 p-3.5">
            <Corners />
            <Avatar user={{ handle: handle || null, name: name || null, address: me.address, avatarUrl: null }} size={46} />
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-[15px]">{name || handle || "Your name"}</b>
              <span className="mono truncate text-[11.5px] text-muted">
                @{handle || "handle"}
                {me.xHandle || x.username ? ` · x.com/${me.xHandle ?? x.username}` : ""}
              </span>
            </span>
          </div>

          <label className="mt-5 block">
            <span className="mono mb-1.5 flex justify-between text-[10px] tracking-[0.14em] text-muted">
              HANDLE
              <span className={check === "free" ? "text-accent" : check === "taken" ? "text-[#FF6B8B]" : "text-dim"}>
                {check === "checking" ? "CHECKING…" : check === "free" ? "✓ AVAILABLE" : check === "taken" ? "TAKEN" : ""}
              </span>
            </span>
            <div className="flex items-center gap-1">
              <span className="mono text-muted">@</span>
              <input autoFocus value={handle} onChange={(e) => setHandle(clean(e.target.value))} placeholder="yourname" className="input" />
            </div>
            <span className="mono mt-1 block text-[10px] text-dim">3 to 20 letters, numbers or underscores.</span>
          </label>
          <label className="mt-4 block">
            <span className="mono mb-1.5 block text-[10px] tracking-[0.14em] text-muted">NAME (OPTIONAL)</span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="What people call you" className="input" />
          </label>
          {error && <p className="mono mt-3 text-[11px] text-accent-soft">{error}</p>}
          <button disabled={busy || handle.length < 3 || check === "taken" || check === "checking"} onClick={() => void save()} className="btn btn-on mt-5 h-12 w-full shadow-[0_0_24px_rgba(46,168,255,0.5)]">
            {busy ? "SAVING…" : "CONTINUE"}
          </button>
        </section>
      )}

      {step === "wallet" && (
        <section className="mt-7">
          <h2 className="text-[20px] font-bold">Your wallet</h2>
          <p className="mt-1 text-sm text-muted">
            {walletKind === "connected" ? "You signed in with your own wallet, so that's your account." : "We made this wallet for your sign-in. Only you can use it."} Chatting, posting and calls are free. Keys and swaps use ETH on Base.
          </p>
          <div className="panel mt-5 p-4">
            <Corners />
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-[10px] tracking-[0.14em] text-muted">{walletKind === "connected" ? "CONNECTED WALLET" : "YOUR WALLET"}</span>
              <span className="mono flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-accent-soft">
                <span className="dot !h-1.5 !w-1.5" /> BASE
              </span>
            </div>
            <b className="mono mt-2 block text-[17px]">{shortAddr(me.address)}</b>
            <div className="mt-3 flex items-baseline gap-2">
              <b className="mono glow text-[28px]">{balance === null ? "—" : eth(balance, { symbol: false })}</b>
              <span className="mono text-xs text-muted">ETH</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setDeposit(true)} className="btn btn-on h-12 shadow-[0_0_24px_rgba(46,168,255,0.5)]">
              DEPOSIT
            </button>
            <button onClick={() => setStep("follow")} className="btn btn-off h-12">
              {balance && balance > 0n ? "CONTINUE" : "LATER"}
            </button>
          </div>
          {deposit && <DepositSheet address={me.address} balance={balance} onClose={() => setDeposit(false)} />}
        </section>
      )}

      {step === "follow" && (
        <section className="mt-7">
          <h2 className="text-[20px] font-bold">{hosts.length ? "Follow a few hosts" : "Be one of the first hosts"}</h2>
          <p className="mt-1 text-sm text-muted">
            {hosts.length ? "Their calls and rooms show up on your home feed." : "No rooms are open yet. Open one for a coin you hold and earn on every swap and key trade in it."}
          </p>
          {hosts.length > 0 && (
            <div className="mt-5 space-y-2">
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
          )}
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button onClick={() => router.push(hosts.length ? "/rooms" : "/host")} className="btn btn-on h-12 shadow-[0_0_24px_rgba(46,168,255,0.5)]">
              {hosts.length ? "FIND A ROOM" : "HOST A ROOM"}
            </button>
            <Link href="/explore" className="btn btn-off h-12">
              EXPLORE
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

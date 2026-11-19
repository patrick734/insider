"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEther } from "viem";
import type { Profile } from "@/server/queries";
import { txError, useSession } from "@/lib/session";
import { builderSuffix } from "@/lib/builder-code";
import { priceAt } from "@/lib/curve";
import { displayName, eth } from "@/lib/format";
import { KeysPanel } from "./room-client";

/** Buy key, follow, tip and message buttons on a profile, plus the buy-key sheet. */
export function ProfileActions({ profile: p, isMe }: { profile: Profile; isMe: boolean }) {
  const { me, login, send } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState(p.viewerFollows);
  const [sheet, setSheet] = useState(false);

  if (isMe)
    return (
      <Link href="/settings" className="btn btn-off">
        EDIT PROFILE
      </Link>
    );

  const follow = async () => {
    if (!me) return login();
    setFollowing(!following);
    await fetch(`/api/follow/${p.id}`, { method: "POST" });
    router.refresh();
  };

  const tip = async () => {
    if (!me) return login();
    const amount = window.prompt(`Tip ${displayName(p)} in ETH`, "0.002");
    if (!amount) return;
    try {
      const hash = await send((w) => w.sendTransaction({ account: w.account!, chain: w.chain, to: p.address as `0x${string}`, value: parseEther(amount), data: builderSuffix() }));
      await fetch("/api/tips", { method: "POST", body: JSON.stringify({ txHash: hash }) });
      alert("Tip sent.");
    } catch (e) {
      alert(txError(e));
    }
  };

  const room = p.rooms[0] ?? {
    id: "0",
    slug: "",
    title: `${displayName(p)}'s room`,
    topic: null,
    access: "gated" as const,
    isLive: false,
    liveTitle: null,
    online: 0,
    coinSymbol: null,
    coinAddress: null,
    host: p,
  };

  return (
    <>
      <span className="flex flex-wrap gap-1.5 pb-1 sm:justify-end sm:gap-2">
        <button onClick={() => void tip()} className="btn btn-off px-2.5 sm:px-3.5">
          Ξ TIP
        </button>
        <Link href={me ? `/messages/${p.handle ?? p.address}` : "#"} onClick={(e) => !me && (e.preventDefault(), login())} className="btn btn-off px-2.5 sm:px-3.5">
          MESSAGE
        </Link>
        <button onClick={() => void follow()} className={`btn px-2.5 sm:px-3.5 ${following ? "btn-off" : "btn-off border-accent"}`}>
          {following ? "FOLLOWING" : "FOLLOW"}
        </button>
        <button onClick={() => (me ? setSheet(true) : login())} className="btn btn-on">
          {p.keySupply > 0 ? `BUY KEY · ${eth(priceAt(BigInt(p.keySupply)))}` : "KEYS"}
        </button>
      </span>
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button aria-label="Close" onClick={() => setSheet(false)} className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
          <section role="dialog" aria-label={`Buy ${displayName(p)}'s keys`} className="relative w-full max-w-md border-t border-accent bg-[#02070D] p-4 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(46,168,255,0.22)] sm:border">
            <div className="mx-auto mb-3.5 h-1 w-10 bg-accent-soft/35 sm:hidden" />
            <KeysPanel room={room} me={me} supplyHint={p.keySupply} onDone={() => (setSheet(false), router.refresh())} />
            <div className="label mt-4 text-[10px]">// WHAT KEYS GET YOU</div>
            {[`${displayName(p)}'s key chat, with calls before they hit the timeline`, "A share of the room's swap and key fees, streamed to holders", "Entry to holders-only calls in the room"].map((t) => (
              <div key={t} className="mt-2 flex gap-2.5 text-sm leading-snug text-body">
                <span className="dot mt-1.5 flex-none" />
                {t}
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { parseEther } from "viem";
import type { Post } from "@/lib/types";
import { ago, compact, displayName, eth, pct, profileHref, usd } from "@/lib/format";
import { txError, useSession } from "@/lib/session";
import { builderSuffix } from "@/lib/builder-code";
import { Avatar } from "./avatar";
import { Icon } from "./icons";

export function PostList({ posts, compactCards = false }: { posts: Post[]; compactCards?: boolean }) {
  return (
    <>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} compactCards={compactCards} />
      ))}
    </>
  );
}

export function PostCard({ post, compactCards = false }: { post: Post; compactCards?: boolean }) {
  const { me, login, send } = useSession();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likeCount);
  const [reposted, setReposted] = useState(post.reposted);
  const [reposts, setReposts] = useState(post.repostCount);
  const [tipWei, setTipWei] = useState(BigInt(post.tipWei));
  const [saved, setSaved] = useState(post.bookmarked);
  const [busy, setBusy] = useState(false);
  const u = post.user;

  const toggle = async (what: "like" | "repost" | "bookmark") => {
    if (!me) return login();
    if (what === "bookmark") setSaved(!saved);
    else if (what === "like") {
      setLiked(!liked);
      setLikes((n) => n + (liked ? -1 : 1));
    } else {
      setReposted(!reposted);
      setReposts((n) => n + (reposted ? -1 : 1));
    }
    await fetch(`/api/posts/${post.id}/${what}`, { method: "POST" }).catch(() => {});
  };

  const tip = async () => {
    if (!me) return login();
    if (u.id === me.id) return;
    const amount = window.prompt(`Tip ${displayName(u)} in ETH`, "0.002");
    if (!amount) return;
    setBusy(true);
    try {
      const value = parseEther(amount);
      const hash = await send((w) => w.sendTransaction({ account: w.account!, chain: w.chain, to: u.address as `0x${string}`, value, data: builderSuffix() }));
      await fetch("/api/tips", { method: "POST", body: JSON.stringify({ txHash: hash, postId: post.id }) });
      setTipWei((t) => t + value);
    } catch (e) {
      alert(txError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex gap-2.5 border-b border-line px-4 py-3.5 sm:gap-3 sm:px-5 sm:py-4">
      <Link href={profileHref(u)} className="flex-none">
        <Avatar user={u} size={compactCards ? 36 : 42} on={u.isOfficial || (!!u.pnlWei && BigInt(u.pnlWei) > 10n ** 18n)} />
      </Link>
      <div className="min-w-0 flex-1">
        {post.pinned && <div className="mono mb-1 text-[10.5px] tracking-[0.14em] text-muted">▲ PINNED</div>}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-tight">
          <Link href={profileHref(u)} className="text-[15px] font-semibold text-text hover:text-text">
            {displayName(u)}
          </Link>
          {u.isOfficial && <span className="mono bg-accent px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-on-accent">OFFICIAL</span>}
          <span className="mono text-xs text-muted">
            {u.handle ? `@${u.handle}` : ""} · {ago(post.createdAt)}
          </span>
          {u.pnlWei && (
            <span title="Profit on trades checked on-chain, last 30 days" className="mono border border-accent/50 px-1.5 text-[10px] tracking-[0.08em] text-accent-soft">
              PNL {eth(u.pnlWei, { sign: true })} ✓
            </span>
          )}
          {post.room && (
            <span className="mono text-xs text-muted">
              in <Link href={`/rooms/${post.room.slug}`}>{post.room.title}</Link>
            </span>
          )}
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-normal text-body">{post.body}</p>

        {post.media.length > 0 && (
          <div className={`mt-3 grid gap-1 ${post.media.length > 1 ? "grid-cols-2" : ""}`}>
            {post.media.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden border border-accent/25">
                <img src={src} alt="" loading="lazy" className={`w-full object-cover ${post.media.length > 1 ? "aspect-square" : "max-h-[420px]"}`} />
              </a>
            ))}
          </div>
        )}

        {post.trade && (
          <div className="panel mt-3 flex items-center gap-3 px-3.5 py-3 sm:gap-3.5">
            <span className={`mono flex-none px-2 py-1 text-[10.5px] font-bold tracking-[0.12em] ${post.trade.side === "sell" ? "bg-text text-black" : "bg-accent text-on-accent"}`}>
              {post.trade.side === "sell" ? "SOLD" : "BOUGHT"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="text-sm font-semibold">
                {eth(post.trade.amountWei)} of ${post.trade.symbol}
              </b>
              <span className="mono text-[11px] text-muted">at {usd(post.trade.mcUsd)} MC · checked on Base</span>
            </div>
            {post.trade.changePct !== null && (
              <div className="mono flex flex-col items-end gap-0.5">
                <b className="glow text-[15px] text-accent">{pct(post.trade.changePct)}</b>
                <span className="text-[10px] tracking-[0.1em] text-dim">SINCE POST</span>
              </div>
            )}
          </div>
        )}

        {post.live?.isLive && (
          <Link href={`/rooms/${post.live.slug}`} className="mt-3 flex items-center gap-3 border border-accent bg-gradient-to-r from-accent/14 to-accent/3 px-3.5 py-3 text-text hover:text-text">
            <span className="mono inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.14em] text-accent">
              <span className="dot" />
              LIVE
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="truncate font-semibold">
                {post.live.title} · {post.live.liveTitle ?? "live now"}
              </b>
              <span className="mono text-[10.5px] text-muted">
                {post.live.online} ONLINE · {post.live.access === "gated" ? "HOLDERS ONLY" : "OPEN"}
              </span>
            </span>
            <span className="btn btn-on h-[30px] px-3">JOIN</span>
          </Link>
        )}

        <div className="mono mt-3 flex max-w-[470px] items-center justify-between text-xs text-muted">
          <Link href={`/p/${post.id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-text" aria-label="Replies">
            <Icon name="reply" size={17} />
            {compact(post.replyCount)}
          </Link>
          <button onClick={() => void toggle("repost")} className={`inline-flex items-center gap-1.5 ${reposted ? "text-accent" : "hover:text-text"}`} aria-pressed={reposted} aria-label="Repost">
            <Icon name="repost" size={17} />
            {compact(reposts)}
          </button>
          <button onClick={() => void toggle("like")} className={`inline-flex items-center gap-1.5 ${liked ? "text-accent" : "hover:text-text"}`} aria-pressed={liked} aria-label="Like">
            <Icon name="like" size={17} />
            {compact(likes)}
          </button>
          <button onClick={() => void tip()} disabled={busy} className="inline-flex items-center gap-1.5 border border-accent/35 px-2 py-0.5 text-accent-soft hover:bg-accent/10">
            Ξ TIP{tipWei > 0n ? ` ${eth(tipWei, { symbol: false })}` : ""}
          </button>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Icon name="views" size={17} />
            {compact(post.viewCount)}
          </span>
          <button onClick={() => void toggle("bookmark")} className={saved ? "text-accent" : "hover:text-text"} aria-pressed={saved} aria-label={saved ? "Remove bookmark" : "Bookmark"}>
            <Icon name="bookmark" size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

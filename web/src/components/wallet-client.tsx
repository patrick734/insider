"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { ADDRESSES, chain, contractsDeployed } from "@insider/core/chain";
import { keysAbi } from "@insider/core/abi";
import { readClient, txError, useSession } from "@/lib/session";
import { builderSuffix } from "@/lib/builder-code";
import { sellNet } from "@/lib/curve";
import { ago, eth, shortAddr } from "@/lib/format";
import { CoinTile } from "./avatar";
import { Corners, Tabs, type TabLink } from "./page";
import { Icon } from "./icons";
import { DepositSheet } from "./deposit";

type Props = {
  tab: "tokens" | "keys" | "rooms" | "activity";
  tabs: TabLink[];
  address: string;
  earned: { keyFees: string; roomFees: string; tips: string; week: string };
  coins: { address: string; symbol: string; name: string; decimals: number; balance: string }[];
  keys: { subject: string; balance: number; handle: string | null; name: string | null; supply: number }[];
  activity: { kind: string; txHash: string; buy: boolean; amount: string | null; wei: string; at: string; other: string | null }[];
};

export function WalletClient(p: Props) {
  const { send } = useSession();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [owed, setOwed] = useState<bigint>(0n);
  const [rewards, setRewards] = useState<Record<string, bigint>>({});
  const [copied, setCopied] = useState(false);
  const [deposit, setDeposit] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const addr = p.address as `0x${string}`;

  useEffect(() => {
    const c = readClient();
    void c.getBalance({ address: addr }).then(setBalance).catch(() => {});
    if (!contractsDeployed()) return;
    void c.readContract({ address: ADDRESSES.keys, abi: keysAbi, functionName: "owed", args: [addr] }).then(setOwed).catch(() => {});
    void Promise.all(
      p.keys.map(async (k) => [k.subject, await c.readContract({ address: ADDRESSES.keys, abi: keysAbi, functionName: "pendingRewards", args: [k.subject as `0x${string}`, addr] }).catch(() => 0n)] as const),
    ).then((rows) => setRewards(Object.fromEntries(rows)));
  }, [addr, p.keys]);

  const claimable = owed + Object.values(rewards).reduce((a, b) => a + b, 0n);
  const keysValue = p.keys.reduce((sum, k) => sum + (k.supply > 1 ? sellNet(BigInt(k.supply), 1n) * BigInt(k.balance) : 0n), 0n);

  const claimAll = async () => {
    setMsg(null);
    try {
      if (owed > 0n) await send((w) => w.writeContract({ account: w.account!, chain: w.chain, address: ADDRESSES.keys, abi: keysAbi, functionName: "withdraw", dataSuffix: builderSuffix() }));
      for (const [subject, r] of Object.entries(rewards))
        if (r > 0n) await send((w) => w.writeContract({ account: w.account!, chain: w.chain, address: ADDRESSES.keys, abi: keysAbi, functionName: "claimRewards", args: [subject as `0x${string}`], dataSuffix: builderSuffix() }));
      setMsg("Claimed.");
      setOwed(0n);
      setRewards({});
    } catch (e) {
      setMsg(txError(e));
    }
  };

  return (
    <>
      <div className="mono flex items-center gap-2.5 px-4 pt-3.5 text-xs text-muted sm:px-5">
        <span>WALLET</span>
        <b className="font-medium text-text">{shortAddr(p.address)}</b>
        <button
          aria-label="Copy address"
          onClick={() => (navigator.clipboard.writeText(p.address), setCopied(true), setTimeout(() => setCopied(false), 1500))}
          className="text-accent-soft"
        >
          {copied ? "COPIED" : <Icon name="copy" size={14} />}
        </button>
      </div>
      <section className="panel mx-4 mt-3.5 p-4 sm:mx-5 sm:p-5">
        <Corners />
        <span className="label">// BALANCE</span>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3.5">
          <b className="mono glow text-[34px] font-bold sm:text-[40px]">{balance === null ? "—" : eth(balance)}</b>
          <span className="mono text-sm text-muted">ETH ON {chain.name.toUpperCase()}</span>
        </div>
        <span className="mono mt-1.5 block text-xs text-accent">{BigInt(p.earned.week) > 0n ? `${eth(p.earned.week, { sign: true })} earned from rooms, keys and tips this week` : "Earn from hosting rooms, your keys and tips."}</span>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button onClick={() => setDeposit(true)} className="btn btn-on h-[38px] px-[18px]">
            DEPOSIT
          </button>
          <a href={`${chain.blockExplorers?.default.url}/address/${p.address}`} target="_blank" rel="noreferrer" className="btn btn-off h-[38px] px-[18px]">
            HISTORY ↗
          </a>
          <Link href="/explore?tab=tokens" className="btn btn-off h-[38px] px-[18px]">
            SWAP
          </Link>
          <button disabled={claimable === 0n} onClick={() => void claimAll()} className="btn btn-off h-[38px] border-accent px-[18px] text-accent-soft">
            CLAIM {claimable > 0n ? eth(claimable) : ""}
          </button>
        </div>
        {msg && <p className="mono mt-2.5 text-[11px] text-accent-soft">{msg}</p>}
      </section>
      {deposit && <DepositSheet address={p.address} balance={balance} onClose={() => setDeposit(false)} />}
      <div className="mx-4 mt-2.5 grid grid-cols-3 gap-2 sm:mx-5 sm:gap-2.5">
        {[
          ["ROOM FEES · 30D", p.earned.roomFees],
          ["KEY FEES · 30D", p.earned.keyFees],
          ["TIPS · 30D", p.earned.tips],
        ].map(([k, v]) => (
          <div key={k} className="panel p-3 sm:p-3.5">
            <span className="mono text-[8.5px] tracking-[0.12em] text-muted sm:text-[10px]">{k}</span>
            <b className="mono mt-1.5 block text-[15px] sm:text-[19px]">{eth(v)}</b>
          </div>
        ))}
      </div>
      <Tabs tabs={p.tabs} className="mt-4 border-b border-accent/22" />

      {p.tab === "tokens" && (
        <div className="divide-line">
          <Row tile={<CoinTile symbol="ETH" on />} name="Ether" sub={balance === null ? "—" : `${eth(balance, { symbol: false })} ETH`} />
          {p.coins.map((c) => (
            <Row key={c.address} tile={<CoinTile symbol={c.symbol} />} name={`$${c.symbol}`} sub={`${Number(formatUnits(BigInt(c.balance), c.decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c.symbol}`} />
          ))}
          {p.coins.length === 0 && <p className="px-5 py-6 text-sm text-muted">Coins linked to rooms show here once you hold them.</p>}
        </div>
      )}
      {p.tab === "keys" && (
        <div className="divide-line">
          {p.keys.length === 0 && <p className="px-5 py-6 text-sm text-muted">Keys you buy show here, with what they&apos;d sell for now.</p>}
          {p.keys.map((k) => (
            <Link key={k.subject} href={`/u/${k.handle ?? k.subject}`} className="block text-text hover:text-text">
              <Row tile={<CoinTile symbol={k.handle ?? "??"} />} name={`@${k.handle ?? shortAddr(k.subject)}`} sub={`${k.balance} key${k.balance === 1 ? "" : "s"} · supply ${k.supply}`} right={k.supply > 1 ? `≈ ${eth(sellNet(BigInt(k.supply), 1n) * BigInt(k.balance))}` : "—"} />
            </Link>
          ))}
          {p.keys.length > 0 && <p className="mono px-5 py-3 text-[10.5px] text-dim">Total if sold now, one at a time: about {eth(keysValue)} (fees included).</p>}
        </div>
      )}
      {p.tab === "rooms" && (
        <div className="divide-line">
          {owed > 0n && <Row tile={<CoinTile symbol="FE" on />} name="Your key fees" sub="From people trading your keys" right={eth(owed)} />}
          {p.keys.map((k) => (
            <Row key={k.subject} tile={<CoinTile symbol={k.handle ?? "??"} />} name={`@${k.handle ?? shortAddr(k.subject)}'s room`} sub="Room rewards for holding their keys" right={eth(rewards[k.subject] ?? 0n)} />
          ))}
          {owed === 0n && p.keys.length === 0 && <p className="px-5 py-6 text-sm text-muted">Hold keys to share in a room&apos;s fees. Host a room to earn from its swaps and keys.</p>}
        </div>
      )}
      {p.tab === "activity" && (
        <div className="mono divide-line text-[12px]">
          {p.activity.length === 0 && <p className="px-5 py-6 font-sans text-sm text-muted">Nothing yet.</p>}
          {p.activity.map((a) => (
            <a key={a.txHash + a.kind} href={`${chain.blockExplorers?.default.url}/tx/${a.txHash}`} target="_blank" rel="noreferrer" className="grid grid-cols-[60px_1fr_auto_40px] items-center gap-3 px-4 py-3 text-soft sm:px-5">
              <span className={a.buy ? "font-bold text-accent" : "text-[#BFC9D4]"}>{a.kind === "tip" ? "TIP" : a.buy ? "BUY" : "SELL"}</span>
              <span className="truncate">
                {a.kind === "key" ? `${a.amount} key${a.amount === "1" ? "" : "s"} of @${a.other ?? "?"}` : a.kind === "swap" ? `$${a.other ?? "coin"} swap` : `@${a.other ?? "?"}`}
              </span>
              <span className="text-text">{eth(a.wei)}</span>
              <span className="text-right text-dim">{ago(a.at)}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function Row({ tile, name, sub, right }: { tile: React.ReactNode; name: string; sub: string; right?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      {tile}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[15px] font-semibold">{name}</b>
        <span className="mono truncate text-[11px] text-muted">{sub}</span>
      </span>
      {right && <b className="mono text-sm font-semibold">{right}</b>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { chain } from "@insider/core/chain";
import { useSession } from "@/lib/session";
import { displayName, eth } from "@/lib/format";
import { Avatar } from "./avatar";
import { Corners } from "./page";

/**
 * Deposit details for the signed-in account: who it is, which wallet, the network, the full address with a QR code
 * (an EIP-681 link with the chain, so wallet apps pick Base), and the current balance.
 */
export function DepositSheet({ address, balance, onClose }: { address: string; balance: bigint | null; onClose: () => void }) {
  const { me, walletKind } = useSession();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void QRCode.toString(`ethereum:${address}@${chain.id}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then(setQr);
  }, [address]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const copy = () => {
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
      <section role="dialog" aria-label="Deposit" className="relative max-h-[92vh] w-full max-w-md overflow-y-auto border-t border-accent bg-[#02070D] p-4 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(46,168,255,0.22)] sm:border sm:p-5">
        <div className="mx-auto mb-3.5 h-1 w-10 bg-accent-soft/35 sm:hidden" />
        <div className="flex items-center justify-between">
          <span className="label">// DEPOSIT</span>
          <button onClick={onClose} className="mono text-[11px] text-muted hover:text-text">
            CLOSE ✕
          </button>
        </div>

        {me && (
          <div className="mt-3.5 flex items-center gap-3">
            <Avatar user={me} size={40} />
            <span className="flex min-w-0 flex-col">
              <b className="truncate">{displayName(me)}</b>
              <span className="mono truncate text-[11px] text-muted">
                @{me.handle ?? "no-handle"}
                {me.xHandle ? ` · x.com/${me.xHandle}` : ""}
              </span>
            </span>
          </div>
        )}

        <div className="mono mt-4 grid grid-cols-2 gap-2 text-[10.5px]">
          <div className="panel p-2.5">
            <span className="block tracking-[0.12em] text-muted">NETWORK</span>
            <b className="mt-1 flex items-center gap-1.5 text-[12.5px] text-text">
              <span className="dot !h-1.5 !w-1.5" />
              {chain.name.toUpperCase()} · {chain.id}
            </b>
          </div>
          <div className="panel p-2.5">
            <span className="block tracking-[0.12em] text-muted">BALANCE</span>
            <b className="mt-1 block text-[12.5px] text-text">{balance === null ? "—" : `${eth(balance, { symbol: false })} ETH`}</b>
          </div>
        </div>

        <div className="panel mt-2 flex flex-col items-center gap-3 p-4">
          <Corners />
          <div className="h-[184px] w-[184px] bg-white p-1.5" aria-label="QR code of your wallet address">
            {qr ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
          </div>
          <span className="mono block text-[10px] tracking-[0.12em] text-muted">
            {walletKind === "made" ? "WALLET MADE FOR YOUR SIGN-IN" : walletKind === "connected" ? "YOUR CONNECTED WALLET" : "YOUR WALLET"}
          </span>
          <code className="mono block w-full break-all text-center text-[13px] leading-relaxed text-text">{address}</code>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-soft">
          Send ETH or any token on <b className="text-text">{chain.name}</b> to this address. It shows up here once the network confirms it, usually within seconds.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={copy} className="btn btn-on h-11">
            {copied ? "COPIED" : "COPY ADDRESS"}
          </button>
          <a href={`${chain.blockExplorers?.default.url}/address/${address}`} target="_blank" rel="noreferrer" className="btn btn-off h-11">
            BASESCAN ↗
          </a>
        </div>
      </section>
    </div>
  );
}

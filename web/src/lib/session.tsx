"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, http, type Hash, type WalletClient } from "viem";
import { chain } from "@insider/core/chain";
import type { UserLite } from "./types";
import { RPC_URL, SITE } from "./config";

export type Me = UserLite & { bio: string | null; xHandle: string | null };

type Session = {
  ready: boolean;
  me: Me | null;
  /** Wallet address of the signed-in account (null when signed out). */
  address: `0x${string}` | null;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** A viem wallet client on Base for the signed-in wallet. */
  wallet: () => Promise<WalletClient>;
  /** Run a write, wait for it to land and return the hash. */
  send: (fn: (w: WalletClient) => Promise<Hash>) => Promise<Hash>;
};

const Ctx = createContext<Session | null>(null);

export const readClient = () => createPublicClient({ chain, transport: http(RPC_URL || undefined) });

async function fetchMe(): Promise<Me | null> {
  const r = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json()) as { me: Me | null }).me;
}

/** Without Privy configured (local development), sign-in goes through the dev route instead. */
export function DevSessionProvider({ children, initialMe }: { children: React.ReactNode; initialMe: Me | null }) {
  const [me, setMe] = useState<Me | null>(initialMe);
  const refresh = useCallback(async () => setMe(await fetchMe()), []);
  const login = useCallback(() => {
    const handle = window.prompt("Demo sign-in. Pick a sample account: you, mira, nova, juno, deltaq, kite", "you");
    if (!handle) return;
    void fetch("/api/auth/dev", { method: "POST", body: JSON.stringify({ handle }) }).then(() => window.location.reload());
  }, []);
  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }, []);
  const noWallet = useCallback(async (): Promise<never> => {
    throw new Error("Wallet sign-in isn't configured (set NEXT_PUBLIC_PRIVY_APP_ID).");
  }, []);
  const value = useMemo<Session>(
    () => ({ ready: true, me, address: (me?.address as `0x${string}`) ?? null, login, logout, refresh, wallet: noWallet, send: noWallet }),
    [me, login, logout, refresh, noWallet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Privy handles login (email, X, Farcaster or a wallet) and creates an embedded or smart wallet when needed. Our own
 * session is a signed message from that wallet, verified on the server (EOA, ERC-1271 and ERC-6492 signatures).
 */
export function PrivySessionProvider({ children, initialMe }: { children: React.ReactNode; initialMe: Me | null }) {
  const { ready, authenticated, user, login, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const [me, setMe] = useState<Me | null>(initialMe);
  const active =
    wallets.find((w) => w.address.toLowerCase() === user?.wallet?.address?.toLowerCase()) ?? wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];

  const wallet = useCallback(async () => {
    if (!active) {
      login();
      throw new Error("Sign in first.");
    }
    await active.switchChain(chain.id);
    const provider = await active.getEthereumProvider();
    return createWalletClient({ account: active.address as `0x${string}`, chain, transport: custom(provider) });
  }, [active, login]);

  // Once Privy has a wallet and we have no session for it, sign the session message.
  useEffect(() => {
    if (!ready || !authenticated || !active) return;
    if (me && me.address === active.address.toLowerCase()) return;
    let stop = false;
    (async () => {
      const { nonce } = (await fetch("/api/auth/nonce", { cache: "no-store" }).then((r) => r.json())) as { nonce: string };
      const message = [
        `${SITE.domain} wants you to sign in with your wallet.`,
        ``,
        `Address: ${active.address.toLowerCase()}`,
        `Chain: ${chain.id}`,
        `Nonce: ${nonce}`,
        `Issued: ${new Date().toISOString()}`,
      ].join("\n");
      const w = await wallet();
      const signature = await w.signMessage({ account: active.address as `0x${string}`, message });
      if (stop) return;
      const r = await fetch("/api/auth/session", { method: "POST", body: JSON.stringify({ address: active.address, message, signature }) });
      if (r.ok) setMe(await fetchMe());
    })().catch((e) => console.error("session", e));
    return () => {
      stop = true;
    };
  }, [ready, authenticated, active, me, wallet]);

  const refresh = useCallback(async () => setMe(await fetchMe()), []);
  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await privyLogout();
    setMe(null);
    window.location.href = "/";
  }, [privyLogout]);

  const send = useCallback(
    async (fn: (w: WalletClient) => Promise<Hash>) => {
      const w = await wallet();
      const hash = await fn(w);
      const receipt = await readClient().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
      return hash;
    },
    [wallet],
  );

  const value = useMemo<Session>(
    () => ({ ready, me, address: (me?.address as `0x${string}`) ?? null, login, logout, refresh, wallet, send }),
    [ready, me, login, logout, refresh, wallet, send],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside a session provider");
  return s;
}

/** A readable message for a failed wallet action. */
export function txError(e: unknown): string {
  const x = e as { shortMessage?: string; message?: string };
  const m = x?.shortMessage ?? x?.message ?? String(e);
  if (/user rejected|denied|rejected the request/i.test(m)) return "You cancelled it in your wallet.";
  if (/insufficient funds/i.test(m)) return "Not enough ETH in your wallet for that, plus gas.";
  if (/CreatorOnly/.test(m)) return "Only the host can buy for the first few minutes after keys open.";
  if (/TooManyKeys/.test(m)) return "That's more keys than one buy allows right now.";
  if (/Cooldown/.test(m)) return "You can sell 30 minutes after your last buy.";
  if (/CreatorKeyLocked/.test(m)) return "Hosts keep their first key.";
  if (/Slippage/.test(m)) return "The price moved. Try again.";
  return m.length > 160 ? `${m.slice(0, 160)}…` : m;
}

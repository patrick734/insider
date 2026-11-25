"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, getIdentityToken, useCreateWallet, useIdentityToken, usePrivy, useSignMessage, useUser, useWallets } from "@privy-io/react-auth";
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
  /** The X account linked to this sign-in (handle), a way to link one, and Privy's identity token proving it. */
  x: { username: string | null; photoUrl: string | null; link: () => void; idToken: string | null; getTokens: () => Promise<{ idToken: string | null; accessToken: string | null }> };
  /** "made": the wallet Privy created for an X or email sign-in; "connected": the person's own wallet. */
  walletKind: "made" | "connected" | null;
  /** True while a Privy sign-in is being turned into a session; `error` says why the last try failed. */
  signingIn: boolean;
  error: string | null;
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
    () => ({
      ready: true,
      me,
      address: (me?.address as `0x${string}`) ?? null,
      login,
      logout,
      refresh,
      wallet: noWallet,
      send: noWallet,
      // Demo: the sample handle stands in for an X account.
      x: { username: me ? (me.handle ?? `user${me.id}`) : null, photoUrl: null, link: login, idToken: null, getTokens: async () => ({ idToken: null, accessToken: null }) },
      walletKind: null,
      signingIn: false,
      error: null,
    }),
    [me, login, logout, refresh, noWallet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Privy handles login (email, X, Farcaster or a wallet) and creates an embedded or smart wallet when needed. Our own
 * session comes from Privy's identity token (which lists the wallets Privy verified), or failing that a signed message
 * from the wallet, verified on the server (EOA, ERC-1271 and ERC-6492 signatures).
 */
export function PrivySessionProvider({ children, initialMe }: { children: React.ReactNode; initialMe: Me | null }) {
  const { ready, authenticated, user, login, logout: privyLogout, linkTwitter } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { refreshUser } = useUser();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { signMessage: privySign } = useSignMessage();
  // The account follows the wallet you signed in with: the session's wallet if there is one, else your primary
  // Privy wallet (the one you connected, or the one made for an X or email sign-in).
  const active =
    wallets.find((w) => w.address.toLowerCase() === me?.address) ??
    wallets.find((w) => w.address.toLowerCase() === user?.wallet?.address?.toLowerCase()) ??
    wallets.find((w) => w.walletClientType === "privy") ??
    wallets[0];

  const wallet = useCallback(async () => {
    if (!active) {
      login();
      throw new Error("Sign in first.");
    }
    await active.switchChain(chain.id);
    const provider = await active.getEthereumProvider();
    return createWalletClient({ account: active.address as `0x${string}`, chain, transport: custom(provider) });
  }, [active, login]);

  // Signed in with X or email but Privy made no wallet: make one, since the account hangs off a wallet address.
  // Anyone who connected their own wallet already has one and keeps it.
  const creating = useRef(false);
  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || wallets.length > 0 || user?.wallet || creating.current) return;
    creating.current = true;
    setSigningIn(true);
    createWallet()
      .catch((e: unknown) => {
        console.error("create wallet", e);
        setSigningIn(false);
        setError("Couldn't set up your wallet. Try again.");
      })
      .finally(() => {
        creating.current = false;
      });
  }, [ready, authenticated, walletsReady, wallets.length, user?.wallet, createWallet, attempt]);

  // Once Privy has a wallet and we have no session for it, start one. First with Privy's identity token (no prompt);
  // if the wallet isn't in the token yet, refresh it once; only then fall back to signing a message.
  useEffect(() => {
    if (!ready || !authenticated || !active) return;
    if (me && me.address === active.address.toLowerCase()) return;
    let stop = false;
    setSigningIn(true);
    setError(null);
    const viaToken = async () => {
      const idToken = await getIdentityToken().catch(() => null);
      const accessToken = await getAccessToken().catch(() => null);
      if (!idToken && !accessToken) return false;
      const r = await fetch("/api/auth/privy", { method: "POST", body: JSON.stringify({ idToken, accessToken, address: active.address }) });
      return r.ok;
    };
    (async () => {
      let ok = await viaToken().catch(() => false);
      if (!ok && !stop) {
        await refreshUser().catch(() => null);
        ok = await viaToken().catch(() => false);
      }
      if (!ok && !stop) {
        const { nonce } = (await fetch("/api/auth/nonce", { cache: "no-store" }).then((r) => r.json())) as { nonce: string };
        const message = [
          `${SITE.domain} wants you to sign in with your wallet.`,
          ``,
          `Address: ${active.address.toLowerCase()}`,
          `Chain: ${chain.id}`,
          `Nonce: ${nonce}`,
          `Issued: ${new Date().toISOString()}`,
        ].join("\n");
        // Privy's own wallet signs without a popup; an outside wallet (MetaMask etc.) always shows its own prompt.
        const signature =
          active.walletClientType === "privy"
            ? (await privySign({ message }, { address: active.address, uiOptions: { showWalletUIs: false } })).signature
            : await (await wallet()).signMessage({ account: active.address as `0x${string}`, message });
        if (stop) return;
        const r = await fetch("/api/auth/session", { method: "POST", body: JSON.stringify({ address: active.address, message, signature }) });
        ok = r.ok;
      }
      if (stop) return;
      if (!ok) throw new Error("The server didn't accept the sign-in.");
      setMe(await fetchMe());
      setSigningIn(false);
      router.refresh();
    })().catch((e: unknown) => {
      console.error("session", e);
      if (stop) return;
      setSigningIn(false);
      setError(e instanceof Error && /reject|denied|cancel/i.test(e.message) ? "Sign-in was cancelled." : "Sign-in didn't finish. Try again.");
    });
    return () => {
      stop = true;
    };
  }, [ready, authenticated, active, me, wallet, refreshUser, router, attempt, privySign]);

  const refresh = useCallback(async () => setMe(await fetchMe()), []);
  const getTokens = useCallback(async () => {
    let idToken = await getIdentityToken().catch(() => null);
    if (!idToken) {
      await refreshUser().catch(() => null);
      idToken = await getIdentityToken().catch(() => null);
    }
    return { idToken, accessToken: await getAccessToken().catch(() => null) };
  }, [refreshUser]);

  // Signed in with X: link it once per visit. The server fills in a missing name and photo (never over the person's
  // own choice) and refreshes X followers at most once a day.
  const xSynced = useRef(false);
  useEffect(() => {
    if (!me || !user?.twitter?.username || xSynced.current) return;
    xSynced.current = true;
    void (async () => {
      const body = { ...(await getTokens()), photoUrl: user.twitter?.profilePictureUrl ?? null, name: user.twitter?.name ?? null };
      const r = await fetch("/api/me/x", { method: "POST", body: JSON.stringify(body) }).catch(() => null);
      if (r?.ok) {
        setMe(((await r.json()) as { me: Me | null }).me);
        router.refresh();
      }
    })();
  }, [me, user?.twitter?.username, user?.twitter?.profilePictureUrl, user?.twitter?.name, getTokens, router]);
  // Already signed in to Privy but no session yet (or the last try failed): try again instead of opening Privy.
  const signIn = useCallback(() => {
    if (authenticated) setAttempt((a) => a + 1);
    else login();
  }, [authenticated, login]);
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
      // Record it now so holders, balances and activity update at once (the indexer would catch up anyway).
      await fetch("/api/chain/tx", { method: "POST", body: JSON.stringify({ txHash: hash }) }).catch(() => null);
      return hash;
    },
    [wallet],
  );

  const value = useMemo<Session>(
    () => ({
      ready,
      me,
      address: (me?.address as `0x${string}`) ?? null,
      login: signIn,
      logout,
      refresh,
      wallet,
      send,
      x: { username: user?.twitter?.username ?? null, photoUrl: user?.twitter?.profilePictureUrl ?? null, link: linkTwitter, idToken: identityToken, getTokens },
      walletKind: active ? (active.walletClientType === "privy" ? "made" : "connected") : null,
      signingIn,
      error,
    }),
    [active, ready, me, signIn, logout, refresh, wallet, send, user?.twitter?.username, linkTwitter, identityToken, getTokens, signingIn, error, user?.twitter?.profilePictureUrl],
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

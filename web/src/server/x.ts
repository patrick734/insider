import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * X (Twitter) identity and follow checks.
 *
 * Identity: Privy's identity token (signed by Privy, checked against the app's public keys) lists the accounts a
 * person linked, including X with its user id and handle. Confirm the claim shape against the live Privy app.
 *
 * Follow check and account age/followers need the X API (X_BEARER_TOKEN). Without it, follows stay "pending" and
 * never count as verified, as the plan says.
 */
export type XAccount = { id: string; username: string; picture: string | null };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export type PrivyLinked = { type: string; subject?: string; username?: string; address?: string; chain_type?: string; profile_picture_url?: string | null };

/** The accounts a person linked in Privy, from an identity token Privy signed for this app (null if it doesn't check out). */
export async function privyLinkedAccounts(idToken: string, accessToken?: string | null): Promise<PrivyLinked[] | null> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return null;
  jwks ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  if (idToken) {
    try {
      const { payload } = await jwtVerify(idToken, jwks, { issuer: "privy.io", audience: appId });
      const raw = payload.linked_accounts;
      const accounts = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(accounts)) return accounts as PrivyLinked[];
    } catch {
      // fall through to the access token
    }
  }
  // Without an identity token: the access token says who the Privy user is, and Privy's API (with the app secret)
  // lists their linked accounts.
  const secret = process.env.PRIVY_APP_SECRET;
  if (!accessToken || !secret) return null;
  try {
    const { payload } = await jwtVerify(accessToken, jwks, { issuer: "privy.io", audience: appId });
    if (!payload.sub) return null;
    const r = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(payload.sub)}`, {
      headers: { authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`, "privy-app-id": appId },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.warn(`[privy] user lookup failed: ${r.status}`);
      return null;
    }
    const u = (await r.json()) as { linked_accounts?: PrivyLinked[] };
    return Array.isArray(u.linked_accounts) ? u.linked_accounts : [];
  } catch {
    return null;
  }
}

export async function xFromPrivyToken(idToken: string, accessToken?: string | null): Promise<XAccount | null> {
  const x = (await privyLinkedAccounts(idToken, accessToken))?.find((a) => a.type === "twitter_oauth");
  return x?.subject && x.username ? { id: x.subject, username: x.username, picture: x.profile_picture_url ?? null } : null;
}

export type XCheck = { status: "verified" | "pending" | "failed"; reason?: string; followers?: number; createdAt?: string };

const API = "https://api.x.com/2";

async function x<T>(path: string): Promise<T | null> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json()) as T;
}

/** Account age and follower floor, then whether they follow the project account. */
export async function checkX(userId: string, projectHandle: string, minDays: number, minFollowers: number): Promise<XCheck> {
  if (!process.env.X_BEARER_TOKEN) return { status: "pending", reason: "Follow checks start once X API access is set up." };
  const me = await x<{ data?: { created_at: string; public_metrics: { followers_count: number } } }>(`/users/${userId}?user.fields=created_at,public_metrics`);
  if (!me?.data) return { status: "pending", reason: "Couldn't reach X right now. Try again in a minute." };
  const createdAt = me.data.created_at;
  const followers = me.data.public_metrics.followers_count;
  if (Date.now() - new Date(createdAt).getTime() < minDays * 86_400_000)
    return { status: "failed", reason: `X accounts need to be at least ${minDays} days old. We can review younger accounts by hand.`, followers, createdAt };
  if (followers < minFollowers) return { status: "failed", reason: `X accounts need at least ${minFollowers} followers.`, followers, createdAt };

  const project = await x<{ data?: { id: string } }>(`/users/by/username/${projectHandle}`);
  if (!project?.data) return { status: "pending", reason: "Couldn't reach X right now. Try again in a minute.", followers, createdAt };
  // Walk the member's follow list (most people follow a few thousand accounts at most).
  let next: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = await x<{ data?: { id: string }[]; meta?: { next_token?: string } }>(`/users/${userId}/following?max_results=1000${next ? `&pagination_token=${next}` : ""}`);
    if (!res) return { status: "pending", reason: "Couldn't reach X right now. Try again in a minute.", followers, createdAt };
    if (res.data?.some((u) => u.id === project.data!.id)) return { status: "verified", followers, createdAt };
    next = res.meta?.next_token;
    if (!next) break;
  }
  return { status: "failed", reason: `We couldn't find @${projectHandle} in your follows yet. Follow, wait a moment, then check again.`, followers, createdAt };
}

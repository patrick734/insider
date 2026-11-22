import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { startSession } from "@/server/session-cookie";
import { privyLinkedAccounts } from "@/server/x";

/**
 * Sign in with Privy's identity token instead of a signed message. Privy signs the token for this app and lists the
 * wallets it has verified for the person (including the one it creates for X sign-ins), so no extra signature prompt.
 * 409 when the wallet isn't in the token yet: the app then falls back to a signed message.
 */
export const POST = handle(async (req: Request) => {
  const { idToken, accessToken, address } = await body<{ idToken?: string; accessToken?: string; address: string }>(req);
  if ((typeof idToken !== "string" && typeof accessToken !== "string") || !isAddress(address)) throw new HttpError(400, "Bad sign-in.");
  const addr = address.toLowerCase();
  if (!(await rateLimit(`auth:${addr}`, 10, 60))) throw new HttpError(429, "Too many tries. Wait a minute.");
  const accounts = await privyLinkedAccounts(idToken ?? "", accessToken);
  if (!accounts) console.warn("[auth/privy] identity token did not verify (check the Privy App ID and that identity tokens are on)");
  if (!accounts) throw new HttpError(401, "That sign-in didn't check out. Try again.");
  const linked = accounts.some((a) => a.type === "wallet" && a.chain_type !== "solana" && a.address?.toLowerCase() === addr);
  if (!linked) console.warn(`[auth/privy] wallet not in identity token; linked types: ${accounts.map((a) => a.type).join(",") || "none"}`);
  if (!linked) throw new HttpError(409, "Wallet not linked yet.");
  await startSession(addr);
  return NextResponse.json({ ok: true });
});

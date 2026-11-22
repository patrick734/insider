import { NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { CHAIN_ID, publicClient, sql } from "@insider/core";
import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { startSession } from "@/server/session-cookie";

/**
 * Exchange a signed sign-in message for a session cookie. verifyMessage on a public client checks plain wallets,
 * deployed smart wallets (ERC-1271) and not-yet-deployed smart wallets (ERC-6492).
 */
export const POST = handle(async (req: Request) => {
  const { address, message, signature } = await body<{ address: string; message: string; signature: Hex }>(req);
  if (!isAddress(address) || typeof message !== "string" || typeof signature !== "string") throw new HttpError(400, "Bad sign-in.");
  const addr = address.toLowerCase();
  if (!(await rateLimit(`auth:${addr}`, 10, 60))) throw new HttpError(429, "Too many tries. Wait a minute.");

  const nonce = /\nNonce: ([0-9a-f]{32})\n/.exec(message)?.[1];
  if (!message.includes(`Address: ${addr}`) || !message.includes(`Chain: ${CHAIN_ID}`) || !nonce) throw new HttpError(400, "Bad sign-in message.");
  const used = await sql()`delete from auth_nonces where nonce = ${nonce} and created_at > now() - interval '10 minutes' returning nonce`;
  if (used.length === 0) throw new HttpError(400, "That sign-in expired. Try again.");

  const ok = await publicClient().verifyMessage({ address: addr as `0x${string}`, message, signature });
  if (!ok) throw new HttpError(401, "Signature didn't match the wallet.");

  await startSession(addr);
  return NextResponse.json({ ok: true });
});

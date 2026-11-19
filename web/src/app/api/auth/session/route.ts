import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAddress, type Hex } from "viem";
import { CHAIN_ID, publicClient, sql } from "@insider/core";
import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { setSessionCookie } from "@/server/session-cookie";

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

  const [u] = await sql()`insert into users (address) values (${addr}) on conflict (address) do update set address = excluded.address returning id, (xmax = 0) as created`;
  // A brand-new account that arrived through an invite link: credit the inviter.
  const ref = (await cookies()).get("insider_ref")?.value;
  if (u.created && ref && /^[a-z0-9]{6,12}$/.test(ref)) {
    const [inv] = await sql()`update invites set uses = uses + 1 where code = ${ref} returning inviter_id`;
    if (inv && String(inv.inviter_id) !== String(u.id)) await sql()`update users set invited_by = ${inv.inviter_id} where id = ${u.id}`;
  }
  await setSessionCookie(String(u.id), addr);
  return NextResponse.json({ ok: true });
});

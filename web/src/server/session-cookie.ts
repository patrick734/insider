import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_DAYS, signSession, sql } from "@insider/core";

export async function setSessionCookie(uid: string, addr: string) {
  const token = await signSession({ uid, addr });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/**
 * Sign in a wallet address that has been proven (by a signature or a Privy token): create the account if new, credit
 * the inviter for a brand-new account that arrived through an invite link, and set the session cookie.
 */
export async function startSession(addr: string) {
  const [u] = await sql()`insert into users (address) values (${addr}) on conflict (address) do update set address = excluded.address returning id, (xmax = 0) as created`;
  const ref = (await cookies()).get("insider_ref")?.value;
  if (u.created && ref && /^[a-z0-9]{6,12}$/.test(ref)) {
    const [inv] = await sql()`select user_id from referral_codes where code = ${ref} and active`;
    if (inv && String(inv.user_id) !== String(u.id)) await sql()`update users set invited_by = ${inv.user_id} where id = ${u.id}`;
  }
  await setSessionCookie(String(u.id), addr);
}

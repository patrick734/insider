import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { demoLoginEnabled } from "@/server/demo";
import { checkX } from "@/server/x";
import { MIN_X_ACCOUNT_DAYS, MIN_X_FOLLOWERS, PROJECT_X_HANDLE, markVerified, waitlistMe } from "@/server/waitlist";

/** Check the X follow (and the anti-sybil rules). Verified members get a founder number while spots last. */
export const POST = handle(async () => {
  const me = await requireMe();
  if (!(await rateLimit(`verify:${me.id}`, 10, 600))) throw new HttpError(429, "Too many checks. Try again in a few minutes.");
  const [u] = await sql()`select x_user_id, waitlist_joined_at from users where id = ${me.id}`;
  if (!u?.waitlist_joined_at) throw new HttpError(400, "Join the waitlist first.");
  if (!u.x_user_id) throw new HttpError(400, "Link your X account first.");

  // Demo: no X API, so the follow counts straight away (sample data only).
  if (demoLoginEnabled()) {
    await markVerified(me.id);
    return NextResponse.json({ ...(await waitlistMe(me.id)), message: "Verified (demo)." });
  }

  const check = await checkX(String(u.x_user_id), PROJECT_X_HANDLE, MIN_X_ACCOUNT_DAYS, MIN_X_FOLLOWERS);
  await sql()`update users set x_followers = coalesce(${check.followers ?? null}, x_followers), x_created_at = coalesce(${check.createdAt ?? null}, x_created_at) where id = ${me.id}`;
  if (check.status === "verified") await markVerified(me.id);
  else await sql()`update users set follow_state = 'pending' where id = ${me.id} and follow_state = 'none'`;
  return NextResponse.json({ ...(await waitlistMe(me.id)), message: check.reason ?? null });
});

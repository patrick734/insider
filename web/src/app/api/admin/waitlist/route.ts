import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { isAdmin } from "@/server/access";

/**
 * Review actions on the waitlist (admins only): hold or clear someone's rank before a perk goes out, and grant or
 * remove app access. Every rank change is an event, so the leaderboard can always be explained.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  if (!isAdmin(me)) throw new HttpError(403, "Admins only.");
  const { action, userId, note } = await body<{ action: "hold" | "clear" | "grant" | "revoke"; userId: string; note?: string }>(req);
  if (!/^\d+$/.test(String(userId))) throw new HttpError(400, "Bad user.");
  const n = note?.slice(0, 200) ?? null;
  if (action === "hold") await sql()`insert into points_events (user_id, kind, points, note) values (${userId}, 'review_hold', 0, ${n ?? `held by @${me.handle ?? me.address}`})`;
  else if (action === "clear") await sql()`insert into points_events (user_id, kind, points, note) values (${userId}, 'review_clear', 0, ${n ?? `cleared by @${me.handle ?? me.address}`})`;
  else if (action === "grant") {
    await sql()`update users set app_access = true, app_access_at = now() where id = ${userId}`;
    await sql()`insert into points_events (user_id, kind, points, note) values (${userId}, 'perk_granted', 0, ${n ?? "app access"})`;
  } else if (action === "revoke") await sql()`update users set app_access = false where id = ${userId}`;
  else throw new HttpError(400, "Unknown action.");
  return NextResponse.json({ ok: true });
});

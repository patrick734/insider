import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { handle } from "@/server/http";
import { rateLimit } from "@/server/redis";

/** Toggle following a user. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe();
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id) || id === me.id) throw new HttpError(400, "Can't follow that.");
  if (!(await rateLimit(`follow:${me.id}`, 60, 3600))) throw new HttpError(429, "That's a lot of follows. Try again later.");
  const removed = await sql()`delete from follows where follower_id = ${me.id} and followee_id = ${id} returning followee_id`;
  if (removed.length) return NextResponse.json({ following: false });
  const added = await sql()`insert into follows (follower_id, followee_id) select ${me.id}, ${id} where exists (select 1 from users where id = ${id}) on conflict do nothing returning followee_id`;
  if (added.length) {
    // One follow notification per pair per day, so follow/unfollow loops don't spam.
    await sql()`
      insert into notifications (user_id, kind, actor_id)
      select ${id}, 'follow', ${me.id}
      where not exists (select 1 from notifications where user_id = ${id} and kind = 'follow' and actor_id = ${me.id} and created_at > now() - interval '1 day')`;
  }
  return NextResponse.json({ following: true });
});

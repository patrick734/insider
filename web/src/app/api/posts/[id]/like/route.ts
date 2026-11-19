import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { requireMe } from "@/server/auth";
import { handle } from "@/server/http";

/** Toggle a like. Counts are kept on the post so feeds never count rows. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe();
  const { id } = await ctx.params;
  const removed = await sql()`delete from post_likes where post_id = ${id} and user_id = ${me.id} returning post_id`;
  if (removed.length) {
    await sql()`update posts set like_count = greatest(like_count - 1, 0) where id = ${id}`;
    return NextResponse.json({ liked: false });
  }
  const added = await sql()`insert into post_likes (post_id, user_id) select ${id}, ${me.id} where exists (select 1 from posts where id = ${id}) on conflict do nothing returning post_id`;
  if (added.length) await sql()`update posts set like_count = like_count + 1 where id = ${id}`;
  return NextResponse.json({ liked: true });
});

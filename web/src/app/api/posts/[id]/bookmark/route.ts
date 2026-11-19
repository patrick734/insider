import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { requireMe } from "@/server/auth";
import { handle } from "@/server/http";

/** Toggle a bookmark (private: only you see your bookmarks). */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireMe();
  const { id } = await ctx.params;
  const removed = await sql()`delete from bookmarks where post_id = ${id} and user_id = ${me.id} returning post_id`;
  if (removed.length) return NextResponse.json({ bookmarked: false });
  await sql()`insert into bookmarks (post_id, user_id) select ${id}, ${me.id} where exists (select 1 from posts where id = ${id}) on conflict do nothing`;
  return NextResponse.json({ bookmarked: true });
});

import { NextResponse } from "next/server";
import { ensureMember, roomAccess, sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { handle } from "@/server/http";

/** Check access now (live balances) and add the room to your chats. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const me = await requireMe();
  const { slug } = await ctx.params;
  const [room] = await sql()`select id from rooms where slug = ${slug}`;
  if (!room) throw new HttpError(404, "No such room.");
  const access = await roomAccess(sql(), String(room.id), me.id);
  if (access.ok) await ensureMember(sql(), String(room.id), me.id);
  return NextResponse.json(access);
});

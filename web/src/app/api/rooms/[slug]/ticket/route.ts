import { NextResponse } from "next/server";
import { roomAccess, signTicket, sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { handle } from "@/server/http";
import { REALTIME_URL } from "@/lib/config";

export const dynamic = "force-dynamic";

/** A two-minute ticket to open this room's socket, only for people who can enter. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const me = await requireMe();
  const { slug } = await ctx.params;
  const [room] = await sql()`select id from rooms where slug = ${slug}`;
  if (!room) throw new HttpError(404, "No such room.");
  const access = await roomAccess(sql(), String(room.id), me.id);
  if (!access.ok) throw new HttpError(403, "Hold a key or the room's coin to join.");
  return NextResponse.json({ url: `${REALTIME_URL}/ws`, ticket: await signTicket({ uid: me.id, room: String(room.id) }) });
});

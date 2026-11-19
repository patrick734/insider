import { NextResponse } from "next/server";
import { ChatError, postMessage, recentMessages, roomAccess, roomChannel, sql, type RoomEvent } from "@insider/core";
import { HttpError, getMe, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { publish, rateLimit } from "@/server/redis";

type Ctx = { params: Promise<{ slug: string }> };

async function roomId(slug: string) {
  const [room] = await sql()`select id from rooms where slug = ${slug}`;
  if (!room) throw new HttpError(404, "No such room.");
  return String(room.id);
}

/** Older messages, for scrolling back. Readable only by people who can enter. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const id = await roomId((await ctx.params).slug);
  const me = await getMe();
  const access = await roomAccess(sql(), id, me?.id ?? null);
  if (!access.ok) throw new HttpError(403, "Hold a key or the room's coin to read this room.");
  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  return NextResponse.json({ messages: await recentMessages(sql(), id, before && /^\d+$/.test(before) ? before : undefined) });
});

/** Send without a socket (fallback when the socket is down). Same checks as the realtime service. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireMe();
  const id = await roomId((await ctx.params).slug);
  if (!(await rateLimit(`chat:${me.id}`, 5, 10))) throw new HttpError(429, "You're sending fast. Wait a few seconds.");
  const { body: text } = await body<{ body: string }>(req);
  try {
    const m = await postMessage(sql(), id, me.id, String(text ?? ""));
    await publish(roomChannel(id), { type: "message", message: m } satisfies RoomEvent);
    return NextResponse.json({ message: m });
  } catch (e) {
    if (e instanceof ChatError) throw new HttpError(e.status, e.message);
    throw e;
  }
});

import { NextResponse } from "next/server";
import { roomChannel, sql, type RoomEvent } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { publish } from "@/server/redis";

type Ctx = { params: Promise<{ slug: string }> };

/** Host controls: topic, going live, open or gated, slow mode. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireMe();
  const { slug } = await ctx.params;
  const [room] = await sql()`select id, host_id from rooms where slug = ${slug}`;
  if (!room) throw new HttpError(404, "No such room.");
  if (String(room.host_id) !== me.id) throw new HttpError(403, "Only the host can change the room.");
  const b = await body<{ topic?: string; isLive?: boolean; liveTitle?: string; access?: "open" | "gated"; slowModeSeconds?: number }>(req);
  const [r] = await sql()`
    update rooms set
      topic = coalesce(${b.topic?.slice(0, 120) ?? null}, topic),
      is_live = coalesce(${b.isLive ?? null}, is_live),
      live_title = case when ${b.isLive ?? null}::boolean is false then null else coalesce(${b.liveTitle?.slice(0, 80) ?? null}, live_title) end,
      access = coalesce(${b.access ?? null}, access),
      slow_mode_seconds = coalesce(${b.slowModeSeconds === undefined ? null : Math.max(0, Math.min(600, b.slowModeSeconds))}, slow_mode_seconds)
    where id = ${room.id} returning is_live, live_title`;
  if (b.isLive !== undefined) {
    await publish(roomChannel(String(room.id)), { type: "live", isLive: Boolean(r.is_live), title: (r.live_title as string) ?? null } satisfies RoomEvent);
    if (b.isLive) {
      // Tell members the room went live (they opted in by joining).
      await sql()`
        insert into notifications (user_id, kind, actor_id, data)
        select m.user_id, 'room_live', ${me.id}, ${sql().json({ room: slug, title: String(r.live_title ?? "") })}
        from room_members m where m.room_id = ${room.id} and m.user_id <> ${me.id} and not m.banned`;
    }
  }
  return NextResponse.json({ ok: true });
});

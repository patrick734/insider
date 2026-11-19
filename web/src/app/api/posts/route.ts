import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { notifyMentions } from "@/server/notify";

export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const b = await body<{ body: string; roomId?: string | null; replyTo?: string | null; mediaIds?: string[] }>(req);
  const text = String(b.body ?? "").trim();
  const mediaIds = Array.isArray(b.mediaIds) ? b.mediaIds.filter((x) => /^[a-z0-9]{24}$/.test(String(x))).slice(0, 4) : [];
  if (mediaIds.length) {
    const own = await sql()`select id from media where id in ${sql()(mediaIds)} and user_id = ${me.id}`;
    if (own.length !== mediaIds.length) throw new HttpError(400, "Those images aren't yours.");
  }
  if (!text && !mediaIds.length) throw new HttpError(400, "Write something first.");
  if (text.length > 500) throw new HttpError(400, "Posts are 500 characters at most.");
  if (!(await rateLimit(`post:${me.id}`, 10, 60))) throw new HttpError(429, "You're posting fast. Wait a minute.");
  if (b.roomId) {
    const [m] = await sql()`select 1 from room_members where room_id = ${b.roomId} and user_id = ${me.id} and not banned`;
    if (!m) throw new HttpError(403, "Join that room first.");
  }
  const [p] = await sql()`
    insert into posts (user_id, body, room_id, reply_to_id, media_ids) values (${me.id}, ${text}, ${b.roomId ?? null}, ${b.replyTo ?? null}, ${mediaIds}) returning id`;
  if (b.replyTo) {
    await sql()`update posts set reply_count = reply_count + 1 where id = ${b.replyTo}`;
    const [parent] = await sql()`select user_id from posts where id = ${b.replyTo}`;
    if (parent && String(parent.user_id) !== me.id)
      await sql()`insert into notifications (user_id, kind, actor_id, data) values (${parent.user_id}, 'reply', ${me.id}, ${sql().json({ postId: String(p.id), excerpt: text.slice(0, 120) })})`;
  }
  await notifyMentions(me.id, text, String(p.id));
  return NextResponse.json({ id: String(p.id) });
});

import "server-only";
import { sql, userChannel } from "@insider/core";
import { publish } from "./redis";

/** Notify everyone @mentioned in a post (up to 10 per post). */
export async function notifyMentions(actorId: string, text: string, postId: string) {
  const handles = [...new Set([...text.matchAll(/@([a-z0-9_]{3,20})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 10);
  if (!handles.length) return;
  const users = await sql()`select id from users where handle in ${sql()(handles)} and id <> ${actorId}`;
  for (const u of users) {
    await sql()`insert into notifications (user_id, kind, actor_id, data) values (${u.id}, 'mention', ${actorId}, ${sql().json({ postId, excerpt: text.slice(0, 140) })})`;
    await publish(userChannel(String(u.id)), { type: "notification" });
  }
}

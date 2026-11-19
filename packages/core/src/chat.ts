import { roomAccess, ensureMember } from "./access";
import type { ChatMessage } from "./channels";
import type { Sql } from "./db";

export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGE_COLUMNS = `m.id, m.room_id, m.kind, m.body, m.meta, m.created_at,
  u.id as user_id, u.handle, u.name, u.address,
  (select role from room_members rm where rm.room_id = m.room_id and rm.user_id = u.id) as role,
  coalesce((select balance from key_balances kb join rooms r on r.id = m.room_id join users h on h.id = r.host_id
            where kb.subject = h.address and kb.holder = u.address), 0) as keys`;

export function toChatMessage(r: Record<string, unknown>): ChatMessage {
  const role = r.role as string | null;
  const keys = Number(r.keys ?? 0);
  return {
    id: String(r.id),
    roomId: String(r.room_id),
    kind: r.kind as ChatMessage["kind"],
    body: r.body as string,
    meta: (r.meta as Record<string, unknown>) ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    user: r.user_id
      ? {
          id: String(r.user_id),
          handle: (r.handle as string) ?? null,
          name: (r.name as string) ?? null,
          address: r.address as string,
          badge: role === "host" ? "HOST" : role === "mod" ? "MOD" : keys > 0 ? `KEY×${keys}` : "HOLDER",
        }
      : null,
  };
}

export async function recentMessages(db: Sql, roomId: string, before?: string, limit = 50): Promise<ChatMessage[]> {
  const rows = await db`
    select ${db.unsafe(MESSAGE_COLUMNS)}
    from messages m left join users u on u.id = m.user_id
    where m.room_id = ${roomId} and m.deleted_at is null ${before ? db`and m.id < ${before}` : db``}
    order by m.id desc limit ${limit}`;
  return rows.reverse().map(toChatMessage);
}

/**
 * Post a chat message: checks access (live, from indexed balances), bans, mutes and slow mode, then stores it.
 * The caller publishes the returned message to the room channel.
 */
export async function postMessage(db: Sql, roomId: string, userId: string, text: string): Promise<ChatMessage> {
  const body = text.replace(/\s+$/g, "").trim();
  if (!body) throw new ChatError(400, "Write something first.");
  if (body.length > 1000) throw new ChatError(400, "Messages are 1,000 characters at most.");
  const access = await roomAccess(db, roomId, userId);
  if (!access.ok) throw new ChatError(403, access.reason === "banned" ? "You've been removed from this room." : "Hold a key or the room's coin to chat here.");
  if (access.mutedUntil && new Date(access.mutedUntil) > new Date()) throw new ChatError(403, "You're muted in this room for now.");

  const [room] = await db`select slow_mode_seconds from rooms where id = ${roomId}`;
  const slow = Number(room?.slow_mode_seconds ?? 0);
  if (slow > 0 && access.role !== "host" && access.role !== "mod") {
    const [last] = await db`select created_at from messages where room_id = ${roomId} and user_id = ${userId} and created_at > now() - make_interval(secs => ${slow}) limit 1`;
    if (last) throw new ChatError(429, `Slow mode: one message every ${slow} seconds.`);
  }

  await ensureMember(db, roomId, userId);
  const [m] = await db`insert into messages (room_id, user_id, kind, body) values (${roomId}, ${userId}, 'text', ${body}) returning id, created_at`;
  const [row] = await db`select ${db.unsafe(MESSAGE_COLUMNS)} from messages m left join users u on u.id = m.user_id where m.id = ${m.id} and m.created_at = ${m.created_at}`;
  return toChatMessage(row);
}

/** Hosts and mods: delete a message, mute someone for a while, or remove them. */
export async function moderate(
  db: Sql,
  roomId: string,
  actorId: string,
  action: { type: "delete"; messageId: string } | { type: "mute"; userId: string; minutes: number } | { type: "ban"; userId: string } | { type: "slow"; seconds: number },
): Promise<void> {
  const [me] = await db`select role from room_members where room_id = ${roomId} and user_id = ${actorId}`;
  if (me?.role !== "host" && me?.role !== "mod") throw new ChatError(403, "Only the host and mods can do that.");
  if (action.type === "delete") await db`update messages set deleted_at = now() where id = ${action.messageId} and room_id = ${roomId}`;
  if (action.type === "mute")
    await db`insert into room_members (room_id, user_id, muted_until) values (${roomId}, ${action.userId}, now() + make_interval(mins => ${action.minutes}))
             on conflict (room_id, user_id) do update set muted_until = excluded.muted_until`;
  if (action.type === "ban")
    await db`insert into room_members (room_id, user_id, banned) values (${roomId}, ${action.userId}, true)
             on conflict (room_id, user_id) do update set banned = true`;
  if (action.type === "slow") await db`update rooms set slow_mode_seconds = ${Math.max(0, Math.min(600, action.seconds))} where id = ${roomId}`;
}

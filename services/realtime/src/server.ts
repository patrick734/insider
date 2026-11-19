import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { WebSocketServer, type WebSocket } from "ws";
import { ACCESS_CHANNEL, ChatError, env, moderate, postMessage, roomAccess, roomChannel, sql, verifyTicket, type AccessEvent, type RoomEvent } from "@insider/core";

/**
 * Room sockets. Any number of these can run behind a load balancer: every message goes through Redis pub/sub, so a
 * message sent to one instance reaches sockets on all of them. Presence is a per-room sorted set of connection ids
 * with heartbeats, so a crashed instance's connections age out on their own.
 */

const PORT = Number(env("REALTIME_PORT", env("PORT", "4001")));
const ORIGINS = env("ALLOWED_ORIGINS", "").split(",").map((s) => s.trim()).filter(Boolean);
const db = sql();
const pub = new Redis(env("REDIS_URL"));
const sub = new Redis(env("REDIS_URL"));
const kv = new Redis(env("REDIS_URL"));

type Conn = { id: string; ws: WebSocket; roomId: string; userId: string; address: string; alive: boolean };
const rooms = new Map<string, Set<Conn>>();
const byAddress = new Map<string, Set<Conn>>();

const send = (c: Conn, data: unknown) => c.ws.readyState === c.ws.OPEN && c.ws.send(JSON.stringify(data));

function add(c: Conn) {
  if (!rooms.has(c.roomId)) {
    rooms.set(c.roomId, new Set());
    void sub.subscribe(roomChannel(c.roomId));
  }
  rooms.get(c.roomId)!.add(c);
  if (!byAddress.has(c.address)) byAddress.set(c.address, new Set());
  byAddress.get(c.address)!.add(c);
}

function remove(c: Conn) {
  const set = rooms.get(c.roomId);
  set?.delete(c);
  if (set && set.size === 0) {
    rooms.delete(c.roomId);
    void sub.unsubscribe(roomChannel(c.roomId));
  }
  byAddress.get(c.address)?.delete(c);
  if (byAddress.get(c.address)?.size === 0) byAddress.delete(c.address);
  void kv.zrem(`online:room:${c.roomId}`, c.id);
}

async function online(roomId: string): Promise<number> {
  const key = `online:room:${roomId}`;
  await kv.zremrangebyscore(key, "-inf", Date.now() - 60_000);
  return kv.zcard(key);
}

/** Per-user send limit: 5 messages per 10 seconds, across all instances. */
async function allowed(userId: string): Promise<boolean> {
  const k = `rl:chat:${userId}:${Math.floor(Date.now() / 10_000)}`;
  const n = await kv.incr(k);
  if (n === 1) await kv.expire(k, 11);
  return n <= 5;
}

sub.on("message", (channel, raw) => {
  if (channel === ACCESS_CHANNEL) return void recheck(JSON.parse(raw) as AccessEvent);
  const roomId = channel.slice("room:".length);
  for (const c of rooms.get(roomId) ?? []) c.ws.readyState === c.ws.OPEN && c.ws.send(raw);
});
void sub.subscribe(ACCESS_CHANNEL);

/** A wallet's key or coin balance changed: drop it from any room it can no longer enter. */
async function recheck(e: AccessEvent) {
  for (const c of byAddress.get(e.holder.toLowerCase()) ?? []) {
    const a = await roomAccess(db, c.roomId, c.userId).catch(() => null);
    if (a && !a.ok) {
      send(c, { type: "denied", reason: a.reason });
      c.ws.close(4003, "access");
    }
  }
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, sockets: [...rooms.values()].reduce((n, s) => n + s.size, 0) }));
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 8 * 1024 });

wss.on("connection", async (ws, req) => {
  if (ORIGINS.length && !ORIGINS.includes(req.headers.origin ?? "")) return ws.close(4001, "origin");
  const url = new URL(req.url ?? "", "http://x");
  const ticket = await verifyTicket(url.searchParams.get("ticket"));
  if (!ticket) return ws.close(4001, "ticket");
  const access = await roomAccess(db, ticket.room, ticket.uid).catch(() => null);
  if (!access?.ok) {
    ws.send(JSON.stringify({ type: "denied", reason: access?.reason ?? "error" }));
    return ws.close(4003, "access");
  }
  const [u] = await db`select address from users where id = ${ticket.uid}`;
  const c: Conn = { id: randomUUID(), ws, roomId: ticket.room, userId: ticket.uid, address: String(u.address), alive: true };
  add(c);
  await kv.zadd(`online:room:${c.roomId}`, Date.now(), c.id);
  send(c, { type: "ready", via: access.via, online: await online(c.roomId) });

  ws.on("pong", () => (c.alive = true));
  ws.on("close", () => remove(c));
  ws.on("message", async (raw) => {
    let msg: { type?: string; body?: string; action?: Parameters<typeof moderate>[3] };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    try {
      if (msg.type === "send") {
        if (!(await allowed(c.userId))) throw new ChatError(429, "You're sending fast. Wait a few seconds.");
        const m = await postMessage(db, c.roomId, c.userId, String(msg.body ?? ""));
        const event: RoomEvent = { type: "message", message: m };
        await pub.publish(roomChannel(c.roomId), JSON.stringify(event));
      } else if (msg.type === "mod" && msg.action) {
        await moderate(db, c.roomId, c.userId, msg.action);
        if (msg.action.type === "delete") await pub.publish(roomChannel(c.roomId), JSON.stringify({ type: "deleted", id: msg.action.messageId } satisfies RoomEvent));
      }
    } catch (e) {
      send(c, { type: "error", message: e instanceof ChatError ? e.message : "Couldn't send that." });
      if (!(e instanceof ChatError)) console.error(e);
    }
  });
});

// Heartbeats: drop dead sockets, refresh presence, tell each room how many are in it.
setInterval(async () => {
  const now = Date.now();
  for (const [roomId, set] of rooms) {
    for (const c of set) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
      await kv.zadd(`online:room:${roomId}`, now, c.id);
    }
    const n = await online(roomId);
    for (const c of set) send(c, { type: "presence", online: n } satisfies RoomEvent);
  }
}, 25_000);

// A slow safety net in case an access event was missed.
setInterval(async () => {
  for (const set of rooms.values())
    for (const c of set) {
      const a = await roomAccess(db, c.roomId, c.userId).catch(() => null);
      if (a && !a.ok) {
        send(c, { type: "denied", reason: a.reason });
        c.ws.close(4003, "access");
      }
    }
}, 5 * 60_000);

server.listen(PORT, () => console.log(`realtime on :${PORT}`));

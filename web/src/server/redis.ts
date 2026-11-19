import "server-only";
import Redis from "ioredis";

const g = globalThis as unknown as { __insiderRedis?: Redis | null };

/** Shared Redis connection, or null when REDIS_URL isn't set (the app still works, without live counts). */
export function redis(): Redis | null {
  if (g.__insiderRedis !== undefined) return g.__insiderRedis;
  const url = process.env.REDIS_URL;
  g.__insiderRedis = url ? new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: true }) : null;
  g.__insiderRedis?.on("error", () => {});
  return g.__insiderRedis;
}

/** People connected to each room in the last minute, as tracked by the realtime service. */
export async function onlineCounts(roomIds: string[]): Promise<Record<string, number>> {
  const r = redis();
  const out: Record<string, number> = {};
  if (!r || roomIds.length === 0) return out;
  const since = Date.now() - 60_000;
  try {
    const p = r.pipeline();
    for (const id of roomIds) p.zcount(`online:room:${id}`, since, "+inf");
    const res = await p.exec();
    roomIds.forEach((id, i) => (out[id] = Number(res?.[i]?.[1] ?? 0)));
  } catch {
    // Live counts are a nicety; never fail a page over them.
  }
  return out;
}

export async function publish(channel: string, event: unknown): Promise<void> {
  try {
    await redis()?.publish(channel, JSON.stringify(event));
  } catch {
    // The realtime service also polls; a missed publish only delays delivery.
  }
}

/** Fixed-window rate limit. Returns true if allowed. Without Redis everything is allowed. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const r = redis();
  if (!r) return true;
  try {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, windowSec + 1);
    return n <= limit;
  } catch {
    return true;
  }
}

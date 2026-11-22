import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

/** For uptime monitors: 200 when the database (and Redis, if configured) answer. */
export async function GET() {
  const checks: Record<string, boolean> = {};
  try {
    await sql()`select 1`;
    checks.db = true;
  } catch {
    checks.db = false;
  }
  const r = redis();
  if (r) checks.redis = await r.ping().then((x) => x === "PONG").catch(() => false);
  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}

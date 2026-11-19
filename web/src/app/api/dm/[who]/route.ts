import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { dmWith, userByHandleOrAddress } from "@/server/queries";

type Ctx = { params: Promise<{ who: string }> };

async function other(who: string, meId: string) {
  const u = await userByHandleOrAddress(who);
  if (!u || u.id === meId) throw new HttpError(404, "No such person.");
  return u;
}

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireMe();
  const o = await other((await ctx.params).who, me.id);
  return NextResponse.json(await dmWith(me.id, o.id));
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireMe();
  const o = await other((await ctx.params).who, me.id);
  const text = String((await body<{ body: string }>(req)).body ?? "").trim();
  if (!text) throw new HttpError(400, "Write something first.");
  if (text.length > 1000) throw new HttpError(400, "Messages are 1,000 characters at most.");
  if (!(await rateLimit(`dm:${me.id}`, 20, 60))) throw new HttpError(429, "You're sending fast. Wait a minute.");
  const [a, b] = BigInt(me.id) < BigInt(o.id) ? [me.id, o.id] : [o.id, me.id];
  const [t] = await sql()`insert into dm_threads (a_id, b_id) values (${a}, ${b}) on conflict (a_id, b_id) do update set a_id = excluded.a_id returning id`;
  await sql()`insert into dm_messages (thread_id, sender_id, body) values (${t.id}, ${me.id}, ${text})`;
  return NextResponse.json(await dmWith(me.id, o.id));
});

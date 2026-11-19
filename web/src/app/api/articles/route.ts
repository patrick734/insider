import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";

const TAGS = ["ROOMS", "KEYS", "MARKETS", "PNL", "HOSTING"];

export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  if (!me.handle) throw new HttpError(400, "Pick a handle in Settings first.");
  if (!(await rateLimit(`article:${me.id}`, 3, 86400))) throw new HttpError(429, "Three articles a day at most.");
  const b = await body<{ title: string; dek?: string; body: string; tag?: string }>(req);
  const title = String(b.title ?? "").trim();
  const text = String(b.body ?? "").trim();
  if (!title || title.length > 120) throw new HttpError(400, "Titles are 1 to 120 characters.");
  if (text.length < 200 || text.length > 40_000) throw new HttpError(400, "Articles are 200 to 40,000 characters.");
  const tag = TAGS.includes(String(b.tag)) ? String(b.tag) : "ROOMS";
  const [a] = await sql()`
    insert into articles (user_id, title, dek, body, tag, cover_label, published_at)
    values (${me.id}, ${title}, ${b.dek?.trim().slice(0, 240) || null}, ${text}, ${tag}, ${tag}, now()) returning id`;
  return NextResponse.json({ id: String(a.id) });
});

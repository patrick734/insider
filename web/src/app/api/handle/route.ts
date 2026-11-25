import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { getMe } from "@/server/auth";
import { handle } from "@/server/http";

/** Is this handle free? Used while typing on the welcome screen (your own current handle counts as free). */
export const GET = handle(async (req: Request) => {
  const h = new URL(req.url).searchParams.get("h")?.trim().toLowerCase().replace(/^@/, "") ?? "";
  if (!/^[a-z0-9_]{3,20}$/.test(h)) return NextResponse.json({ valid: false, available: false });
  const me = await getMe();
  const [u] = await sql()`select id from users where handle = ${h}`;
  return NextResponse.json({ valid: true, available: !u || String(u.id) === String(me?.id) });
});

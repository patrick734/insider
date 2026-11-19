import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { requireMe } from "@/server/auth";
import { handle } from "@/server/http";

export const POST = handle(async () => {
  const me = await requireMe();
  await sql()`update notifications set read_at = now() where user_id = ${me.id} and read_at is null and created_at > now() - interval '60 days'`;
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { sql } from "@insider/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = randomBytes(16).toString("hex");
  await sql()`insert into auth_nonces (nonce) values (${nonce})`;
  // Old nonces are useless after 10 minutes; prune a few on the way.
  await sql()`delete from auth_nonces where created_at < now() - interval '10 minutes'`;
  return NextResponse.json({ nonce });
}

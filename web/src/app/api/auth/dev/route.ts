import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { setSessionCookie } from "@/server/session-cookie";
import { demoLoginEnabled } from "@/server/demo";

/** Demo and local development only: sign in as a seeded user without a wallet (see server/demo.ts). */
export const POST = handle(async (req: Request) => {
  if (!demoLoginEnabled()) throw new HttpError(404, "Not found.");
  const { handle: h } = await body<{ handle: string }>(req);
  const key = String(h).toLowerCase();
  const [u] = await sql()`select id, address from users where handle = ${key} or address = ${key}`;
  if (!u) throw new HttpError(404, "No such seeded user.");
  await setSessionCookie(String(u.id), u.address as string);
  return NextResponse.json({ ok: true });
});

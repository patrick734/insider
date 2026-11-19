import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { setSessionCookie } from "@/server/session-cookie";

/** Local development only: sign in as a seeded user without a wallet. Off unless DEV_LOGIN=1 outside production. */
export const POST = handle(async (req: Request) => {
  if (process.env.NODE_ENV === "production" || process.env.DEV_LOGIN !== "1") throw new HttpError(404, "Not found.");
  const { handle: h } = await body<{ handle: string }>(req);
  const [u] = await sql()`select id, address from users where handle = ${String(h).toLowerCase()}`;
  if (!u) throw new HttpError(404, "No such seeded user.");
  await setSessionCookie(String(u.id), u.address as string);
  return NextResponse.json({ ok: true });
});

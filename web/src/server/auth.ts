import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, sql } from "@insider/core";
import type { UserLite } from "@/lib/types";
import { USER_COLUMNS, toUser } from "./rows";

export type Me = UserLite & { bio: string | null; xHandle: string | null };

/** The signed-in user for this request, or null. */
export async function getMe(): Promise<Me | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  if (!claims) return null;
  const rows = await sql()`
    select ${sql().unsafe(USER_COLUMNS)}, u.bio, u.x_handle
    from users u left join pnl_stats p on p.user_id = u.id and p.period = '30d'
    where u.id = ${claims.uid}`;
  if (!rows[0]) return null;
  return { ...toUser(rows[0]), bio: (rows[0].bio as string) ?? null, xHandle: (rows[0].x_handle as string) ?? null };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) throw new HttpError(401, "Sign in first.");
  return me;
}

import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, getMe, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ me: await getMe() });
}

/** Edit your profile: handle, name, bio, X handle, whether your PnL shows. */
export const PATCH = handle(async (req: Request) => {
  const me = await requireMe();
  const b = await body<{ handle?: string; name?: string; bio?: string; xHandle?: string; pnlVisible?: boolean }>(req);
  const handle = b.handle?.trim().toLowerCase().replace(/^@/, "");
  if (handle !== undefined && !/^[a-z0-9_]{3,20}$/.test(handle)) throw new HttpError(400, "Handles are 3 to 20 letters, numbers or underscores.");
  if (b.name !== undefined && b.name.length > 40) throw new HttpError(400, "Names are 40 characters at most.");
  if (b.bio !== undefined && b.bio.length > 280) throw new HttpError(400, "Bios are 280 characters at most.");
  try {
    await sql()`
      update users set
        handle = coalesce(${handle ?? null}, handle),
        name = coalesce(${b.name?.trim() ?? null}, name),
        bio = coalesce(${b.bio?.trim() ?? null}, bio),
        x_handle = coalesce(${b.xHandle?.trim().replace(/^@/, "") ?? null}, x_handle),
        pnl_visible = coalesce(${b.pnlVisible ?? null}, pnl_visible),
        onboarded_at = case when ${handle ?? null}::text is not null then coalesce(onboarded_at, now()) else onboarded_at end
      where id = ${me.id}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "That handle is taken.");
    throw e;
  }
  return NextResponse.json({ me: await getMe() });
});

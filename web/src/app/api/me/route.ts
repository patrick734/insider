import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, getMe, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ me: await getMe() });
}

/**
 * Edit your profile: handle, name, bio, X handle (only while X isn't linked through sign-in), whether your PnL shows,
 * your photo and banner (`avatar` / `banner`: an image you uploaded, or null to remove it).
 */
export const PATCH = handle(async (req: Request) => {
  const me = await requireMe();
  const b = await body<{ handle?: string; name?: string; bio?: string; xHandle?: string; pnlVisible?: boolean; avatar?: string | null; banner?: string | null }>(req);
  const handle = b.handle?.trim().toLowerCase().replace(/^@/, "");
  if (handle !== undefined && !/^[a-z0-9_]{3,20}$/.test(handle)) throw new HttpError(400, "Handles are 3 to 20 letters, numbers or underscores.");
  if (b.name !== undefined && b.name.length > 40) throw new HttpError(400, "Names are 40 characters at most.");
  if (b.bio !== undefined && b.bio.length > 280) throw new HttpError(400, "Bios are 280 characters at most.");
  if (b.avatar !== undefined) {
    if (b.avatar === null) await sql()`update users set avatar_url = null, avatar_source = 'default' where id = ${me.id}`;
    else {
      const [m] = /^[0-9a-f]{24}$/.test(String(b.avatar)) ? await sql()`select id from media where id = ${b.avatar} and user_id = ${me.id}` : [];
      if (!m) throw new HttpError(400, "Upload the photo first.");
      await sql()`update users set avatar_url = ${`/api/media/${m.id}`}, avatar_source = 'upload' where id = ${me.id}`;
    }
  }
  if (b.banner !== undefined) {
    if (b.banner === null) await sql()`update users set banner_url = null where id = ${me.id}`;
    else {
      const [m] = /^[0-9a-f]{24}$/.test(String(b.banner)) ? await sql()`select id from media where id = ${b.banner} and user_id = ${me.id}` : [];
      if (!m) throw new HttpError(400, "Upload the banner first.");
      await sql()`update users set banner_url = ${`/api/media/${m.id}`} where id = ${me.id}`;
    }
  }
  try {
    await sql()`
      update users set
        handle = coalesce(${handle ?? null}, handle),
        name = coalesce(${b.name?.trim() ?? null}, name),
        bio = coalesce(${b.bio?.trim() ?? null}, bio),
        x_handle = case when x_user_id is null then coalesce(${b.xHandle?.trim().replace(/^@/, "") ?? null}, x_handle) else x_handle end,
        pnl_visible = coalesce(${b.pnlVisible ?? null}, pnl_visible),
        onboarded_at = case when ${handle ?? null}::text is not null then coalesce(onboarded_at, now()) else onboarded_at end
      where id = ${me.id}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "That handle is taken.");
    throw e;
  }
  return NextResponse.json({ me: await getMe() });
});

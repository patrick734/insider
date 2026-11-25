import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "@insider/core";
import { HttpError } from "./auth";
import { putObject, sniffImage } from "./storage";
import { xDetails, type XAccount } from "./x";

const MAX_PHOTO = 4 * 1024 * 1024;

/**
 * Copy an X photo or banner into our own storage (so we don't hotlink X, and it survives the person changing theirs on
 * X). Only X's image host is fetched. Photos come as a 48px "_normal" size by default, so ask for 400x400; banners
 * come without a size, so ask for 1500x500.
 */
async function copyXImage(userId: string, url: string, kind: "photo" | "banner"): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(kind === "photo" ? url.replace(/_normal(\.[a-z]+)$/i, "_400x400$1") : /\/\d+x\d+$/.test(url) ? url : `${url.replace(/\/$/, "")}/1500x500`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "pbs.twimg.com") return null;
  const r = await fetch(u, { signal: AbortSignal.timeout(10_000), redirect: "error" }).catch(() => null);
  if (!r?.ok) {
    console.warn(`[x] couldn't fetch the X ${kind}: ${r ? r.status : "network error"}`);
    return null;
  }
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > MAX_PHOTO) return null;
  const mime = sniffImage(bytes);
  if (!mime) return null;
  const id = randomBytes(12).toString("hex");
  await putObject(id, bytes);
  await sql()`insert into media (id, user_id, mime, bytes) values (${id}, ${userId}, ${mime}, ${bytes.length})`;
  return `/api/media/${id}`;
}

/**
 * Record the X account Privy proved for this person. Their X photo becomes their avatar if they haven't picked one
 * (no photo and no deliberate choice), or always when `usePhoto` (the "use my X photo" button). The photo comes from
 * Privy's token, else `photoHint` (the URL Privy gives the browser); either way only X's image host is fetched.
 */
export async function linkX(userId: string, account: XAccount, usePhoto = false, photoHint?: string | null, nameHint?: string | null) {
  const name = (account.name || nameHint || "").trim().slice(0, 40) || null;
  try {
    // The X display name fills in a missing name; a name the person set themselves stays.
    await sql()`update users set x_user_id = ${account.id}, x_handle = ${account.username}, name = coalesce(name, ${name}) where id = ${userId}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "That X account is already linked to another account.");
    throw e;
  }
  await syncXDetails(userId, account.id);
  const picture = account.picture || photoHint || null;
  if (!picture) {
    if (usePhoto) throw new HttpError(404, "Your X account has no photo we can use.");
    return;
  }
  const [u] = await sql()`select avatar_url, avatar_source from users where id = ${userId}`;
  if (!usePhoto && (u?.avatar_url || u?.avatar_source)) return;
  const url = await copyXImage(userId, picture, "photo");
  if (url) await sql()`update users set avatar_url = ${url}, avatar_source = 'x' where id = ${userId}`;
  else if (usePhoto) throw new HttpError(502, "Couldn't fetch your X photo. Try again in a moment.");
}

/** Followers, account age, and (if they have none) bio and banner from the X API, at most once a day. Needs X_BEARER_TOKEN. */
async function syncXDetails(userId: string, xUserId: string) {
  if (!process.env.X_BEARER_TOKEN) return;
  const [u] = await sql()`select x_synced_at > now() - interval '1 day' as fresh, banner_url from users where id = ${userId}`;
  if (u?.fresh) return;
  const d = await xDetails(xUserId);
  if (!d) return;
  await sql()`
    update users set x_followers = ${d.followers}, x_created_at = ${d.createdAt}, x_synced_at = now(),
      bio = coalesce(bio, ${d.bio ? d.bio.slice(0, 280) : null})
    where id = ${userId}`;
  if (d.banner && !u?.banner_url) {
    const banner = await copyXImage(userId, d.banner, "banner");
    if (banner) await sql()`update users set banner_url = ${banner} where id = ${userId} and banner_url is null`;
  }
}

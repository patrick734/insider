import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { handle } from "@/server/http";
import { rateLimit } from "@/server/redis";
import { putObject, sniffImage } from "@/server/storage";

const MAX_BYTES = 5 * 1024 * 1024;

/** Upload one image (JPEG, PNG, WebP or GIF, up to 5 MB). Returns its id for attaching to a post. */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  if (!(await rateLimit(`upload:${me.id}`, 30, 3600))) throw new HttpError(429, "That's a lot of uploads. Try again later.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Images are 5 MB at most.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new HttpError(415, "Use a JPEG, PNG, WebP or GIF.");
  const id = randomBytes(12).toString("hex");
  await putObject(id, bytes);
  await sql()`insert into media (id, user_id, mime, bytes) values (${id}, ${me.id}, ${mime}, ${bytes.length})`;
  return NextResponse.json({ id, url: `/api/media/${id}` });
});

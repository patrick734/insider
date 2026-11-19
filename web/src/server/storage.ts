import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Where uploaded images live. v1: a directory on the server (UPLOAD_DIR), served by /api/media/[id] with long cache
 * headers so a CDN in front keeps them. Swap these two functions for S3 / Cloudflare R2 when traffic needs it; nothing
 * else touches the files.
 */
const dir = () => resolve(process.env.UPLOAD_DIR || join(process.cwd(), ".uploads"));

export async function putObject(id: string, bytes: Buffer): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(join(dir(), id), bytes, { flag: "wx" });
}

export async function getObject(id: string): Promise<Buffer | null> {
  if (!/^[a-z0-9]{24}$/.test(id)) return null;
  return readFile(join(dir(), id)).catch(() => null);
}

/** Image type from the file's first bytes (never trust the browser's label). */
export function sniffImage(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

import { sql } from "@insider/core";
import { getObject } from "@/server/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [m] = /^[a-z0-9]{24}$/.test(id) ? await sql()`select mime from media where id = ${id}` : [];
  const bytes = m ? await getObject(id) : null;
  if (!m || !bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": m.mime as string,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}

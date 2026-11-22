import { NextResponse } from "next/server";

/** Share links (insider.family/s/CODE): remember who invited you for 30 days, then open the waitlist. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const res = NextResponse.redirect(new URL(`/waitlist?ref=${encodeURIComponent(code)}`, req.url));
  if (/^[a-z0-9]{6,12}$/i.test(code)) res.cookies.set("insider_ref", code.toLowerCase(), { path: "/", maxAge: 30 * 86400, sameSite: "lax" });
  return res;
}

import { ImageResponse } from "next/og";
import { sql } from "@insider/core";
import { SITE } from "@/lib/config";
import { FOUNDER_SPOTS } from "@/server/waitlist";

export const dynamic = "force-dynamic";

/** The share card for an invite link: pitch, inviter, founder number, rank and the code. 1200×630 for X. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const valid = /^[a-z0-9]{6,12}$/.test(code);
  const [u] = valid
    ? await sql()`
        select coalesce(u.x_handle, u.handle) as who, u.founder_no,
          (select coalesce(sum(points), 0) from points_events e where e.user_id = u.id)::int as points
        from referral_codes c join users u on u.id = c.user_id where c.code = ${code}`
    : [];
  let rank: number | null = null;
  if (u && Number(u.points) > 0) {
    const [r] = await sql()`select count(*)::int + 1 as rank from (select user_id, sum(points) as p from points_events group by user_id) s where s.p > ${Number(u.points)}`;
    rank = Number(r.rank);
  }
  const [{ n }] = await sql()`select count(*)::int as n from users where founder_no is not null`;
  const left = Math.max(0, FOUNDER_SPOTS - Number(n));

  const blue = "#2EA8FF";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#000",
          backgroundImage: "linear-gradient(rgba(46,168,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(46,168,255,0.10) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          color: "#E8F1FA",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="58" height="58" viewBox="0 0 64 64">
            <path d="M20 8H8v48h12M44 8h12v48H44" fill="none" stroke={blue} strokeWidth="6" strokeLinecap="square" />
            <rect x="27" y="14" width="10" height="10" fill={blue} />
            <rect x="27" y="29" width="10" height="21" fill={blue} />
          </svg>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 6 }}>
            {SITE.mark}
            <span style={{ color: blue, letterSpacing: 1 }}>{SITE.tld}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", fontSize: 22, color: "#9AD6FF", letterSpacing: 4 }}>// FOUNDER WAITLIST</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 70, fontWeight: 700, lineHeight: 1.05, maxWidth: 980, fontFamily: "sans-serif" }}>{SITE.tagline}</div>
          <div style={{ fontSize: 30, color: "#9FB3C6", fontFamily: "sans-serif" }}>
            {u?.who ? `@${u.who} saved you a spot.` : "Rooms for holders. Calls with receipts. Keys that share the fees."}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
          {u?.founder_no ? (
            <div style={{ display: "flex", flexDirection: "column", border: `2px solid ${blue}`, padding: "14px 22px" }}>
              <span style={{ fontSize: 18, color: "#7E93A8", letterSpacing: 3 }}>FOUNDER</span>
              <span style={{ fontSize: 44, fontWeight: 700, color: blue }}>#{u.founder_no}</span>
            </div>
          ) : null}
          {rank ? (
            <div style={{ display: "flex", flexDirection: "column", border: "2px solid rgba(46,168,255,0.4)", padding: "14px 22px" }}>
              <span style={{ fontSize: 18, color: "#7E93A8", letterSpacing: 3 }}>RANK</span>
              <span style={{ fontSize: 44, fontWeight: 700 }}>#{rank}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", border: "2px solid rgba(46,168,255,0.4)", padding: "14px 22px" }}>
            <span style={{ fontSize: 18, color: "#7E93A8", letterSpacing: 3 }}>FOUNDER SPOTS LEFT</span>
            <span style={{ fontSize: 44, fontWeight: 700 }}>{left}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 18, color: "#7E93A8", letterSpacing: 3 }}>INVITE CODE</span>
            <span style={{ fontSize: 52, fontWeight: 700, color: "#000", background: blue, padding: "4px 18px", letterSpacing: 6 }}>{valid ? code.toUpperCase() : "—"}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=300" } },
  );
}

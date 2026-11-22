import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import { Corners, Main, Section } from "@/components/page";
import { Rail } from "@/components/rail";
import { WaitlistClient } from "@/components/waitlist-client";
import { getMe } from "@/server/auth";
import { FOUNDER_SPOTS, PROJECT_X_HANDLE, foundersLeft, leaderboard, waitlistMe } from "@/server/waitlist";
import { SITE } from "@/lib/config";
import { displayName } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Founder waitlist", description: `Join the ${SITE.name} founder waitlist. ${SITE.tagline}` };

export default async function Waitlist() {
  const me = await getMe();
  const [left, board, mine] = await Promise.all([foundersLeft(), leaderboard(50), me ? waitlistMe(me.id) : Promise.resolve(null)]);
  const taken = FOUNDER_SPOTS - left;
  return (
    <>
      <Main>
        <section className="relative overflow-hidden border-b border-line px-4 pb-8 pt-10 sm:px-6">
          <div className="art pointer-events-none absolute inset-0 opacity-60" style={{ ["--x" as string]: "85%", ["--y" as string]: "10%" }} />
          <div className="relative">
            <span className="label">// FOUNDER WAITLIST</span>
            <h1 className="mt-3 max-w-xl text-[34px] font-bold leading-[1.05] sm:text-[44px]">{SITE.tagline}</h1>
            <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-soft">
              Rooms for the people already holding a coin. Live calls with receipts. Keys that share in a room&apos;s fees. The first {FOUNDER_SPOTS} verified members are the founders.
            </p>
            <div className="panel mt-6 max-w-md p-4">
              <Corners />
              <div className="flex items-baseline justify-between">
                <span className="mono text-[10.5px] tracking-[0.14em] text-muted">FOUNDER SPOTS LEFT</span>
                <span className="mono text-[11px] text-dim">
                  {taken}/{FOUNDER_SPOTS} TAKEN
                </span>
              </div>
              <b className="mono glow mt-1 block text-[40px] leading-none text-accent">{left}</b>
              <span className="mt-3 block h-1.5 bg-accent/10">
                <span className="block h-full bg-accent shadow-[0_0_10px_rgba(46,168,255,0.7)]" style={{ width: `${Math.round((taken / FOUNDER_SPOTS) * 100)}%` }} />
              </span>
            </div>
            <p className="mono mt-4 text-[11px] leading-relaxed text-muted">No token. No points. No airdrop. Founders get a badge and early access, nothing else.</p>
          </div>
        </section>

        <WaitlistClient initial={mine} projectX={PROJECT_X_HANDLE} siteUrl={SITE.url} />

        <Section label="// HOW IT WORKS">
          <div className="grid gap-2 px-4 pb-2 sm:grid-cols-2 sm:px-5">
            {[
              ["01", "Sign in with X", "One spot per X account. A wallet is optional now and needed later for higher tiers."],
              ["02", `Follow @${PROJECT_X_HANDLE}`, "We check the follow. Accounts need to be 90+ days old with a few followers."],
              ["03", "Share your link", "Someone you invite counts once they're verified too. Clicks and half sign-ups don't."],
              ["04", "Climb the board", "Top inviters get first key access and early room creation, after a manual review."],
            ].map(([n, t, d]) => (
              <div key={n} className="panel p-3.5">
                <span className="mono text-[11px] text-accent">{n}</span>
                <b className="mt-1 block">{t}</b>
                <span className="mt-1 block text-[13px] leading-snug text-muted">{d}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section label="// LEADERBOARD · VERIFIED INVITES">
          {board.length === 0 ? (
            <p className="px-5 pb-8 text-sm text-muted">No verified invites yet. Be first on the board.</p>
          ) : (
            <div className="divide-line border-t border-line pb-6">
              {board.map((r) => (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${r.held ? "opacity-50" : ""}`}>
                  <span className={`mono grid h-7 w-7 place-items-center text-[11px] font-bold ${r.rank === 1 ? "bg-[#FFD36E] text-black" : r.rank === 2 ? "bg-[#C9D6E3] text-black" : r.rank === 3 ? "bg-[#E7A06A] text-black" : "text-dim"}`}>{r.rank}</span>
                  <Avatar user={r} size={34} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate">{displayName(r)}</b>
                    <span className="mono truncate text-[11px] text-muted">
                      {r.xHandle ? `@${r.xHandle} on X` : `@${r.handle}`}
                      {r.founderNo ? ` · FOUNDER #${r.founderNo}` : ""}
                      {r.held ? " · IN REVIEW" : ""}
                    </span>
                  </span>
                  <span className="mono flex flex-col items-end text-[11px]">
                    <b className="text-[15px] text-accent">{r.points}</b>
                    <span className="text-dim">VERIFIED</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </Main>
      <Rail />
    </>
  );
}

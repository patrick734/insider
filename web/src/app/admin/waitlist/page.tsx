import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "@insider/core";
import { Main, PageHeader, Section } from "@/components/page";
import { AdminActions } from "@/components/admin-actions";
import { getMe } from "@/server/auth";
import { isAdmin } from "@/server/access";
import { FOUNDER_SPOTS, foundersLeft } from "@/server/waitlist";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Waitlist review", robots: { index: false } };

/** Review queue: the top of the leaderboard and suspicious clusters, before any perk goes out. */
export default async function AdminWaitlist() {
  const me = await getMe();
  if (!isAdmin(me)) notFound();
  const db = sql();
  const [totals] = await db`
    select (select count(*) from users where waitlist_joined_at is not null)::int as joined,
           (select count(*) from users where follow_state = 'verified')::int as verified,
           (select count(*) from users where follow_state = 'pending')::int as pending,
           (select count(*) from referrals where state = 'rejected')::int as rejected,
           (select count(*) from users where app_access)::int as access`;
  const top = await db`
    select u.id, u.handle, u.x_handle, u.x_followers, u.x_created_at, u.founder_no, u.app_access, u.signup_ip_hash,
      coalesce(sum(e.points), 0)::int as points,
      bool_or(e.kind = 'review_hold') and not bool_or(e.kind = 'review_clear') as held,
      (select count(*) from referrals r where r.referrer_id = u.id and r.state = 'rejected')::int as rejected,
      (select count(*) from users o where o.signup_ip_hash = u.signup_ip_hash and o.id <> u.id)::int as same_network
    from users u join points_events e on e.user_id = u.id
    group by u.id order by points desc limit 20`;
  const clusters = await db`
    select signup_ip_hash, count(*)::int as n, array_agg(coalesce(x_handle, handle, address) order by id) as who
    from users where signup_ip_hash is not null group by signup_ip_hash having count(*) >= 3 order by n desc limit 20`;
  const pending = await db`select id, handle, x_handle, waitlist_joined_at from users where follow_state = 'pending' order by waitlist_joined_at limit 50`;
  const left = await foundersLeft();
  const stat = (k: string, v: string | number) => (
    <div className="panel p-3">
      <span className="mono text-[9.5px] tracking-[0.12em] text-muted">{k}</span>
      <b className="mono mt-1 block text-xl">{v}</b>
    </div>
  );
  return (
    <Main wide>
      <PageHeader title="Waitlist review" sub="ADMINS ONLY · CHECK THE TOP 20 BEFORE ANY PERK GOES OUT" />
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-6 sm:p-5">
        {stat("JOINED", totals.joined)}
        {stat("VERIFIED", totals.verified)}
        {stat("PENDING FOLLOW", totals.pending)}
        {stat("FOUNDERS", `${FOUNDER_SPOTS - left}/${FOUNDER_SPOTS}`)}
        {stat("REJECTED REFERRALS", totals.rejected)}
        {stat("APP ACCESS", totals.access)}
      </div>

      <Section label="// TOP 20">
        <div className="overflow-x-auto px-4 sm:px-5">
          <table className="mono w-full min-w-[820px] text-[12px]">
            <thead>
              <tr className="text-left text-[10px] tracking-[0.12em] text-dim">
                {["#", "MEMBER", "X FOLLOWERS", "X AGE", "VERIFIED INVITES", "REJECTED", "SAME NETWORK", "STATUS", ""].map((h) => (
                  <th key={h} className="px-2 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((u, i) => (
                <tr key={String(u.id)} className="border-t border-accent/10">
                  <td className="px-2 py-2.5 text-dim">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <b className="text-text">@{(u.x_handle as string) ?? (u.handle as string)}</b>
                    {u.founder_no ? <span className="ml-2 text-accent-soft">FOUNDER #{u.founder_no as number}</span> : null}
                  </td>
                  <td className="px-2 py-2.5">{u.x_followers ?? "—"}</td>
                  <td className="px-2 py-2.5">{u.x_created_at ? ago(u.x_created_at as Date) : "—"}</td>
                  <td className="px-2 py-2.5 text-accent">{u.points as number}</td>
                  <td className={`px-2 py-2.5 ${Number(u.rejected) > 0 ? "text-[#ff8cc3]" : ""}`}>{u.rejected as number}</td>
                  <td className={`px-2 py-2.5 ${Number(u.same_network) >= 2 ? "text-[#ff8cc3]" : ""}`}>{u.same_network as number}</td>
                  <td className="px-2 py-2.5">{u.held ? <span className="text-[#ff8cc3]">HELD</span> : u.app_access ? <span className="text-accent">ACCESS</span> : "—"}</td>
                  <td className="px-2 py-2.5">
                    <AdminActions userId={String(u.id)} held={Boolean(u.held)} access={Boolean(u.app_access)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {top.length === 0 && <p className="py-6 text-sm text-muted">No ranks yet.</p>}
        </div>
      </Section>

      <Section label="// SAME-NETWORK CLUSTERS (3+ SIGN-UPS)">
        <div className="space-y-1.5 px-4 pb-2 sm:px-5">
          {clusters.length === 0 && <p className="text-sm text-muted">None.</p>}
          {clusters.map((c) => (
            <div key={c.signup_ip_hash as string} className="panel mono flex flex-wrap gap-x-3 gap-y-1 p-3 text-[12px]">
              <b className="text-[#ff8cc3]">{c.n as number} SIGN-UPS</b>
              <span className="text-soft">{(c.who as string[]).map((w) => `@${w}`).join(" · ")}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label={`// FOLLOWS WAITING FOR A CHECK · ${pending.length}`}>
        <p className="px-4 pb-6 text-sm text-muted sm:px-5">
          {pending.length ? pending.map((p) => `@${(p.x_handle as string) ?? (p.handle as string) ?? p.id}`).join(", ") : "None."}
        </p>
      </Section>
    </Main>
  );
}

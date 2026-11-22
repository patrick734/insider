import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "@insider/core";

/** Founder cohort size from the plan: the first 200 verified members. */
export const FOUNDER_SPOTS = 200;
/** Anti-sybil starting rules (published): X account at least 90 days old, a small follower floor. */
export const MIN_X_ACCOUNT_DAYS = 90;
export const MIN_X_FOLLOWERS = 30;
/** Most verified referrals one member can be credited per day. */
export const MAX_REFERRALS_PER_DAY = 50;

export const PROJECT_X_HANDLE = process.env.NEXT_PUBLIC_PROJECT_X_HANDLE || "insiderfamily";

const db = () => sql();

export async function foundersLeft(): Promise<number> {
  const [r] = await db()`select count(*)::int as n from users where founder_no is not null`;
  return Math.max(0, FOUNDER_SPOTS - Number(r?.n ?? 0));
}

export const ipHash = (ip: string | null) => (ip ? createHash("sha256").update(`ip:${ip}:${process.env.SESSION_SECRET ?? ""}`).digest("hex").slice(0, 24) : null);

/** The member's personal code (made on first use). */
export async function codeFor(userId: string): Promise<string> {
  const [have] = await db()`select code from referral_codes where user_id = ${userId}`;
  if (have) return have.code as string;
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 7);
    if (code.length < 6) continue;
    const [r] = await db()`insert into referral_codes (code, user_id) values (${code}, ${userId}) on conflict do nothing returning code`;
    if (r) return r.code as string;
  }
  throw new Error("Couldn't make an invite code");
}

/**
 * Join the waitlist (once). If the person arrived through someone's link, record the referral as signed up. It only
 * counts toward the referrer's rank when this person is verified.
 */
export async function joinWaitlist(userId: string, refCode: string | null, ip: string | null): Promise<void> {
  const [u] = await db()`update users set waitlist_joined_at = coalesce(waitlist_joined_at, now()), signup_ip_hash = coalesce(signup_ip_hash, ${ipHash(ip)}) where id = ${userId} returning waitlist_joined_at`;
  if (!u) return;
  if (refCode && /^[a-z0-9]{6,12}$/.test(refCode)) {
    const [c] = await db()`select user_id from referral_codes where code = ${refCode} and active`;
    if (c && String(c.user_id) !== userId) {
      await db()`insert into referrals (referrer_id, invitee_id, code) values (${c.user_id}, ${userId}, ${refCode}) on conflict (invitee_id) do nothing`;
    }
  }
  await codeFor(userId);
}

/**
 * Mark someone verified (checked follow + anti-sybil checks passed): give them the next founder number while spots
 * last, and credit whoever invited them, unless it looks like a self-referral cluster or the referrer hit the daily cap.
 */
export async function markVerified(userId: string): Promise<void> {
  await db().begin(async (tx) => {
    const [u] = await tx`select id, verified_at, signup_ip_hash from users where id = ${userId} for update`;
    if (!u || u.verified_at) return;
    await tx`update users set follow_state = 'verified', verified_at = now() where id = ${userId}`;
    // Founder numbers in verification order (lock the counter so two can't take the same number).
    await tx`select pg_advisory_xact_lock(424242)`;
    const [{ n }] = await tx`select count(*)::int as n from users where founder_no is not null`;
    if (Number(n) < FOUNDER_SPOTS) await tx`update users set founder_no = ${Number(n) + 1} where id = ${userId}`;

    const [ref] = await tx`select r.id, r.referrer_id, ru.signup_ip_hash as referrer_ip from referrals r join users ru on ru.id = r.referrer_id where r.invitee_id = ${userId} and r.state = 'signed_up'`;
    if (!ref) return;
    const sameIp = ref.referrer_ip && u.signup_ip_hash && ref.referrer_ip === u.signup_ip_hash;
    const [{ today }] = await tx`select count(*)::int as today from referrals where referrer_id = ${ref.referrer_id} and state = 'verified' and verified_at > now() - interval '1 day'`;
    if (sameIp || Number(today) >= MAX_REFERRALS_PER_DAY) {
      await tx`update referrals set state = 'rejected', note = ${sameIp ? "same network as referrer" : "daily cap"} where id = ${ref.id}`;
      return;
    }
    await tx`update referrals set state = 'verified', verified_at = now() where id = ${ref.id}`;
    await tx`insert into points_events (user_id, kind, points, ref_id) values (${ref.referrer_id}, 'verified_invite', 1, ${ref.id})`;
  });
}

export type LeaderRow = { rank: number; id: string; handle: string | null; name: string | null; address: string; avatarUrl: string | null; xHandle: string | null; points: number; founderNo: number | null; held: boolean };

/** Ranks from the event log: verified invites, minus anything held in review. */
export async function leaderboard(limit = 50): Promise<LeaderRow[]> {
  const rows = await db()`
    select u.id, u.handle, u.name, u.address, u.avatar_url, u.x_handle, u.founder_no, sum(e.points)::int as points,
      bool_or(e.kind = 'review_hold') and not bool_or(e.kind = 'review_clear') as held
    from points_events e join users u on u.id = e.user_id
    group by u.id having sum(e.points) > 0
    order by points desc, min(e.created_at) asc limit ${limit}`;
  return rows.map((r, i) => ({
    rank: i + 1,
    id: String(r.id),
    handle: (r.handle as string) ?? null,
    name: (r.name as string) ?? null,
    address: r.address as string,
    avatarUrl: (r.avatar_url as string) ?? null,
    xHandle: (r.x_handle as string) ?? null,
    points: Number(r.points),
    founderNo: r.founder_no == null ? null : Number(r.founder_no),
    held: Boolean(r.held),
  }));
}

export type WaitlistMe = {
  joined: boolean;
  code: string | null;
  xHandle: string | null;
  followState: "none" | "pending" | "verified";
  founderNo: number | null;
  verifiedInvites: number;
  pendingInvites: number;
  rank: number | null;
};

export async function waitlistMe(userId: string): Promise<WaitlistMe> {
  const [u] = await db()`
    select u.waitlist_joined_at, u.x_handle, u.follow_state, u.founder_no, c.code,
      (select count(*) from referrals r where r.referrer_id = u.id and r.state = 'verified')::int as verified,
      (select count(*) from referrals r where r.referrer_id = u.id and r.state = 'signed_up')::int as pending,
      (select coalesce(sum(points), 0) from points_events e where e.user_id = u.id)::int as points
    from users u left join referral_codes c on c.user_id = u.id where u.id = ${userId}`;
  let rank: number | null = null;
  if (u && Number(u.points) > 0) {
    const [r] = await db()`
      select count(*)::int + 1 as rank from (select user_id, sum(points) as p from points_events group by user_id) s where s.p > ${Number(u.points)}`;
    rank = Number(r.rank);
  }
  return {
    joined: Boolean(u?.waitlist_joined_at),
    code: (u?.code as string) ?? null,
    xHandle: (u?.x_handle as string) ?? null,
    followState: (u?.follow_state as WaitlistMe["followState"]) ?? "none",
    founderNo: u?.founder_no == null ? null : Number(u.founder_no),
    verifiedInvites: Number(u?.verified ?? 0),
    pendingInvites: Number(u?.pending ?? 0),
    rank,
  };
}

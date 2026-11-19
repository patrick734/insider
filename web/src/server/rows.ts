import "server-only";
import type { UserLite } from "@/lib/types";

/** Columns for a UserLite; expects `users u` left-joined with `pnl_stats p` (30d). */
export const USER_COLUMNS =
  "u.id as u_id, u.address as u_address, u.handle as u_handle, u.name as u_name, u.avatar_url as u_avatar, u.is_official as u_official, case when u.pnl_visible then p.pnl_wei end as u_pnl";

export function toUser(r: Record<string, unknown>, prefix = "u_"): UserLite {
  return {
    id: String(r[`${prefix}id`]),
    address: r[`${prefix}address`] as string,
    handle: (r[`${prefix}handle`] as string) ?? null,
    name: (r[`${prefix}name`] as string) ?? null,
    avatarUrl: (r[`${prefix}avatar`] as string) ?? null,
    isOfficial: Boolean(r[`${prefix}official`]),
    pnlWei: r[`${prefix}pnl`] == null ? null : String(r[`${prefix}pnl`]),
  };
}

export const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));

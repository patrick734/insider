import "server-only";
import { sql } from "@insider/core";
import type { Me } from "./auth";

/**
 * Waitlist-first mode (WAITLIST_MODE=1): visitors see the founder waitlist; the full app opens only to people with
 * access (granted in the admin queue, or hosts) and admins. Pages that stay public in that mode are listed here.
 */
export const waitlistMode = () => process.env.WAITLIST_MODE === "1";

const PUBLIC_PATHS = ["/waitlist", "/s/", "/terms", "/privacy"];
export const isPublicPath = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p.replace(/\/$/, ""));

/** Admins come from ADMIN_ADDRESSES (comma-separated wallet addresses). */
export function isAdmin(me: Pick<Me, "address"> | null): boolean {
  if (!me) return false;
  const list = (process.env.ADMIN_ADDRESSES ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(me.address.toLowerCase());
}

export async function hasAppAccess(me: Me | null): Promise<boolean> {
  if (!waitlistMode()) return true;
  if (!me) return false;
  if (isAdmin(me)) return true;
  const [u] = await sql()`select app_access from users where id = ${me.id}`;
  return Boolean(u?.app_access);
}

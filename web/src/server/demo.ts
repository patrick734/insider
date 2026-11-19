import "server-only";

/**
 * Sign in as any seeded account without a wallet. On in local development with DEV_LOGIN=1, or on a demo deployment
 * with DEMO_LOGIN=1. Never on once real sign-in (Privy) is configured, so it can't be left on by mistake in production.
 */
export function demoLoginEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_PRIVY_APP_ID) return false;
  if (process.env.DEMO_LOGIN === "1") return true;
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "1";
}

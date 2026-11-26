/**
 * The product's name lives here and only here (set it in the env to rename the app without touching code).
 * NEXT_PUBLIC_BRAND_NAME: "Insider" · NEXT_PUBLIC_BRAND_DOMAIN: "insider.family"
 */
const name = process.env.NEXT_PUBLIC_BRAND_NAME || "Insider";
const domain = process.env.NEXT_PUBLIC_BRAND_DOMAIN || "insider.family";
const dot = domain.indexOf(".");

export const SITE = {
  name,
  domain,
  /** Wordmark parts: "INSIDER" + ".family" */
  mark: dot > 0 ? domain.slice(0, dot).toUpperCase() : name.toUpperCase(),
  tld: dot > 0 ? domain.slice(dot) : "",
  url: process.env.NEXT_PUBLIC_SITE_URL || `https://${domain}`,
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "The SocialFi home for every coin on Base.",
  /** Who runs the site, how to reach them, and whose law governs the terms (shown on /terms and /privacy). */
  legal: {
    entity: process.env.NEXT_PUBLIC_LEGAL_ENTITY || "",
    email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || "",
    jurisdiction: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "",
  },
  xHandle: process.env.NEXT_PUBLIC_PROJECT_X_HANDLE || "insiderfamily",
};

export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "ws://localhost:4001";
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
export const WALLETCONNECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
export const BUILDER_CODE = process.env.NEXT_PUBLIC_BUILDER_CODE || "";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

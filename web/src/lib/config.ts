export const SITE = {
  name: "Insider",
  domain: "insider.family",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  tagline: "The clubhouse for every coin on Base.",
};

export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || "ws://localhost:4001";
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
export const WALLETCONNECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
export const BUILDER_CODE = process.env.NEXT_PUBLIC_BUILDER_CODE || "";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

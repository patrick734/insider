import { base, baseSepolia } from "viem/chains";
import { createPublicClient, fallback, http, type Address, type PublicClient } from "viem";
import { envList } from "./env";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);
export const chain = CHAIN_ID === base.id ? base : baseSepolia;

export const ADDRESSES = {
  keys: (process.env.NEXT_PUBLIC_KEYS_ADDRESS || "") as Address,
  roomAccess: (process.env.NEXT_PUBLIC_ROOM_ACCESS_ADDRESS || "") as Address,
  splitterFactory: (process.env.NEXT_PUBLIC_SPLITTER_FACTORY_ADDRESS || "") as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
};

export const contractsDeployed = () => /^0x[0-9a-fA-F]{40}$/.test(ADDRESSES.keys);

let client: PublicClient | null = null;

/** Server-side client over every configured RPC, falling back in order when one fails. */
export function publicClient(): PublicClient {
  if (client) return client;
  const urls = envList("RPC_URLS", process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0]);
  client = createPublicClient({
    chain,
    transport: fallback(urls.map((u) => http(u, { timeout: 15_000, retryCount: 2 })), { rank: false }),
    // Multicall batching needs Multicall3, which Base has; set MULTICALL=0 on a bare local chain.
    batch: { multicall: process.env.MULTICALL !== "0" },
  }) as PublicClient;
  return client;
}

export const lower = (a: string) => a.toLowerCase();

import "server-only";
import { CHAIN_ID } from "@insider/core";
import { redis } from "./redis";

export type Market = {
  priceUsd: number | null;
  mcUsd: number | null;
  change24h: number | null;
  volume24hUsd: number | null;
  /** Hourly closes for the last day, oldest first. */
  spark: number[];
};

const NETWORK = CHAIN_ID === 8453 ? "base" : null;

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const r = redis();
  const hit = await r?.get(key).catch(() => null);
  if (hit) return JSON.parse(hit) as T;
  const v = await fn();
  await r?.set(key, JSON.stringify(v), "EX", ttl).catch(() => {});
  return v;
}

/** Price, market cap and a 24h sparkline from GeckoTerminal (free tier, cached a minute). Null off mainnet or when unknown. */
export async function market(coin: string | null): Promise<Market | null> {
  if (!coin || !NETWORK) return null;
  return cached(`market:${coin}`, 60, async () => {
    try {
      const t = await fetch(`https://api.geckoterminal.com/api/v2/networks/${NETWORK}/tokens/${coin}?include=top_pools`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      }).then((r) => (r.ok ? r.json() : null));
      if (!t?.data) return null;
      const a = t.data.attributes;
      const pool = t.data.relationships?.top_pools?.data?.[0]?.id?.split("_")[1];
      const pa = t.included?.find((x: { type: string }) => x.type === "pool")?.attributes;
      let spark: number[] = [];
      if (pool) {
        const o = await fetch(`https://api.geckoterminal.com/api/v2/networks/${NETWORK}/pools/${pool}/ohlcv/hour?limit=24`, { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null));
        spark = ((o?.data?.attributes?.ohlcv_list ?? []) as number[][]).map((c) => c[4]).reverse();
      }
      const num = (v: unknown) => (v == null ? null : Number(v));
      return {
        priceUsd: num(a.price_usd),
        mcUsd: num(a.market_cap_usd) ?? num(a.fdv_usd),
        change24h: num(pa?.price_change_percentage?.h24),
        volume24hUsd: num(a.volume_usd?.h24),
        spark,
      };
    } catch {
      return null;
    }
  });
}

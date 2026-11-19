const ETH = 10n ** 18n;

/** "0.0094Ξ" style amounts: a few significant decimals, trailing zeros dropped. */
export function eth(wei: string | bigint | number | null | undefined, opts: { sign?: boolean; symbol?: boolean } = {}): string {
  if (wei === null || wei === undefined) return "—";
  const v = BigInt(wei);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / ETH;
  const frac = a % ETH;
  let s: string;
  if (whole >= 100n) s = whole.toString();
  else {
    // Whole amounts keep 3 decimals; small amounts keep 3 significant digits after the leading zeros.
    const digits = whole > 0n ? 3 : Math.max(4, 18 - frac.toString().length + 3);
    const f = frac.toString().padStart(18, "0").slice(0, Math.min(digits, 18)).replace(/0+$/, "");
    s = f ? `${whole}.${f}` : whole.toString();
  }
  const sign = neg ? "-" : opts.sign && v > 0n ? "+" : "";
  return `${sign}${s}${opts.symbol === false ? "" : "Ξ"}`;
}

export function compact(n: number | string | bigint | null | undefined): string {
  const v = Number(n ?? 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(v);
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`;
  return `$${n.toFixed(n >= 1 ? 2 : 4)}`;
}

export function ago(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function displayName(u: { name: string | null; handle: string | null; address: string }): string {
  return u.name || u.handle || shortAddr(u.address);
}

export function initials(u: { name: string | null; handle: string | null; address: string }): string {
  const s = u.name || u.handle || u.address.slice(2);
  return s.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "??";
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
}

export const profileHref = (u: { handle: string | null; address: string }) => `/u/${u.handle ?? u.address}`;

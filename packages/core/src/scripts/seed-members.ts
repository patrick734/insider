import { keccak256, toHex } from "viem";
import { sql } from "../db";

/**
 * Demo only: give each sample room a realistic member list, so rooms don't read as empty. Safe to run again (adds only
 * what's missing). Refuses unless DEMO_LOGIN=1, so it can't touch a real database.
 */
if (process.env.DEMO_LOGIN !== "1") {
  console.log("seed-members: demo only (DEMO_LOGIN=1); skipped");
  process.exit(0);
}
const db = sql();
const addr = (seed: string) => keccak256(toHex(seed)).slice(0, 42).toLowerCase();
const handles = [
  "basedgabe", "lena_eth", "mo_trades", "jun_k", "ruthless", "kai_onchain", "tide_rider", "volt_maxi", "nodewatch", "pixelpete",
  "echo_chamber", "gridlock", "sats_sam", "wenmoon_wes", "candle_cara", "dipbuyer", "ape_avery", "liq_lucas", "fren_finn", "maker_mia",
  "taker_tom", "rug_radar", "chartchad", "bid_bella", "ask_axel", "slippage_sid", "gwei_gwen", "mempool_max", "block_beth", "hash_hank",
  "yield_yuki", "lp_leo", "floor_flo", "alpha_ari", "delta_dee", "theta_theo",
];
const ids: string[] = [];
for (const h of handles) {
  const [u] = await db`
    insert into users (address, handle, name, onboarded_at) values (${addr("member:" + h)}, ${h}, ${h.replace(/_/g, " ")}, now())
    on conflict (address) do update set handle = excluded.handle returning id`;
  ids.push(String(u.id));
}
// How many sample members each room gets, busiest first.
const plan: Record<string, number> = { grid: 28, volt: 19, node: 11, pixl: 8, echo: 6 };
for (const [slug, n] of Object.entries(plan)) {
  const [room] = await db`select id from rooms where slug = ${slug}`;
  if (!room) continue;
  for (const id of ids.slice(0, n)) await db`insert into room_members (room_id, user_id) values (${room.id}, ${id}) on conflict do nothing`;
}
// Sample key holders for each host, spread so the total stays within that host's key supply.
const holders: Record<string, number> = { mira: 26, juno: 14, nova: 10, deltaq: 7, kite: 4 };
for (const [host, n] of Object.entries(holders)) {
  const [m] = await db`select supply from key_markets where subject = ${addr(host)}`;
  if (!m) continue;
  let left = Number(m.supply) - 1;
  for (let i = 0; i < n && left > 0; i++) {
    const bal = Math.max(1, Math.min(left, 5 - (i % 5)));
    left -= bal;
    await db`insert into key_balances (subject, holder, balance) values (${addr(host)}, ${addr("member:" + handles[i])}, ${bal}) on conflict do nothing`;
  }
}
// Sample founder waitlist: verified members with founder numbers, and verified invites for the leaderboard.
const [{ n: founders }] = await db`select count(*)::int as n from users where founder_no is not null`;
if (Number(founders) === 0) {
  const all = ["mira", "nova", "juno", "deltaq", "kite", "sol_r", "arc", "pell", ...handles.slice(0, 55)];
  let no = 0;
  for (const h of all) {
    const a = handles.includes(h) ? addr("member:" + h) : addr(h);
    await db`update users set waitlist_joined_at = now() - interval '2 days', x_user_id = ${"demo-x:" + h}, x_handle = ${h}, follow_state = 'verified',
             verified_at = now() - interval '1 day', founder_no = ${++no} where address = ${a} and founder_no is null`;
  }
  const inviters: [string, number][] = [["mira", 11], ["nova", 7], ["juno", 6], ["deltaq", 4], ["kite", 3], ["sol_r", 2]];
  let i = 0;
  for (const [h, n] of inviters) {
    const [ref] = await db`select id from users where address = ${addr(h)}`;
    for (let k = 0; k < n && i < handles.length; k++, i++) {
      const [inv] = await db`select id from users where address = ${addr("member:" + handles[i])}`;
      const [r] = await db`insert into referrals (referrer_id, invitee_id, code, state, verified_at) values (${ref.id}, ${inv.id}, 'demo', 'verified', now()) on conflict do nothing returning id`;
      if (r) await db`insert into points_events (user_id, kind, points, ref_id) values (${ref.id}, 'verified_invite', 1, ${r.id})`;
    }
  }
}
// Sample calls with receipts (entry market cap and change since the call) for the top callers.
const calls: [string, string, "buy" | "sell", number, number, number, number][] = [
  // host, coin, side, ETH, entry MC (USD), change %, days ago
  ["mira", "GRID", "buy", 0.5, 63_000, 236, 6],
  ["mira", "PIXL", "buy", 0.3, 41_000, 118, 11],
  ["mira", "VOLT", "buy", 0.2, 52_000, -14, 16],
  ["mira", "ECHO", "sell", 0.25, 9_800, 61, 21],
  ["juno", "ECHO", "buy", 0.4, 6_100, 140, 9],
  ["juno", "NODE", "buy", 0.15, 22_000, -8, 13],
];
for (const [host, sym, side, ethAmt, mc, chg, days] of calls) {
  const [u] = await db`select id from users where address = ${addr(host)}`;
  const [have] = await db`select 1 from posts where user_id = ${u.id} and trade->>'symbol' = ${sym} and trade->>'side' = ${side}`;
  if (have) continue;
  const trade = {
    side,
    coin: addr("coin:" + sym),
    symbol: sym,
    amountWei: (BigInt(Math.round(ethAmt * 1e6)) * 10n ** 12n).toString(),
    mcUsd: mc,
    changePct: chg,
    txHash: null,
  };
  const body = side === "buy" ? "Entry on $" + sym + ". Holders had it in the key chat first." : "Took profit on $" + sym + ". Still watching it.";
  await db`
    insert into posts (user_id, body, trade, like_count, view_count, created_at)
    values (${u.id}, ${body}, ${db.json(trade as never)}, ${40 + days * 9}, ${900 + days * 210}, now() - make_interval(days => ${days}))`;
}
console.log(`seed-members: ${handles.length} sample members across ${Object.keys(plan).length} rooms, sample key holders for ${Object.keys(holders).length} hosts`);
await db.end();

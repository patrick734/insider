import { keccak256, toHex } from "viem";
import { sql } from "../db";

/**
 * Development data only: sample people, rooms, posts, chats and on-chain-looking rows so every screen has something
 * to show. Refuses to run against a database that already has real users unless SEED_FORCE=1.
 */
const db = sql();
const [{ n }] = await db`select count(*)::int as n from users`;
if (n > 0 && process.env.SEED_FORCE !== "1") {
  console.log(`users table has ${n} rows; set SEED_FORCE=1 to seed anyway`);
  process.exit(0);
}

const addr = (seed: string) => keccak256(toHex(seed)).slice(0, 42).toLowerCase();
// Numeric columns take strings (postgres.js would send a bigint as int8).
const wei = (eth: number) => (BigInt(Math.round(eth * 1e6)) * 10n ** 12n).toString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const people = [
  ["insider", "Insider", "Official updates from the Insider team.", true],
  ["mira", "Mira", "Trading small caps on Base. I host the $GRID room. Calls go to key holders first, then the room, then here.", false],
  ["nova", "Nova", "Chart reviews and volume reads. $VOLT room host.", false],
  ["juno", "Juno", "Three calls a week, key holders first.", false],
  ["deltaq", "Delta", "Taking profit is a strategy. $PIXL room.", false],
  ["kite", "Kite", "New host. $NODE.", false],
  ["sol_r", "Sol R", "Mostly lurking, sometimes right.", false],
  ["arc", "Arc", null, false],
  ["pell", "Pell", null, false],
  ["you", "You", "Testing Insider.", false],
] as const;

const ids: Record<string, bigint> = {};
for (const [handle, name, bio, official] of people) {
  const [r] = await db`
    insert into users (address, handle, name, bio, is_official, created_at)
    values (${addr(handle)}, ${handle}, ${name}, ${bio}, ${official}, ${minutesAgo(60 * 24 * 30)})
    on conflict (address) do update set name = excluded.name returning id`;
  ids[handle] = r.id as bigint;
}

const coinList = [
  ["GRID", "Grid"],
  ["VOLT", "Volt"],
  ["NODE", "Node"],
  ["PIXL", "Pixel"],
  ["ECHO", "Echo"],
] as const;
for (const [symbol, name] of coinList) {
  await db`insert into coins (address, symbol, name) values (${addr("coin:" + symbol)}, ${symbol}, ${name}) on conflict do nothing`;
}

const roomDefs = [
  ["mira", "grid", "$GRID room", "holders only · AMA at 9pm", "GRID", "gated", true, "Holders call with the dev"],
  ["nova", "volt", "$VOLT room", "chart review live", "VOLT", "open", true, "Chart review"],
  ["kite", "node", "$NODE room", "open room", "NODE", "open", false, null],
  ["deltaq", "pixl", "$PIXL room", "keys room · new drop talk", "PIXL", "gated", false, null],
  ["juno", "echo", "$ECHO room", "holders only", "ECHO", "gated", false, null],
] as const;
const roomIds: Record<string, bigint> = {};
for (const [host, slug, title, topic, coin, access, live, liveTitle] of roomDefs) {
  const [r] = await db`
    insert into rooms (host_id, slug, title, topic, coin_address, access, is_live, live_title)
    values (${ids[host]}, ${slug}, ${title}, ${topic}, ${addr("coin:" + coin)}, ${access}, ${live}, ${liveTitle})
    on conflict (slug) do update set title = excluded.title returning id`;
  roomIds[slug] = r.id as bigint;
  await db`insert into room_members (room_id, user_id, role) values (${r.id}, ${ids[host]}, 'host') on conflict do nothing`;
}
for (const [who, slug] of [["you", "grid"], ["nova", "grid"], ["sol_r", "grid"], ["you", "volt"], ["arc", "volt"], ["you", "node"]] as const) {
  await db`insert into room_members (room_id, user_id) values (${roomIds[slug]}, ${ids[who]}) on conflict do nothing`;
}

// Follows
for (const [a, b] of [["you", "mira"], ["you", "nova"], ["you", "juno"], ["nova", "mira"], ["arc", "you"], ["pell", "you"], ["sol_r", "mira"]] as const) {
  await db`insert into follows (follower_id, followee_id) values (${ids[a]}, ${ids[b]}) on conflict do nothing`;
}

// Posts
const posts: [string, number, string, Record<string, unknown> | null, string | null, number[], boolean][] = [
  ["mira", 6, "Holders call tonight at 9pm UTC in the $GRID room. Bringing the dev on to walk through the next release. Questions go in the room chat.", null, "grid", [48, 21, 302, 9100], false],
  ["nova", 22, "Adding here. Volume in the room has been steady for three days and the chart finally broke the range.", { side: "buy", coin: addr("coin:VOLT"), symbol: "VOLT", amountWei: wei(0.25).toString(), mcUsd: 41200, changePct: 38, txHash: null }, null, [17, 6, 121, 3400], false],
  ["kite", 41, "First time hosting a room tonight. If you hold $NODE, come hang out. Questions welcome.", null, "node", [9, 2, 64, 1200], false],
  ["deltaq", 64, "Took profit on half. Still holding the rest and still in the room.", { side: "sell", coin: addr("coin:PIXL"), symbol: "PIXL", amountWei: wei(0.4).toString(), mcUsd: 88000, changePct: 112, txHash: null }, "pixl", [26, 8, 187, 5000], false],
  ["juno", 130, "Key chat is open. Holders get my next three calls there before they go on the timeline.", null, null, [31, 12, 240, 6800], false],
  ["mira", 60 * 24 * 4, "How my calls work: key holders get them first in the key chat, the $GRID room gets them during the call, the timeline gets them after. Every call is checked on-chain.", null, null, [92, 140, 1100, 22000], true],
  ["insider", 60 * 24, "Founding hosts: applications are open. Host a coin room, keep a share of the swap fees it makes, and open keys for your regulars.", null, null, [84, 211, 1200, 41000], true],
  ["insider", 60 * 24 * 3, "Keys are live on Base Sepolia. Any room host can open keys. Holders get the key chat, early calls and a share of the room's fees.", null, null, [52, 140, 860, 28000], false],
  ["insider", 60 * 24 * 7, "Verified PnL is on. Link your wallet and your trades show on your profile, checked on-chain. No screenshots needed.", null, null, [61, 98, 734, 24000], false],
];
for (const [who, mins, body, trade, room, [replies, reposts, likes, views], pinned] of posts) {
  await db`
    insert into posts (user_id, body, trade, room_id, reply_count, repost_count, like_count, view_count, is_pinned, created_at)
    values (${ids[who]}, ${body}, ${trade ? db.json(trade as never) : null}, ${room ? roomIds[room] : null}, ${replies}, ${reposts}, ${likes}, ${views}, ${pinned}, ${minutesAgo(mins)})`;
}

// Room chat
const chat: [string, string, number, string, string, Record<string, unknown> | null][] = [
  ["grid", "mira", 80, "text", "morning room. volume picked up overnight, holding the 190K line.", null],
  ["grid", "nova", 77, "trade", "bought 2.6M $GRID for 0.42Ξ", { side: "buy" }],
  ["grid", "nova", 76, "text", "added on the dip. exit plan: half at 300K.", null],
  ["grid", "sol_r", 74, "text", "anyone tracking the LP? looks locked from launch.", null],
  ["grid", "mira", 72, "text", "LP is locked, link on the coin page. keep calls with a reason and an exit.", null],
  ["grid", "mira", 2, "text", "chart's on screen, give me 2 min", null],
  ["volt", "nova", 30, "text", "range high is the level. watching volume into the close.", null],
  ["volt", "arc", 25, "text", "in at 41K, small size.", null],
];
for (const [slug, who, mins, kind, body, meta] of chat) {
  await db`insert into messages (room_id, user_id, kind, body, meta, created_at) values (${roomIds[slug]}, ${ids[who]}, ${kind}, ${body}, ${meta ? db.json(meta as never) : null}, ${minutesAgo(mins)})`;
}

// DMs
{
  const [a, b] = ids.you < ids.juno ? [ids.you, ids.juno] : [ids.juno, ids.you];
  const [t] = await db`insert into dm_threads (a_id, b_id) values (${a}, ${b}) returning id`;
  await db`insert into dm_messages (thread_id, sender_id, body, created_at) values (${t.id}, ${ids.juno}, ${"call goes out at 6, keys first"}, ${minutesAgo(40)}), (${t.id}, ${ids.you}, ${"thanks, that helps"}, ${minutesAgo(12)})`;
}

// Indexed key markets, trades and balances (what the indexer writes)
const markets: [string, number][] = [["mira", 128], ["juno", 64], ["nova", 41], ["deltaq", 22], ["kite", 9], ["you", 14]];
for (const [who, supply] of markets) {
  await db`insert into key_markets (subject, coin, supply, created_block, created_at) values (${addr(who)}, null, ${supply}, 1, ${minutesAgo(60 * 24 * 20)}) on conflict do nothing`;
  await db`insert into key_balances (subject, holder, balance) values (${addr(who)}, ${addr(who)}, 1) on conflict do nothing`;
}
for (const [holder, subject, bal] of [["you", "mira", 2], ["nova", "mira", 3], ["sol_r", "mira", 1], ["you", "juno", 1], ["arc", "you", 1], ["pell", "you", 1]] as const) {
  await db`insert into key_balances (subject, holder, balance) values (${addr(subject)}, ${addr(holder)}, ${bal}) on conflict do nothing`;
}
let block = 1000;
for (const [trader, subject, buy, mins] of [["nova", "mira", true, 1], ["deltaq", "mira", true, 18], ["pell", "juno", false, 50], ["sol_r", "mira", true, 120]] as const) {
  const tx = keccak256(toHex(`${trader}${subject}${mins}`));
  await db`
    insert into key_trades (tx_hash, log_index, subject, trader, is_buy, amount, eth_wei, creator_fee, protocol_fee, room_fee, supply, block_number, block_time)
    values (${tx}, 0, ${addr(subject)}, ${addr(trader)}, ${buy}, ${buy && trader === "deltaq" ? 2 : 1}, ${wei(0.0094)}, ${wei(0.000376)}, ${wei(0.000188)}, ${wei(0.000188)}, 128, ${block++}, ${minutesAgo(mins)})
    on conflict do nothing`;
}
for (const [holder, coin, amt] of [["you", "GRID", 1_240_000], ["nova", "GRID", 2_600_000], ["sol_r", "GRID", 1_200_000], ["arc", "VOLT", 380_000], ["you", "VOLT", 380_000], ["you", "NODE", 92_000]] as const) {
  await db`insert into coin_balances (coin, holder, balance) values (${addr("coin:" + coin)}, ${addr(holder)}, ${(BigInt(amt) * 10n ** 18n).toString()}) on conflict do nothing`;
}

// Verified PnL
for (const [who, p7, p30, win, trades, best, bestPct] of [
  ["mira", 6.41, 4.82, 0.68, 57, "GRID", 236],
  ["juno", 3.88, 2.1, 0.64, 31, "ECHO", 140],
  ["nova", 2.95, 1.37, 0.58, 66, "VOLT", 38],
  ["deltaq", 2.12, 0.91, 0.61, 23, "PIXL", 112],
  ["sol_r", 1.64, 0.6, 0.55, 48, "GRID", 61],
  ["kite", 0.97, 0.4, 0.6, 15, "NODE", 22],
] as const) {
  for (const [period, v] of [["7d", p7], ["30d", p30]] as const) {
    await db`insert into pnl_stats (user_id, period, pnl_wei, win_rate, trades, best_coin, best_pct) values (${ids[who]}, ${period}, ${wei(v)}, ${win}, ${trades}, ${best}, ${bestPct}) on conflict do nothing`;
  }
}

// Notifications for @you
const notes: [string, string | null, number, Record<string, unknown>, boolean][] = [
  ["key_bought", "deltaq", 2, { amount: 2, priceWei: wei(0.0094).toString(), earnedWei: wei(0.0006).toString() }, false],
  ["fees_streamed", null, 14, { amountWei: wei(0.0183).toString(), room: "grid", title: "$GRID room" }, false],
  ["room_live", "mira", 21, { room: "grid", title: "$GRID room", online: 412 }, false],
  ["tip", "nova", 60, { amountWei: wei(0.002).toString(), excerpt: "Adding here. Volume in the room has been steady…" }, true],
  ["mention", "kite", 120, { excerpt: "@you are you coming to the $NODE room tonight?" }, true],
  ["follow", "arc", 60 * 24, { others: 6 }, true],
  ["call_up", null, 60 * 26, { symbol: "VOLT", changePct: 38 }, true],
  ["key_sold", "sol_r", 60 * 48, { amount: 1, priceWei: wei(0.0088).toString() }, true],
];
for (const [kind, actor, mins, data, read] of notes) {
  await db`insert into notifications (user_id, kind, actor_id, data, created_at, read_at) values (${ids.you}, ${kind}, ${actor ? ids[actor] : null}, ${db.json(data as never)}, ${minutesAgo(mins)}, ${read ? minutesAgo(mins) : null})`;
}

// Articles
const arts: [string, string, string, string, string, number][] = [
  ["mira", "ROOMS", "How I run a holders-only room without it turning into noise", "Three rules for the chat, one for the stage, and why the fee split goes to key holders instead of me.", "$GRID / ROOM", 60 * 24],
  ["juno", "KEYS", "Pricing your keys: why a flat curve keeps your regulars", "A steep curve rewards the first ten buyers and loses everyone after them.", "KEYS", 60 * 48],
  ["nova", "MARKETS", "Reading room volume before the chart moves", "What changed in the $VOLT room three days before the breakout.", "VOL", 60 * 72],
  ["deltaq", "PNL", "My worst 10 trades, all checked on-chain", "Verified PnL means the losses show too. Here's what they taught me.", "-PNL", 60 * 120],
  ["kite", "HOSTING", "Hosting your first room: a checklist", "Mic check, pinned rules, a co-host, and when to open keys.", "HOST", 60 * 168],
];
for (const [who, tag, title, dek, cover, mins] of arts) {
  await db`
    insert into articles (user_id, title, dek, body, tag, cover_label, like_count, published_at, created_at)
    values (${ids[who]}, ${title}, ${dek}, ${dek + "\n\nThis is sample text for development. The full article goes here."}, ${tag}, ${cover}, ${Math.floor(Math.random() * 1000)}, ${minutesAgo(mins)}, ${minutesAgo(mins)})`;
}

console.log("seeded", Object.keys(ids).length, "users; sign in as @you with address", addr("you"));
await db.end();

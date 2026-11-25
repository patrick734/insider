import "server-only";
import { sql } from "@insider/core";
import type { ChatThread, Notification, Post, RoomLite, TradeCard, UserLite } from "@/lib/types";
import { onlineCounts } from "./redis";
import { USER_COLUMNS, iso, toUser } from "./rows";
import { market } from "./market";
import { priceAt } from "@/lib/curve";

const db = () => sql();
const U = () => db().unsafe(USER_COLUMNS);
const PNL_JOIN = () => db().unsafe("left join pnl_stats p on p.user_id = u.id and p.period = '30d'");

// ================================================================ rooms

const ROOM_SELECT = () => db()`
  select r.id, r.slug, r.title, r.topic, r.access, r.is_live, r.live_title, r.coin_address, c.symbol as coin_symbol,
         ${U()}
  from rooms r
  join users u on u.id = r.host_id
  ${PNL_JOIN()}
  left join coins c on c.address = r.coin_address`;

type RoomActivity = { msgs: number; trades: number; supplies: number[]; members: number; lastAt: string | null };

/** Heat: people online, chat in the last 10 minutes, key trades in the last hour, plus a bump while live. */
function heatOf(online: number, a: RoomActivity | undefined, isLive: boolean): number {
  const h = Math.min(1, online / 40) * 0.45 + Math.min(1, (a?.msgs ?? 0) / 15) * 0.3 + Math.min(1, (a?.trades ?? 0) / 4) * 0.1 + (isLive ? 0.15 : 0);
  return Math.round(Math.min(1, h) * 100) / 100;
}

function toRoom(r: Record<string, unknown>, online: Record<string, number>, a?: RoomActivity): RoomLite {
  const id = String(r.id);
  return {
    id,
    slug: r.slug as string,
    title: r.title as string,
    topic: (r.topic as string) ?? null,
    access: r.access as "open" | "gated",
    isLive: Boolean(r.is_live),
    liveTitle: (r.live_title as string) ?? null,
    online: online[id] ?? 0,
    coinSymbol: (r.coin_symbol as string) ?? null,
    coinAddress: (r.coin_address as string) ?? null,
    host: toUser(r),
    heat: heatOf(online[id] ?? 0, a, Boolean(r.is_live)),
    msgs10m: a?.msgs ?? 0,
    keySpark: (a?.supplies ?? []).map((s) => Number(priceAt(BigInt(s))) / 1e18),
    members: a?.members ?? 0,
    lastActiveAt: a?.lastAt ?? null,
  };
}

async function withOnline(rows: Record<string, unknown>[]): Promise<RoomLite[]> {
  const ids = rows.map((r) => String(r.id));
  const [online, act] = await Promise.all([
    onlineCounts(ids),
    ids.length
      ? db()`
          select r.id,
            (select count(*) from messages m where m.room_id = r.id and m.created_at > now() - interval '10 minutes')::int as msgs,
            (select count(*) from key_trades kt where kt.subject = h.address and kt.block_time > now() - interval '1 hour')::int as trades,
            (select coalesce(array_agg(s.supply order by s.block_number), '{}')
               from (select supply, block_number from key_trades kt where kt.subject = h.address order by block_number desc limit 24) s) as supplies,
            (select count(*) from room_members rm where rm.room_id = r.id and not rm.banned)::int as members,
            (select max(m.created_at) from messages m where m.room_id = r.id and m.deleted_at is null) as last_at
          from rooms r join users h on h.id = r.host_id where r.id in ${db()(ids)}`
      : Promise.resolve([]),
  ]);
  const byId = new Map(act.map((a) => [String(a.id), { msgs: Number(a.msgs), trades: Number(a.trades), supplies: (a.supplies as number[]) ?? [], members: Number(a.members), lastAt: a.last_at ? iso(a.last_at) : null }]));
  return rows.map((r) => toRoom(r, online, byId.get(String(r.id))));
}

/** Rooms ordered by who's in them right now, then by recent chat. */
export async function liveRooms(limit = 8): Promise<RoomLite[]> {
  const rows = await db()`
    ${ROOM_SELECT()}
    left join lateral (select max(m.id) as last_id from messages m where m.room_id = r.id) lm on true
    order by r.is_live desc, lm.last_id desc nulls last, r.id desc
    limit ${limit * 3}`;
  const rooms = await withOnline(rows);
  return rooms.sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.online - a.online).slice(0, limit);
}

export async function roomBySlug(slug: string): Promise<RoomLite | null> {
  const rows = await db()`${ROOM_SELECT()} where r.slug = ${slug}`;
  if (!rows[0]) return null;
  return (await withOnline(rows))[0];
}

export async function roomsOfHost(hostId: string): Promise<RoomLite[]> {
  return withOnline(await db()`${ROOM_SELECT()} where r.host_id = ${hostId} order by r.id`);
}

export type RoomStats = { vol24hWei: string; toHolders24hWei: string; holders: number; keySupply: number };

export async function roomStats(hostAddress: string, coin: string | null): Promise<RoomStats> {
  const [k] = await db()`
    select coalesce(sum(eth_wei) filter (where block_time > now() - interval '1 day'), 0) as vol,
           coalesce(sum(room_fee + flip_fee) filter (where block_time > now() - interval '1 day'), 0) as fees
    from key_trades where subject = ${hostAddress}`;
  const [s] = await db()`
    select coalesce(sum(holders_amount) filter (where block_time > now() - interval '1 day'), 0) as fees
    from fee_events where host = ${hostAddress} and kind = 'swap_split'`;
  const [h] = await db()`select coalesce(supply, 0) as supply from key_markets where subject = ${hostAddress}`;
  const [c] = coin ? await db()`select count(*)::int as n from coin_balances where coin = ${coin} and balance > 0` : [{ n: 0 }];
  return {
    vol24hWei: String(k?.vol ?? 0),
    toHolders24hWei: String(BigInt(String(k?.fees ?? 0)) + BigInt(String(s?.fees ?? 0))),
    holders: Number(c?.n ?? 0),
    keySupply: Number(h?.supply ?? 0),
  };
}

// ================================================================ posts

type FeedTab = "for-you" | "following" | "rooms" | "latest";

export async function feed(viewerId: string | null, tab: FeedTab, before?: string): Promise<Post[]> {
  const v = viewerId ?? "0";
  const cursor = before ? db()`and po.id < ${before}` : db()``;
  let where;
  let order = db()`order by po.id desc`;
  if (tab === "following") where = db()`and (po.user_id in (select followee_id from follows where follower_id = ${v}) or po.user_id = ${v})`;
  else if (tab === "rooms") where = db()`and po.room_id is not null`;
  else if (tab === "for-you") {
    // Recent posts ranked by engagement that decays with age; falls back to latest once that runs out.
    where = db()`and po.created_at > now() - interval '3 days'`;
    order = db()`order by (po.like_count + 2 * po.repost_count + po.reply_count + 1)
                   / power(extract(epoch from now() - po.created_at) / 3600 + 2, 1.4) desc, po.id desc`;
  } else where = db()``;
  const rows = await db()`
    select po.*, ${U()},
           ro.slug as room_slug, ro.title as room_title, ro.is_live as room_live,
           exists(select 1 from post_likes l where l.post_id = po.id and l.user_id = ${v}) as liked,
           exists(select 1 from reposts rp where rp.post_id = po.id and rp.user_id = ${v}) as reposted,
           exists(select 1 from bookmarks bm where bm.post_id = po.id and bm.user_id = ${v}) as bookmarked
    from posts po
    join users u on u.id = po.user_id
    ${PNL_JOIN()}
    left join rooms ro on ro.id = po.room_id
    where po.deleted_at is null and po.reply_to_id is null ${where} ${tab === "for-you" ? db()`` : cursor}
    ${order}
    limit 30`;
  return toPosts(rows);
}

export async function postsByUser(userId: string, viewerId: string | null, kind: "posts" | "calls" = "posts"): Promise<Post[]> {
  const v = viewerId ?? "0";
  const rows = await db()`
    select po.*, ${U()}, ro.slug as room_slug, ro.title as room_title, ro.is_live as room_live,
           exists(select 1 from post_likes l where l.post_id = po.id and l.user_id = ${v}) as liked,
           exists(select 1 from reposts rp where rp.post_id = po.id and rp.user_id = ${v}) as reposted,
           exists(select 1 from bookmarks bm where bm.post_id = po.id and bm.user_id = ${v}) as bookmarked
    from posts po join users u on u.id = po.user_id ${PNL_JOIN()} left join rooms ro on ro.id = po.room_id
    where po.user_id = ${userId} and po.deleted_at is null and po.reply_to_id is null
      ${kind === "calls" ? db()`and po.trade is not null` : db()``}
    order by po.is_pinned desc, po.created_at desc, po.id desc limit 30`;
  return toPosts(rows);
}

async function toPosts(rows: Record<string, unknown>[]): Promise<Post[]> {
  const liveIds = [...new Set(rows.filter((r) => r.room_live).map((r) => String(r.room_id)))];
  const liveRows = liveIds.length ? await db()`${ROOM_SELECT()} where r.id in ${db()(liveIds)}` : [];
  const live = new Map((await withOnline(liveRows)).map((r) => [r.id, r]));
  // Receipts: market cap now for every coin called in these posts (mainnet only; cached a minute).
  const coins = [...new Set(rows.map((r) => (r.trade as TradeCard | null)?.coin).filter(Boolean) as string[])];
  const now = new Map(await Promise.all(coins.map(async (c) => [c, (await market(c))?.mcUsd ?? null] as const)));
  return rows.map((r) => ({
    id: String(r.id),
    body: r.body as string,
    createdAt: iso(r.created_at),
    user: toUser(r),
    room: r.room_slug ? { slug: r.room_slug as string, title: r.room_title as string } : null,
    trade: withReceipt((r.trade as TradeCard) ?? null, now),
    live: r.room_id ? (live.get(String(r.room_id)) ?? null) : null,
    pinned: Boolean(r.is_pinned),
    likeCount: Number(r.like_count),
    replyCount: Number(r.reply_count),
    repostCount: Number(r.repost_count),
    viewCount: Number(r.view_count),
    tipWei: String(r.tip_wei ?? 0),
    liked: Boolean(r.liked),
    reposted: Boolean(r.reposted),
    bookmarked: Boolean(r.bookmarked),
    media: ((r.media_ids as string[]) ?? []).map((id) => `/api/media/${id}`),
  }));
}

/** Live change since the call when market data has the coin; otherwise the change recorded with the post. */
function withReceipt(t: TradeCard | null, now: Map<string, number | null>): TradeCard | null {
  if (!t) return null;
  const mc = now.get(t.coin) ?? null;
  if (mc && t.mcUsd) return { ...t, nowMcUsd: mc, changePct: (mc / t.mcUsd - 1) * 100 };
  return t;
}

// ================================================================ users

export type Profile = UserLite & {
  bio: string | null;
  bannerUrl: string | null;
  xHandle: string | null;
  /** Followers on X (only with X API access). */
  xFollowers: number | null;
  createdAt: string;
  following: number;
  followers: number;
  keyHolders: number;
  keySupply: number;
  viewerFollows: boolean;
  viewerKeys: number;
  pnl: { period: string; pnlWei: string; winRate: number; trades: number; bestCoin: string | null; bestPct: number | null } | null;
  rooms: RoomLite[];
};

export async function profile(handleOrAddress: string, viewerId: string | null): Promise<Profile | null> {
  const key = handleOrAddress.toLowerCase();
  const rows = await db()`
    select ${U()}, u.bio, u.banner_url, u.x_handle, u.x_followers, u.created_at, u.pnl_visible,
      (select count(*) from follows where follower_id = u.id)::int as following,
      (select count(*) from follows where followee_id = u.id)::int as followers,
      (select count(*) from key_balances kb where kb.subject = u.address and kb.balance > 0)::int as key_holders,
      (select coalesce(supply, 0) from key_markets km where km.subject = u.address) as key_supply,
      exists(select 1 from follows where follower_id = ${viewerId ?? "0"} and followee_id = u.id) as viewer_follows
    from users u ${PNL_JOIN()}
    where u.handle = ${key} or u.address = ${key}`;
  const r = rows[0];
  if (!r) return null;
  const user = toUser(r);
  let viewerKeys = 0;
  if (viewerId) {
    const [k] = await db()`select kb.balance from key_balances kb join users v on v.address = kb.holder where kb.subject = ${user.address} and v.id = ${viewerId}`;
    viewerKeys = Number(k?.balance ?? 0);
  }
  const [s] = r.pnl_visible ? await db()`select * from pnl_stats where user_id = ${user.id} and period = '30d'` : [];
  return {
    ...user,
    bio: (r.bio as string) ?? null,
    bannerUrl: (r.banner_url as string) ?? null,
    xHandle: (r.x_handle as string) ?? null,
    xFollowers: r.x_followers == null ? null : Number(r.x_followers),
    createdAt: iso(r.created_at),
    following: Number(r.following),
    followers: Number(r.followers),
    keyHolders: Number(r.key_holders),
    keySupply: Number(r.key_supply ?? 0),
    viewerFollows: Boolean(r.viewer_follows),
    viewerKeys,
    pnl: s
      ? { period: "30d", pnlWei: String(s.pnl_wei), winRate: Number(s.win_rate), trades: Number(s.trades), bestCoin: (s.best_coin as string) ?? null, bestPct: s.best_pct == null ? null : Number(s.best_pct) }
      : null,
    rooms: await roomsOfHost(user.id),
  };
}

export type Earner = UserLite & { rank: number; pnlWei: string; winRate: number; trades: number; keySupply: number };

/** Top earners by verified PnL over a period. Only users who show their PnL. */
export async function topEarners(period: "7d" | "30d" = "7d", limit = 6): Promise<Earner[]> {
  const rows = await db()`
    select ${U()}, s.pnl_wei as s_pnl, s.win_rate, s.trades, coalesce(km.supply, 0) as key_supply
    from pnl_stats s join users u on u.id = s.user_id ${PNL_JOIN()}
    left join key_markets km on km.subject = u.address
    where s.period = ${period} and u.pnl_visible and s.trades >= 3
    order by s.pnl_wei desc limit ${limit}`;
  return rows.map((r, i) => ({ ...toUser(r), rank: i + 1, pnlWei: String(r.s_pnl), winRate: Number(r.win_rate), trades: Number(r.trades), keySupply: Number(r.key_supply) }));
}

export type UserRow = UserLite & { keySupply: number; followers: number; createdAt: string };

export async function users(tab: "top" | "new"): Promise<UserRow[]> {
  const rows = await db()`
    select ${U()}, u.created_at, coalesce(km.supply, 0) as key_supply,
      (select count(*) from follows where followee_id = u.id)::int as followers
    from users u ${PNL_JOIN()} left join key_markets km on km.subject = u.address
    where u.handle is not null
    ${tab === "new" ? db()`order by u.id desc` : db()`order by coalesce(km.supply, 0) desc, followers desc, u.id`}
    limit 50`;
  return rows.map((r) => ({ ...toUser(r), keySupply: Number(r.key_supply), followers: Number(r.followers), createdAt: iso(r.created_at) }));
}

// ================================================================ tokens

export type CoinRow = { address: string; symbol: string; name: string; imageUrl: string | null; room: { slug: string; online: number } | null; holders: number };

export async function coins(): Promise<CoinRow[]> {
  const rows = await db()`
    select c.address, c.symbol, c.name, c.image_url, r.id as room_id, r.slug,
      (select count(*) from coin_balances b where b.coin = c.address and b.balance > 0)::int as holders
    from coins c left join rooms r on r.coin_address = c.address
    order by holders desc, c.symbol limit 100`;
  const online = await onlineCounts(rows.filter((r) => r.room_id).map((r) => String(r.room_id)));
  return rows.map((r) => ({
    address: r.address as string,
    symbol: r.symbol as string,
    name: r.name as string,
    imageUrl: (r.image_url as string) ?? null,
    room: r.slug ? { slug: r.slug as string, online: online[String(r.room_id)] ?? 0 } : null,
    holders: Number(r.holders),
  }));
}

// ================================================================ activity

export type Activity = { kind: "BUY" | "SELL" | "KEY" | "JOIN"; text: string; at: string };

export async function activity(limit = 6): Promise<Activity[]> {
  const rows = await db()`
    (select 'key' as k, kt.is_buy, kt.amount::text as amount, kt.block_time as at, t.handle as who, s.handle as subj, kt.trader, kt.subject
       from key_trades kt left join users t on t.address = kt.trader left join users s on s.address = kt.subject
       order by kt.block_number desc limit ${limit})
    union all
    (select 'join' as k, true, null, rm.joined_at, u.handle, r.slug, u.address, null
       from room_members rm join users u on u.id = rm.user_id join rooms r on r.id = rm.room_id
       where rm.role = 'member' order by rm.joined_at desc limit ${limit})
    order by at desc limit ${limit}`;
  return rows.map((r) => {
    const who = r.who ? `@${r.who}` : `${String(r.trader).slice(0, 6)}…`;
    if (r.k === "join") return { kind: "JOIN", text: `${who} joined the ${r.subj} room`, at: iso(r.at) };
    const subj = r.subj ? `@${r.subj}` : `${String(r.subject).slice(0, 6)}…`;
    return { kind: "KEY", text: `${who} ${r.is_buy ? "bought" : "sold"} ${r.amount} key${r.amount === "1" ? "" : "s"} of ${subj}`, at: iso(r.at) };
  });
}

// ================================================================ notifications

export async function notifications(userId: string): Promise<Notification[]> {
  const rows = await db()`
    select n.id, n.kind, n.created_at, n.read_at, n.data, ${U()}
    from notifications n left join users u on u.id = n.actor_id ${PNL_JOIN()}
    where n.user_id = ${userId} order by n.id desc limit 60`;
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as string,
    createdAt: iso(r.created_at),
    read: r.read_at != null,
    actor: r.u_id ? toUser(r) : null,
    data: (r.data as Record<string, unknown>) ?? {},
  }));
}

export async function unreadCounts(userId: string): Promise<{ notifications: number; messages: number }> {
  const [n] = await db()`select count(*)::int as n from notifications where user_id = ${userId} and read_at is null and created_at > now() - interval '30 days'`;
  const [m] = await db()`
    select count(*)::int as n from dm_messages dm join dm_threads t on t.id = dm.thread_id
    where (t.a_id = ${userId} or t.b_id = ${userId}) and dm.sender_id <> ${userId} and dm.read_at is null`;
  return { notifications: Number(n?.n ?? 0), messages: Number(m?.n ?? 0) };
}

// ================================================================ messages

export async function threads(userId: string, address: string): Promise<ChatThread[]> {
  // Rooms I'm in. A room is a "key chat" when I'm in through keys (or I'm the host), else a room chat.
  const rooms = await db()`
    select r.id, r.slug, r.title, ${U()},
      (select count(*) from key_balances kb where kb.subject = u.address and kb.balance > 0)::int as holders,
      coalesce((select balance from key_balances kb where kb.subject = u.address and kb.holder = ${address}), 0) as my_keys,
      lm.body as last_body, lm.created_at as last_at, lm.handle as last_handle,
      (select count(*) from messages m where m.room_id = r.id and m.id > rm.last_read_id and m.created_at > now() - interval '7 days')::int as unread
    from room_members rm join rooms r on r.id = rm.room_id join users u on u.id = r.host_id ${PNL_JOIN()}
    left join lateral (select m.body, m.created_at, mu.handle from messages m left join users mu on mu.id = m.user_id
                       where m.room_id = r.id and m.deleted_at is null order by m.id desc limit 1) lm on true
    where rm.user_id = ${userId} and not rm.banned
    order by lm.created_at desc nulls last`;
  const dms = await db()`
    select t.id, ${U()}, lm.body as last_body, lm.created_at as last_at,
      (select count(*) from dm_messages d where d.thread_id = t.id and d.sender_id <> ${userId} and d.read_at is null)::int as unread
    from dm_threads t join users u on u.id = case when t.a_id = ${userId} then t.b_id else t.a_id end ${PNL_JOIN()}
    left join lateral (select body, created_at from dm_messages d where d.thread_id = t.id order by d.id desc limit 1) lm on true
    where t.a_id = ${userId} or t.b_id = ${userId}
    order by lm.created_at desc nulls last`;
  const out: ChatThread[] = rooms.map((r) => {
    const host = toUser(r);
    const isKey = Number(r.my_keys) > 0 || host.id === userId;
    return {
      id: `room:${r.id}`,
      kind: isKey ? "key" : "room",
      title: r.title as string,
      meta: isKey ? `${r.holders} holders · key chat` : "room chat",
      last: r.last_body ? `${r.last_handle ?? "someone"}: ${r.last_body}` : null,
      lastAt: r.last_at ? iso(r.last_at) : null,
      unread: Number(r.unread),
      href: `/rooms/${r.slug}`,
      tile: host,
    };
  });
  for (const d of dms) {
    const u = toUser(d);
    out.push({
      id: `dm:${d.id}`,
      kind: "dm",
      title: u.name || u.handle || u.address,
      meta: "direct message",
      last: (d.last_body as string) ?? null,
      lastAt: d.last_at ? iso(d.last_at) : null,
      unread: Number(d.unread),
      href: `/messages/${u.handle ?? u.address}`,
      tile: u,
    });
  }
  return out;
}

export type DmMessage = { id: string; body: string; createdAt: string; mine: boolean };

export async function dmWith(userId: string, otherId: string): Promise<{ threadId: string | null; messages: DmMessage[] }> {
  const [a, b] = BigInt(userId) < BigInt(otherId) ? [userId, otherId] : [otherId, userId];
  const [t] = await db()`select id from dm_threads where a_id = ${a} and b_id = ${b}`;
  if (!t) return { threadId: null, messages: [] };
  const rows = await db()`select id, body, created_at, sender_id from dm_messages where thread_id = ${t.id} order by id desc limit 100`;
  await db()`update dm_messages set read_at = now() where thread_id = ${t.id} and sender_id <> ${userId} and read_at is null`;
  return {
    threadId: String(t.id),
    messages: rows.reverse().map((r) => ({ id: String(r.id), body: r.body as string, createdAt: iso(r.created_at), mine: String(r.sender_id) === userId })),
  };
}

// ================================================================ articles

export type Article = { id: string; title: string; dek: string | null; body: string; tag: string | null; coverLabel: string | null; likeCount: number; tipWei: string; publishedAt: string; user: UserLite };

export async function articles(limit = 20): Promise<Article[]> {
  const rows = await db()`
    select a.*, ${U()} from articles a join users u on u.id = a.user_id ${PNL_JOIN()}
    where a.published_at is not null order by a.published_at desc limit ${limit}`;
  return rows.map(toArticle);
}

export async function article(id: string): Promise<Article | null> {
  if (!/^\d+$/.test(id)) return null;
  const rows = await db()`select a.*, ${U()} from articles a join users u on u.id = a.user_id ${PNL_JOIN()} where a.id = ${id} and a.published_at is not null`;
  return rows[0] ? toArticle(rows[0]) : null;
}

function toArticle(r: Record<string, unknown>): Article {
  return {
    id: String(r.id),
    title: r.title as string,
    dek: (r.dek as string) ?? null,
    body: r.body as string,
    tag: (r.tag as string) ?? null,
    coverLabel: (r.cover_label as string) ?? null,
    likeCount: Number(r.like_count),
    tipWei: String(r.tip_wei ?? 0),
    publishedAt: iso(r.published_at),
    user: toUser(r),
  };
}

export async function officialPosts(viewerId: string | null): Promise<Post[]> {
  const [o] = await db()`select id from users where is_official order by id limit 1`;
  return o ? postsByUser(String(o.id), viewerId) : [];
}

export async function officialAccount(): Promise<UserLite | null> {
  const rows = await db()`select ${U()} from users u ${PNL_JOIN()} where u.is_official order by u.id limit 1`;
  return rows[0] ? toUser(rows[0]) : null;
}

export async function userByHandleOrAddress(key: string): Promise<UserLite | null> {
  const k = key.toLowerCase();
  const rows = await db()`select ${U()} from users u ${PNL_JOIN()} where u.handle = ${k} or u.address = ${k}`;
  return rows[0] ? toUser(rows[0]) : null;
}

/** A post and its replies (oldest reply first), in feed shape. */
export async function thread(postId: string, viewerId: string | null): Promise<Post[]> {
  const v = viewerId ?? "0";
  const rows = await db()`
    select po.*, ${U()}, ro.slug as room_slug, ro.title as room_title, ro.is_live as room_live,
           exists(select 1 from post_likes l where l.post_id = po.id and l.user_id = ${v}) as liked,
           exists(select 1 from reposts rp where rp.post_id = po.id and rp.user_id = ${v}) as reposted,
           exists(select 1 from bookmarks bm where bm.post_id = po.id and bm.user_id = ${v}) as bookmarked
    from posts po join users u on u.id = po.user_id ${PNL_JOIN()} left join rooms ro on ro.id = po.room_id
    where (po.id = ${postId} or po.reply_to_id = ${postId}) and po.deleted_at is null
    order by (po.id = ${postId}) desc, po.id asc limit 100`;
  return toPosts(rows);
}

/** Posts the viewer bookmarked, newest bookmark first. */
export async function bookmarked(userId: string): Promise<Post[]> {
  const v = userId;
  const rows = await db()`
    select po.*, ${U()}, ro.slug as room_slug, ro.title as room_title, ro.is_live as room_live,
           exists(select 1 from post_likes l where l.post_id = po.id and l.user_id = ${v}) as liked,
           exists(select 1 from reposts rp where rp.post_id = po.id and rp.user_id = ${v}) as reposted,
           true as bookmarked
    from bookmarks b join posts po on po.id = b.post_id join users u on u.id = po.user_id ${PNL_JOIN()} left join rooms ro on ro.id = po.room_id
    where b.user_id = ${v} and po.deleted_at is null
    order by b.created_at desc limit 50`;
  return toPosts(rows);
}

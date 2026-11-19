-- Insider: initial schema.
-- Conventions: addresses are stored lowercase; money is wei in numeric(78,0); big, fast-growing tables (messages,
-- notifications) are partitioned by month so old months can be archived without touching new ones. Lists page with
-- cursors (id or created_at), never OFFSET.

create table users (
  id           bigserial primary key,
  address      text not null unique check (address ~ '^0x[0-9a-f]{40}$'),
  handle       text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name         text check (char_length(name) <= 40),
  bio          text check (char_length(bio) <= 280),
  avatar_url   text,
  banner_url   text,
  x_handle     text,
  is_official  boolean not null default false,
  pnl_visible  boolean not null default true,
  invited_by   bigint references users(id),
  created_at   timestamptz not null default now()
);

create table auth_nonces (
  nonce      text primary key,
  created_at timestamptz not null default now()
);

create table follows (
  follower_id bigint not null references users(id) on delete cascade,
  followee_id bigint not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on follows (followee_id);

create table coins (
  address    text primary key,
  symbol     text not null,
  name       text not null,
  decimals   int not null default 18,
  image_url  text,
  created_at timestamptz not null default now()
);

-- A room belongs to a host. Its key market is the host's market in InsiderKeys; its coin gate mirrors RoomAccess.
create table rooms (
  id                bigserial primary key,
  host_id           bigint not null references users(id),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  title             text not null check (char_length(title) <= 60),
  topic             text check (char_length(topic) <= 120),
  coin_address      text references coins(address),
  -- open: anyone signed in can read and post. gated: key holders and coin holders only.
  access            text not null default 'gated' check (access in ('open', 'gated')),
  slow_mode_seconds int not null default 0,
  is_live           boolean not null default false,
  live_title        text,
  pinned_message_id bigint,
  created_at        timestamptz not null default now()
);
create index rooms_host on rooms (host_id);
create index rooms_coin on rooms (coin_address);

create table room_members (
  room_id      bigint not null references rooms(id) on delete cascade,
  user_id      bigint not null references users(id) on delete cascade,
  role         text not null default 'member' check (role in ('host', 'mod', 'member')),
  muted_until  timestamptz,
  banned       boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_read_id bigint not null default 0,
  primary key (room_id, user_id)
);
create index room_members_user on room_members (user_id);

-- Room chat. Not the source of access rights: access is always re-checked from indexed balances.
create table messages (
  id         bigserial,
  room_id    bigint not null,
  user_id    bigint,
  kind       text not null default 'text' check (kind in ('text', 'trade', 'system', 'call')),
  body       text not null check (char_length(body) <= 1000),
  meta       jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (id, created_at)
) partition by range (created_at);
create index messages_room on messages (room_id, id desc);

create table dm_threads (
  id         bigserial primary key,
  a_id       bigint not null references users(id),
  b_id       bigint not null references users(id),
  created_at timestamptz not null default now(),
  unique (a_id, b_id),
  check (a_id < b_id)
);

create table dm_messages (
  id         bigserial primary key,
  thread_id  bigint not null references dm_threads(id) on delete cascade,
  sender_id  bigint not null references users(id),
  body       text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index dm_messages_thread on dm_messages (thread_id, id desc);

create table posts (
  id          bigserial primary key,
  user_id     bigint not null references users(id),
  body        text not null check (char_length(body) <= 500),
  room_id     bigint references rooms(id),
  reply_to_id bigint references posts(id),
  quote_id    bigint references posts(id),
  -- A trade attached to a call: { side, coin, symbol, amountWei, mcUsd, txHash }
  trade       jsonb,
  is_pinned   boolean not null default false,
  like_count  int not null default 0,
  reply_count int not null default 0,
  repost_count int not null default 0,
  view_count  int not null default 0,
  tip_wei     numeric(78, 0) not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index posts_user on posts (user_id, id desc);
create index posts_recent on posts (id desc) where deleted_at is null and reply_to_id is null;
create index posts_room on posts (room_id, id desc);

create table post_likes (
  post_id    bigint not null references posts(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table reposts (
  post_id    bigint not null references posts(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table articles (
  id           bigserial primary key,
  user_id      bigint not null references users(id),
  title        text not null check (char_length(title) <= 120),
  dek          text check (char_length(dek) <= 240),
  body         text not null,
  tag          text,
  cover_label  text,
  like_count   int not null default 0,
  tip_wei      numeric(78, 0) not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index articles_published on articles (published_at desc) where published_at is not null;

-- Tips are plain ETH transfers; the client reports the hash and the indexer confirms it.
create table tips (
  tx_hash    text primary key,
  from_id    bigint not null references users(id),
  to_id      bigint not null references users(id),
  post_id    bigint references posts(id),
  article_id bigint references articles(id),
  amount_wei numeric(78, 0) not null,
  status     text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now()
);

create table notifications (
  id         bigserial,
  user_id    bigint not null,
  kind       text not null,
  actor_id   bigint,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  primary key (id, created_at)
) partition by range (created_at);
create index notifications_user on notifications (user_id, id desc);

create table watchlists (
  id         bigserial primary key,
  owner_id   bigint not null references users(id),
  room_id    bigint references rooms(id),
  name       text not null,
  created_at timestamptz not null default now()
);
create table watchlist_items (
  watchlist_id bigint not null references watchlists(id) on delete cascade,
  coin_address text not null,
  added_at     timestamptz not null default now(),
  primary key (watchlist_id, coin_address)
);

create table invites (
  code       text primary key,
  inviter_id bigint not null references users(id),
  uses       int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexed chain state (written by the indexer only)

create table indexer_cursors (
  name  text primary key,
  block bigint not null
);

create table key_markets (
  subject       text primary key,
  coin          text,
  supply        int not null,
  created_block bigint not null,
  created_at    timestamptz not null
);

create table key_trades (
  tx_hash      text not null,
  log_index    int not null,
  subject      text not null,
  trader       text not null,
  is_buy       boolean not null,
  amount       int not null,
  eth_wei      numeric(78, 0) not null,
  creator_fee  numeric(78, 0) not null,
  protocol_fee numeric(78, 0) not null,
  room_fee     numeric(78, 0) not null,
  flip_fee     numeric(78, 0) not null default 0,
  supply       int not null,
  block_number bigint not null,
  block_time   timestamptz not null,
  primary key (tx_hash, log_index)
);
create index key_trades_subject on key_trades (subject, block_number desc);
create index key_trades_trader on key_trades (trader, block_number desc);

create table key_balances (
  subject text not null,
  holder  text not null,
  balance int not null,
  primary key (subject, holder)
);
create index key_balances_holder on key_balances (holder) where balance > 0;

create table gates (
  host      text primary key,
  coin      text,
  threshold numeric(78, 0) not null default 0
);

-- Balances of coins that gate a room, kept live from Transfer events.
create table coin_balances (
  coin    text not null,
  holder  text not null,
  balance numeric(78, 0) not null,
  primary key (coin, holder)
);

create table fee_events (
  tx_hash         text not null,
  log_index       int not null,
  host            text not null,
  kind            text not null check (kind in ('key_room_fee', 'swap_split', 'deposit', 'claim', 'withdraw')),
  host_amount     numeric(78, 0) not null default 0,
  holders_amount  numeric(78, 0) not null default 0,
  treasury_amount numeric(78, 0) not null default 0,
  account         text,
  block_number    bigint not null,
  block_time      timestamptz not null,
  primary key (tx_hash, log_index)
);
create index fee_events_host on fee_events (host, block_number desc);

-- In-app swaps made through our quote endpoint (checked against the chain by the indexer).
create table swaps (
  tx_hash     text primary key,
  user_id     bigint references users(id),
  room_id     bigint references rooms(id),
  coin        text not null,
  side        text not null check (side in ('buy', 'sell')),
  eth_wei     numeric(78, 0) not null,
  token_amount numeric(78, 0) not null,
  fee_wei     numeric(78, 0) not null default 0,
  mc_usd      numeric,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  created_at  timestamptz not null default now()
);
create index swaps_user on swaps (user_id, created_at desc);
create index swaps_coin on swaps (coin, created_at desc);

-- Verified PnL, rebuilt by a worker from confirmed swaps.
create table pnl_stats (
  user_id    bigint not null references users(id),
  period     text not null check (period in ('7d', '30d', 'all')),
  pnl_wei    numeric(78, 0) not null,
  win_rate   numeric not null,
  trades     int not null,
  best_coin  text,
  best_pct   numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

-- Monthly partitions for messages and notifications. Run ensure_partitions() from a daily job.
create or replace function ensure_partitions(months_ahead int default 2) returns void language plpgsql as $$
declare
  t text;
  m date;
  i int;
begin
  foreach t in array array['messages', 'notifications'] loop
    for i in 0..months_ahead loop
      m := date_trunc('month', now())::date + (i || ' month')::interval;
      execute format(
        'create table if not exists %I partition of %I for values from (%L) to (%L)',
        t || '_' || to_char(m, 'YYYY_MM'), t, m, (m + interval '1 month')::date
      );
    end loop;
  end loop;
end $$;

select ensure_partitions(2);
-- A catch-all for anything older than this month (seed data, clock skew).
do $$
begin
  execute format('create table messages_old partition of messages for values from (minvalue) to (%L)', date_trunc('month', now())::date);
  execute format('create table notifications_old partition of notifications for values from (minvalue) to (%L)', date_trunc('month', now())::date);
end $$;

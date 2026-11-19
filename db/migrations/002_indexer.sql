-- Fee splitters seen on-chain (from SplitterCreated), so FeesDistributed is only trusted from real splitters.
create table splitters (
  host    text primary key,
  address text not null unique
);

-- Coins whose holders we track (room coins and gate coins), each with its own cursor.
create table tracked_coins (
  coin  text primary key,
  block bigint not null
);

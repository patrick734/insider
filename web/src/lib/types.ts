export type UserLite = {
  id: string;
  address: string;
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
  isOfficial: boolean;
  /** Verified 30-day PnL in wei, if the user shows it. */
  pnlWei: string | null;
};

export type TradeCard = {
  side: "buy" | "sell";
  coin: string;
  symbol: string;
  amountWei: string;
  mcUsd: number | null;
  changePct: number | null;
  txHash: string | null;
};

export type RoomLite = {
  id: string;
  slug: string;
  title: string;
  topic: string | null;
  access: "open" | "gated";
  isLive: boolean;
  liveTitle: string | null;
  online: number;
  coinSymbol: string | null;
  coinAddress: string | null;
  host: UserLite;
};

export type Post = {
  id: string;
  body: string;
  createdAt: string;
  user: UserLite;
  room: { slug: string; title: string } | null;
  trade: TradeCard | null;
  live: RoomLite | null;
  pinned: boolean;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  viewCount: number;
  tipWei: string;
  liked: boolean;
  reposted: boolean;
};

export type Notification = {
  id: string;
  kind: string;
  createdAt: string;
  read: boolean;
  actor: UserLite | null;
  data: Record<string, unknown>;
};

export type ChatThread = {
  id: string;
  kind: "room" | "key" | "dm";
  title: string;
  meta: string;
  last: string | null;
  lastAt: string | null;
  unread: number;
  href: string;
  tile: UserLite | null;
};

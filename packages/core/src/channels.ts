/** Redis pub/sub channels shared by the web app, the realtime service and the indexer. */
export const roomChannel = (roomId: string | number | bigint) => `room:${roomId}`;
export const userChannel = (userId: string | number | bigint) => `user:${userId}`;
/** Fired when a wallet's key or coin balance changes, so live rooms can drop or admit it. */
export const ACCESS_CHANNEL = "access";

export type RoomEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "deleted"; id: string }
  | { type: "trade"; trade: TradeTick }
  | { type: "presence"; online: number }
  | { type: "live"; isLive: boolean; title: string | null };

export type ChatMessage = {
  id: string;
  roomId: string;
  kind: "text" | "trade" | "system" | "call";
  body: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; handle: string | null; name: string | null; address: string; badge: string | null } | null;
};

export type TradeTick = {
  kind: "key" | "coin";
  side: "buy" | "sell";
  trader: string;
  handle: string | null;
  amount: string;
  ethWei: string;
  txHash: string;
  at: string;
};

export type AccessEvent = { holder: string; subject?: string; coin?: string };

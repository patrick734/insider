import { roomAccessAbi } from "./abi";
import { ADDRESSES, contractsDeployed, publicClient } from "./chain";
import type { Sql } from "./db";

export type Access = {
  ok: boolean;
  via: "host" | "open" | "key" | "coin" | null;
  reason?: "signed-out" | "banned" | "no-key-or-coin" | "no-room";
  keys: number;
  coinBalance: string;
  threshold: string;
  role: "host" | "mod" | "member" | null;
  mutedUntil: string | null;
};

/**
 * Can this user read and post in this room right now? Checked from indexed balances (kept live from chain events),
 * falling back to a direct RoomAccess read when the indexer has nothing for this wallet yet.
 */
export async function roomAccess(db: Sql, roomId: string, userId: string | null): Promise<Access> {
  const none: Access = { ok: false, via: null, keys: 0, coinBalance: "0", threshold: "0", role: null, mutedUntil: null };
  const [room] = await db`
    select r.id, r.access, r.coin_address, h.id as host_id, h.address as host_address, coalesce(g.threshold, 0)::text as threshold, g.coin as gate_coin
    from rooms r join users h on h.id = r.host_id left join gates g on g.host = h.address
    where r.id = ${roomId}`;
  if (!room) return { ...none, reason: "no-room" };
  if (!userId) return { ...none, reason: "signed-out", threshold: String(room.threshold) };

  const [u] = await db`
    select u.address, m.role, m.banned, m.muted_until,
      coalesce((select balance from key_balances where subject = ${room.host_address} and holder = u.address), 0) as keys,
      coalesce((select balance from coin_balances where coin = ${room.gate_coin ?? room.coin_address ?? ""} and holder = u.address), 0)::text as coin
    from users u left join room_members m on m.room_id = ${roomId} and m.user_id = u.id
    where u.id = ${userId}`;
  if (!u) return { ...none, reason: "signed-out" };
  const base = {
    keys: Number(u.keys),
    coinBalance: String(u.coin),
    threshold: String(room.threshold),
    role: (u.role as Access["role"]) ?? null,
    mutedUntil: u.muted_until ? new Date(u.muted_until as string).toISOString() : null,
  };
  if (u.banned) return { ...base, ok: false, via: null, reason: "banned" };
  if (String(room.host_id) === userId) return { ...base, ok: true, via: "host" };
  if (room.access === "open") return { ...base, ok: true, via: "open" };
  if (base.keys > 0) return { ...base, ok: true, via: "key" };
  const threshold = BigInt(base.threshold);
  if (threshold > 0n && BigInt(base.coinBalance) >= threshold) return { ...base, ok: true, via: "coin" };

  // Nothing indexed for this wallet: ask the chain directly.
  if (contractsDeployed()) {
    try {
      const ok = await publicClient().readContract({
        address: ADDRESSES.roomAccess,
        abi: roomAccessAbi,
        functionName: "canEnter",
        args: [room.host_address as `0x${string}`, u.address as `0x${string}`],
      });
      if (ok) return { ...base, ok: true, via: "coin" };
    } catch {
      // Fall through: no access.
    }
  }
  return { ...base, ok: false, via: null, reason: "no-key-or-coin" };
}

/** Make sure an admitted user has a membership row (so the room shows in their chats). */
export async function ensureMember(db: Sql, roomId: string, userId: string): Promise<void> {
  await db`insert into room_members (room_id, user_id) values (${roomId}, ${userId}) on conflict do nothing`;
}

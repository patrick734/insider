import { LogoAvatar } from "./logo-avatar";

type Who = { name: string | null; handle: string | null; address: string; avatarUrl?: string | null };

/** Square avatar: the picture if there is one, else a generated [i] avatar from the wallet address. */
export function Avatar({ user, size = 42, on = false }: { user: Who; size?: number; on?: boolean }) {
  return (
    <span className={`tile ${on ? "tile-on" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size / 3.2) }}>
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" width={size} height={size} className="h-full w-full object-cover" /> : <LogoAvatar seed={user.address || user.handle || "?"} size={size} />}
    </span>
  );
}

export function CoinTile({ symbol, size = 38, on = false }: { symbol: string; size?: number; on?: boolean }) {
  return (
    <span className={`tile ${on ? "tile-on" : ""}`} style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size / 3.4)) }}>
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

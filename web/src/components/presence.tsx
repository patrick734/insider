import { ago } from "@/lib/format";
import type { RoomLite } from "@/lib/types";

/**
 * Who's in a room: "● 12 online" while people are connected, otherwise how many members it has and when it was
 * last active ("24 inside · 4m"), so a quiet room never reads as empty.
 */
export function presenceText(r: Pick<RoomLite, "online" | "members" | "lastActiveAt">): { text: string; live: boolean } {
  if (r.online > 0) return { text: `${r.online} online`, live: true };
  const inside = `${r.members} inside`;
  return { text: r.lastActiveAt ? `${inside} · ${ago(r.lastActiveAt)}` : inside, live: false };
}

export function Presence({ room, className = "" }: { room: Pick<RoomLite, "online" | "members" | "lastActiveAt">; className?: string }) {
  const p = presenceText(room);
  return (
    <span className={`mono whitespace-nowrap ${p.live ? "text-accent" : "text-muted"} ${className}`}>
      {p.live ? "● " : ""}
      {p.text}
    </span>
  );
}

import { SITE } from "@/lib/config";

export const ICONS = {
  home: "M3 10.5 12 3l9 7.5V21H3z",
  explore: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  rooms: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7zM10 20a2 2 0 0 0 4 0",
  messages: "M4 4h16v12H7l-3 3z",
  wallet: "M3 7h16v12H3zM3 7l12-3v3M16 13h2",
  announce: "M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6",
  articles: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  reply: "M4 5h16v11H8l-4 4z",
  repost: "M7 7h11l-3-3M17 17H6l3 3",
  like: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  views: "M4 20V10M10 20V4M16 20v-7",
  pen: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  copy: "M8 8h12v12H8zM4 16V4h12",
  send: "M4 12 20 4l-6 16-3-7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  key: "M15 7a4 4 0 1 1-3.9 5H4v3h3v3h3v-3h1.1A4 4 0 0 1 15 7z",
  board: "M4 20V12M10 20V6M16 20v-9M20 20H3",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.1 9.5l6.1-.9z",
  plus: "M12 5v14M5 12h14",
  discount: "M5 19 19 5M7 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  rocket: "M12 3c4 3 5 8 3 13H9C7 11 8 6 12 3zM9 16l-3 4M15 16l3 4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5 7 17M17 17l1.5 1.5M5.5 5.5 7 7",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  host: "M4 20V9l8-5 8 5v11M9 20v-6h6v6",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className, strokeWidth = 1.6 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" aria-hidden="true" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The mark: an "i" inside terminal brackets (the insider). Drawn on a 64 grid so it stays crisp down to 16px. */
export function LogoMark({ size = 30, color = "#2EA8FF", glow = true }: { size?: number; color?: string; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" style={glow ? { filter: "drop-shadow(0 0 8px rgba(46,168,255,0.65))" } : undefined}>
      <path d="M20 8H8v48h12M44 8h12v48H44" stroke={color} strokeWidth={6} strokeLinecap="square" />
      <rect x="27" y="14" width="10" height="10" fill={color} />
      <rect x="27" y="29" width="10" height="21" fill={color} />
    </svg>
  );
}

export function Wordmark({ size = 14 }: { size?: number }) {
  return (
    <span className="mono font-bold" style={{ letterSpacing: "0.16em", fontSize: size }}>
      {SITE.mark}
      <span className="text-accent font-medium" style={{ letterSpacing: "0.02em" }}>
        {SITE.tld}
      </span>
    </span>
  );
}

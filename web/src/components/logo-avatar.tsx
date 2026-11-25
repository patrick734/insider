/**
 * Generated avatars for people without a photo: variations of the [i] logo. The wallet address picks a colour
 * scheme, a frame and an inner mark (8 × 4 × 4 = 128 looks), so the same person always gets the same avatar.
 */

const PALETTES: [bg: string, frame: string, glyph: string][] = [
  ["#000000", "#2EA8FF", "#2EA8FF"],
  ["#2EA8FF", "#000000", "#000000"],
  ["#0A1A2B", "#9AD6FF", "#FFFFFF"],
  ["#03110F", "#33E1D0", "#E8FFFB"],
  ["#12081F", "#B98CFF", "#E9DBFF"],
  ["#14050A", "#FF6B8B", "#FFFFFF"],
  ["#161004", "#FFC857", "#FFC857"],
  ["#E8F1FA", "#000000", "#2EA8FF"],
];

function seedBytes(seed: string): number[] {
  const hex = seed.toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{8,}$/.test(hex)) return [0, 2, 4, 6].map((i) => parseInt(hex.slice(-8).slice(i, i + 2), 16));
  // Not an address: a small string hash instead.
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, (h >>> 24) & 255];
}

function Frame({ kind, color }: { kind: number; color: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: 6, strokeLinecap: "square" as const };
  if (kind === 0) return <path d="M20 8H8v48h12M44 8h12v48H44" {...p} />; // [ ] like the logo
  if (kind === 1) return <path d="M8 20V8h12M44 8h12v12M56 44v12H44M20 56H8V44" {...p} />; // four corners
  if (kind === 2) return <path d="M8 8h48v48H8z" {...p} />; // full frame
  return <path d="M18 8H8v48h10M24 14h-6M46 8h10v48H46M40 14h6M24 50h-6M40 50h6" {...p} />; // double bracket
}

function Glyph({ kind, color }: { kind: number; color: string }) {
  if (kind === 0)
    return (
      <>
        <rect x="27" y="14" width="10" height="10" fill={color} />
        <rect x="27" y="29" width="10" height="21" fill={color} />
      </>
    ); // i
  if (kind === 1) return <circle cx="32" cy="32" r="9" fill={color} />; // dot
  if (kind === 2) return <path fill={color} d="M32 18a7 7 0 0 0-4 12.7L26 46h12l-2-15.3A7 7 0 0 0 32 18z" />; // key
  return <rect x="26" y="22" width="12" height="22" fill={color} />; // cursor block
}

export function LogoAvatar({ seed, size = 42 }: { seed: string; size?: number }) {
  const [a, b, c] = seedBytes(seed);
  const [bg, frame, glyph] = PALETTES[a % PALETTES.length];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="block h-full w-full">
      <rect width="64" height="64" fill={bg} />
      <Frame kind={b % 4} color={frame} />
      <Glyph kind={c % 4} color={glyph} />
    </svg>
  );
}

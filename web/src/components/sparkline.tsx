/** A tiny line chart: blue when it ends at or above where it started, pink when below. */
export function Sparkline({ values, width = 72, height = 22, className = "" }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return null; // a flat line says nothing
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4)).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? "#2EA8FF" : "#FF4FA3"} strokeWidth={1.8} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 3px ${up ? "rgba(46,168,255,.7)" : "rgba(255,79,163,.7)"})` }} />
    </svg>
  );
}

/** Props that make a room card glow with its heat (see .heat in globals.css). */
export function heatProps(heat: number) {
  return { style: { ["--heat" as string]: heat }, "data-hot": heat >= 0.35 ? "1" : "0", className: "heat" };
}

export function HotChip({ heat }: { heat: number }) {
  if (heat < 0.6) return null;
  return <span className="mono rounded-sm bg-pink/15 px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-[#ff8cc3]">HOT</span>;
}

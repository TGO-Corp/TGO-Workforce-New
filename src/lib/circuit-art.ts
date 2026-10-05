// Procedural "circuit board" line art for the dark header bands on metric
// cards, table headers and modal headers. Everything is generated from a seed
// string (so a given card always draws the same board) and returned as an SVG
// data-URI background-image — one mechanism for all three places, no extra DOM
// nodes (which a <thead> couldn't hold anyway), and SVG-as-background keeps
// its own SMIL animations running.
//
// Deliberately our own take rather than a copy of any one reference:
//   * Traces are routed with 45° chamfered jogs (not 90° steps), laid out on
//     shuffled horizontal lanes so no two ever overlap.
//   * Each trace carries a small green "signal pulse" that travels along it
//     and pings the end-pad when it arrives (pulse and ping share a period
//     and phase, so the arrival is real, not coincidence).
//   * Rings are tick-mark dials turning in opposite directions, not plain
//     concentric circles.
//   * A staggered dot lattice with a few twinkling dots, and a thin scanner
//     highlight sweeping along the band's bottom edge.
// Colors are baked in as literal hex because an SVG used as an image can't read
// the page's CSS variables — they match the app's fixed sidebar navy and
// brand green (see --sidebar / --sidebar-primary in styles.css), which are
// the same in light and dark mode on purpose.

import type { CSSProperties } from "react";

export type CircuitVariant = "card" | "table" | "modal";

type VariantSpec = {
  w: number;
  h: number;
  traces: number;
  anchor: "right" | "both";
  /** Fraction of the width (from the left) right-anchored traces may not
   * enter — keeps the header's title text area clean. */
  keepClear: number;
  rings: boolean;
  lattice: boolean;
  pulseAlpha: number;
  baseAlpha: number;
  preserve: string;
  gradient: string;
};

const SPECS: Record<CircuitVariant, VariantSpec> = {
  card: {
    w: 320,
    h: 76,
    traces: 5,
    anchor: "right",
    keepClear: 0.4,
    rings: true,
    lattice: true,
    pulseAlpha: 0.85,
    baseAlpha: 0.12,
    preserve: "xMaxYMid slice",
    gradient: "linear-gradient(120deg, #1e4761 0%, #183445 52%, #112936 100%)",
  },
  table: {
    w: 1400,
    h: 48,
    traces: 8,
    anchor: "both",
    keepClear: 0,
    rings: false,
    lattice: false,
    pulseAlpha: 0.42,
    baseAlpha: 0.08,
    preserve: "xMidYMid slice",
    gradient: "linear-gradient(90deg, #183445 0%, #1b3d52 50%, #183445 100%)",
  },
  modal: {
    w: 560,
    h: 92,
    traces: 6,
    anchor: "right",
    keepClear: 0.46,
    rings: true,
    lattice: true,
    pulseAlpha: 0.8,
    baseAlpha: 0.12,
    preserve: "xMaxYMid slice",
    gradient: "linear-gradient(120deg, #1e4761 0%, #183445 52%, #112936 100%)",
  },
};

const GREEN = "#72b360";
const PAD_FILL = "#10283a";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type Pt = [number, number];
type Trace = { pts: Pt[]; end: Pt };

/** Chamfer router: each trace gets its own lane (lanes are shuffled so
 * neighbours don't hug), runs inward, and may jog to a nearby y with a 45°
 * bend before ending in a pad. Right-anchored traces stop before keepClear. */
function routeTraces(spec: VariantSpec, rand: () => number): Trace[] {
  const { w, h, traces } = spec;
  const lanes = Array.from({ length: traces }, (_, i) => (h * (i + 1)) / (traces + 1));
  for (let i = lanes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j]!, lanes[i]!];
  }

  const minX = spec.keepClear * w;
  return lanes.map((laneY) => {
    const fromRight = spec.anchor === "right" ? true : rand() < 0.5;
    const dir = fromRight ? -1 : 1;
    let x = fromRight ? w + 2 : -2;
    let y = laneY;
    const pts: Pt[] = [[x, y]];
    const segs = 2 + Math.floor(rand() * 2);

    for (let s = 0; s < segs; s += 1) {
      const run = w * (spec.anchor === "both" ? 0.05 + rand() * 0.09 : 0.1 + rand() * 0.16);
      x += dir * run;
      if (spec.anchor === "right" && x < minX) x = minX;
      pts.push([x, y]);
      if (spec.anchor === "right" && x <= minX + 2) break;

      if (s < segs - 1 || rand() < 0.4) {
        const mag = 7 + rand() * 11;
        const sign = y + mag > h - 6 ? -1 : y - mag < 6 ? 1 : rand() < 0.5 ? -1 : 1;
        const dy = sign * mag;
        x += dir * Math.abs(dy);
        y += dy;
        if (spec.anchor === "right" && x < minX) break;
        pts.push([x, y]);
      }
    }
    return { pts, end: pts[pts.length - 1]! };
  });
}

const pathOf = (pts: Pt[]) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")}`;

function renderTrace(
  trace: Trace,
  spec: VariantSpec,
  rand: () => number,
  animated: boolean,
): string {
  const d = pathOf(trace.pts);
  const [ex, ey] = trace.end;
  const dur = 3.2 + rand() * 3.4;
  const phase = rand() * dur;
  const staticPos = 10 + rand() * 70;

  // pathLength=100 normalises every trace to the same units, so one dash
  // pattern ("9 191": a 9-unit pulse then a long rest) fits any length.
  const dash = `stroke-dasharray="9 191" pathLength="100"`;
  const offset = animated ? 9 : -staticPos;
  const run = animated
    ? `<animate attributeName="stroke-dashoffset" values="9;-191" dur="${r1(dur)}s" begin="-${r1(phase)}s" repeatCount="indefinite"/>`
    : "";

  // The pulse tip reaches the end of the path at exactly half the cycle
  // (offset -93 of a 200-unit pattern), so the pad ping is keyed to 0.5.
  const ping = animated
    ? `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="2.4" fill="none" stroke="${GREEN}" stroke-width="1">` +
      `<animate attributeName="r" values="2.4;2.4;3;9" keyTimes="0;0.5;0.53;1" dur="${r1(dur)}s" begin="-${r1(phase)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="stroke-opacity" values="0;0;0.6;0" keyTimes="0;0.5;0.53;1" dur="${r1(dur)}s" begin="-${r1(phase)}s" repeatCount="indefinite"/>` +
      `</circle>`
    : "";

  return (
    `<path d="${d}" stroke="#fff" stroke-opacity="${spec.baseAlpha}" stroke-width="1"/>` +
    `<path d="${d}" ${dash} stroke-dashoffset="${offset}" stroke="${GREEN}" stroke-opacity="${r1(spec.pulseAlpha * 0.28)}" stroke-width="3.4">${run}</path>` +
    `<path d="${d}" ${dash} stroke-dashoffset="${offset}" stroke="${GREEN}" stroke-opacity="${spec.pulseAlpha}" stroke-width="1.2">${run}</path>` +
    `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="2.4" fill="${PAD_FILL}" stroke="#fff" stroke-opacity="0.34" stroke-width="1"/>` +
    ping
  );
}

/** Two tick-mark dials, turning opposite ways, partly cropped by the band's
 * top-right corner, plus a faint solid outer ring. */
function renderRings(spec: VariantSpec, animated: boolean): string {
  const cx = r1(spec.w * 0.9);
  const cy = r1(spec.h * 0.3);
  const spin = (from: number, to: number, dur: number) =>
    animated
      ? `<animateTransform attributeName="transform" type="rotate" from="${from} ${cx} ${cy}" to="${to} ${cx} ${cy}" dur="${dur}s" repeatCount="indefinite"/>`
      : "";
  const inner = r1(spec.h * 0.5);
  const mid = r1(spec.h * 0.78);
  const outer = r1(spec.h * 1.12);
  return (
    `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="1"/>` +
    `<g><circle cx="${cx}" cy="${cy}" r="${mid}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="3" stroke-dasharray="1.2 6.4"/>${spin(360, 0, 46)}</g>` +
    `<g><circle cx="${cx}" cy="${cy}" r="${inner}" fill="none" stroke="${GREEN}" stroke-opacity="0.38" stroke-width="1.2" stroke-dasharray="22 11 4 11"/>${spin(0, 360, 30)}</g>`
  );
}

/** Staggered (brick-offset) dot lattice that fades out toward its far edge,
 * with a few seeded dots twinkling. */
function renderLattice(spec: VariantSpec, rand: () => number, animated: boolean): string {
  const cols = 7;
  const rows = 3;
  const gap = 9;
  const x0 = spec.w * 0.55;
  const y0 = 9;
  const dots: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = x0 + col * gap + (row % 2 ? gap / 2 : 0);
      const y = y0 + row * gap;
      const fade = 1 - col / (cols + 1);
      const alpha = r1(0.1 + 0.28 * fade);
      const twinkle = animated && rand() < 0.16;
      const anim = twinkle
        ? `<animate attributeName="fill-opacity" values="${alpha};0.95;${alpha}" dur="${r1(2.4 + rand() * 2.2)}s" begin="-${r1(rand() * 3)}s" repeatCount="indefinite"/>`
        : "";
      dots.push(
        `<circle cx="${r1(x)}" cy="${y}" r="1.1" fill="#fff" fill-opacity="${alpha}">${anim}</circle>`,
      );
    }
  }
  return dots.join("");
}

/** A thin highlight sweeping along the band's bottom edge. */
function renderScanner(spec: VariantSpec, animated: boolean): string {
  const { w, h } = spec;
  const barW = r1(w * 0.18);
  const base = `<rect x="0" y="${h - 1}" width="${w}" height="1" fill="#fff" fill-opacity="0.06"/>`;
  if (!animated) return base;
  return (
    base +
    `<rect x="-${barW}" y="${h - 1.5}" width="${barW}" height="1.5" fill="url(#sweep)">` +
    `<animate attributeName="x" values="-${barW};${w}" dur="7s" repeatCount="indefinite"/>` +
    `</rect>`
  );
}

export function buildCircuitSvg(variant: CircuitVariant, seed: string, animated: boolean): string {
  const spec = SPECS[variant];
  const rand = mulberry32(hashSeed(`${variant}:${seed}`));
  const traces = routeTraces(spec, rand);
  const body =
    traces.map((t) => renderTrace(t, spec, rand, animated)).join("") +
    (spec.rings ? renderRings(spec, animated) : "") +
    (spec.lattice ? renderLattice(spec, rand, animated) : "") +
    renderScanner(spec, animated);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.w} ${spec.h}" preserveAspectRatio="${spec.preserve}">` +
    `<defs><linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${GREEN}" stop-opacity="0"/>` +
    `<stop offset="0.7" stop-color="${GREEN}" stop-opacity="0.85"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0.9"/></linearGradient></defs>` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  );
}

const cache = new Map<string, CSSProperties>();

/** Inline style for an element that should wear the dark circuit band.
 * Memoised per (variant, seed, animated) — cards with the same title and every
 * table header share one generated image. */
export function circuitBackgroundStyle(
  variant: CircuitVariant,
  seed: string,
  animated: boolean,
): CSSProperties {
  const key = `${variant}|${seed}|${animated ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const spec = SPECS[variant];
  const svg = encodeURIComponent(buildCircuitSvg(variant, seed, animated));
  const style: CSSProperties = {
    backgroundColor: "#183445",
    backgroundImage: `url("data:image/svg+xml,${svg}"), ${spec.gradient}`,
    backgroundSize: "cover, 100% 100%",
    backgroundPosition: `${variant === "table" ? "center" : "right"} center, 0 0`,
    backgroundRepeat: "no-repeat, no-repeat",
  };
  cache.set(key, style);
  return style;
}

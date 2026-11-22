// Shared scale, tick and text helpers for the hand-built SVG charts. No dependencies.

export type Better = "lower" | "higher";

/** Linear scale; a zero-width domain maps everything to the start of the range. */
export function linear([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  const span = d1 - d0;
  return (v: number) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0));
}

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
}

/** Clean, evenly spaced ticks that cover [min, max] (the first/last tick is the nice domain). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  if (min > max) [min, max] = [max, min];
  const step = niceStep(max - min, count);
  const decimals = stepDecimals(step);
  const start = Math.floor(min / step + 1e-9) * step;
  const end = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Number(v.toFixed(decimals)));
  return out;
}

export function stepDecimals(step: number) {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/** Formats axis ticks to the precision their step needs (0 / 10 / 20, 0.26 / 0.27). */
export function tickFormatter(ticks: number[]) {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  const decimals = stepDecimals(step);
  return (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Default value formatter: up to 3 significant decimals for small values, fewer for big ones. */
export function defaultFormat(v: number) {
  const a = Math.abs(v);
  const digits = a === 0 ? 0 : a < 1 ? 3 : a < 100 ? 2 : a < 10000 ? 1 : 0;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Rough text width in px for the system sans (jsdom cannot measure). */
export function textWidth(text: string, fontSize = 13) {
  return text.length * fontSize * 0.56;
}

/** Shortens text with an ellipsis to fit maxPx (estimated); returns the text unchanged when it fits. */
export function fitText(text: string, maxPx: number, fontSize = 13) {
  if (textWidth(text, fontSize) <= maxPx) return text;
  const chars = Math.max(1, Math.floor(maxPx / (fontSize * 0.56)) - 1);
  return `${text.slice(0, chars).trimEnd()}…`;
}

export function betterHint(better?: Better) {
  return better ? `${better} is better` : "";
}

/** Horizontal bar from x0 (square baseline end) to x1 (4px rounded data end). */
export function hBarPath(x0: number, x1: number, y: number, h: number, radius = 4) {
  const w = Math.abs(x1 - x0);
  const r = Math.min(radius, w, h / 2);
  const dir = x1 >= x0 ? 1 : -1;
  const xe = x1 - dir * r;
  const sweep = dir === 1 ? 1 : 0;
  return [
    `M${x0},${y}`,
    `H${xe}`,
    `A${r},${r} 0 0 ${sweep} ${x1},${y + r}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 ${sweep} ${xe},${y + h}`,
    `H${x0}`,
    "Z",
  ].join(" ");
}

export const FONT = { tick: 12, label: 13 } as const;
export const TICK_STYLE = { fontSize: FONT.tick, fontVariantNumeric: "tabular-nums" as const };

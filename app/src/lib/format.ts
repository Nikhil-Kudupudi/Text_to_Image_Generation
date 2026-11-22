const DASH = "—";

/** A real, finite number (not null, undefined, NaN or ±Infinity). */
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Fixed-digit number, or an em dash for missing values. */
export function fmt(v: number | null | undefined, digits = 2): string {
  return isNum(v) ? v.toFixed(digits) : DASH;
}

/** Gigabytes with a unit: 2.63 -> "2.6 GB". */
export function fmtGb(v: number | null | undefined): string {
  return isNum(v) ? `${v.toFixed(1)} GB` : DASH;
}

/** Seconds with a unit: 2.798 -> "2.8 s", 312.4 -> "312 s". */
export function fmtSeconds(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)} s`;
}

/** ISO timestamp -> short local time ("14:32"), with the date when it is not today. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

const UPPER = new Set(["fid", "is", "clip", "ddpm", "dpmpp"]);

/** "m3_fid_is_bars.png" -> "FID IS bars" */
export function plotTitle(file: string): string {
  const base = file.split("/").pop() ?? file;
  const text = base
    .replace(/\.[^.]+$/, "")
    .replace(/^m[23]_/i, "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (UPPER.has(w.toLowerCase()) ? w.toUpperCase() : w))
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

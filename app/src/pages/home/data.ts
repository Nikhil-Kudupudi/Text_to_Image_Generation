// Pure selectors over M3Results for the Models page. Every one tolerates missing data.
import type { M3Results, MetricRow, RenderRow } from "../../types";
import { configLabel, isModelConfig, MODEL_META } from "../../lib/configs";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function modelMetric(m3: M3Results, config: string): MetricRow | undefined {
  return m3.metrics.find((r) => r.config === config && r.group === "models");
}

export function secPerImage(m3: M3Results, row: RenderRow): number | null {
  if (isNum(row.sec_per_image)) return row.sec_per_image;
  const m = modelMetric(m3, row.config)?.sec_per_image;
  return isNum(m) ? m : null;
}

/** Per-image CLIP score, or null. JSON object keys arrive as strings; numeric indexing still works. */
export function clipAt(m3: M3Results, config: string, idx: number): number | null {
  const v = m3.clip[config]?.[idx];
  return isNum(v) ? v : null;
}

/** Image files are written in prompt order, so idx >= images means it was never rendered. */
export function hasImage(row: RenderRow | undefined, idx: number): boolean {
  return row != null && idx < row.images;
}

export function winner(m3: M3Results): { config: string; label: string; avgRank: number | null } | null {
  const r = m3.ranking.find((x) => x.question === "models" && x.overall_rank === 1);
  if (!r) return null;
  const label = isModelConfig(r.config) ? configLabel(r.config) : r.label || r.config;
  return { config: r.config, label, avgRank: isNum(r.avg_rank) ? r.avg_rank : null };
}

export interface Best {
  config: string;
  value: number;
}

/** Best model by a metric value (higher or lower is better), or null when no model has one. */
export function bestBy(m3: M3Results, value: (row: RenderRow) => number | null, higher: boolean): Best | null {
  let best: Best | null = null;
  for (const row of m3.models) {
    const v = value(row);
    if (!isNum(v)) continue;
    if (!best || (higher ? v > best.value : v < best.value)) best = { config: row.config, value: v };
  }
  return best;
}

export const shortLabel = (config: string): string => (isModelConfig(config) ? MODEL_META[config].short : configLabel(config));

export function specLine(row: RenderRow): string {
  const parts: string[] = [];
  if (row.sampler) parts.push(row.sampler);
  if (isNum(row.steps)) parts.push(`${row.steps} steps`);
  if (isNum(row.resolution)) parts.push(`${row.resolution} px`);
  return parts.join(" · ");
}

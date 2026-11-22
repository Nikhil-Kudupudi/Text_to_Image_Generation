import { useMemo, useState, type ReactNode } from "react";
import { SeriesDot } from "../../components/ui";
import { fmt, fmtSeconds } from "../../lib/format";
import type { MetricRow } from "../../types";
import { isReal } from "./parts";

type Dir = "ascending" | "descending";

interface Col {
  key: string;
  label: string;
  num?: boolean;
  /** which end is best; columns without it are never marked */
  best?: "min" | "max";
  get(r: MetricRow): number | string | null;
  show?(r: MetricRow): ReactNode;
}

const COLS: Col[] = [
  { key: "label", label: "Config", get: (r) => r.label },
  { key: "group", label: "Group", get: (r) => r.group },
  { key: "N", label: "N", num: true, get: (r) => r.N },
  { key: "FID", label: "FID", num: true, best: "min", get: (r) => r.FID, show: (r) => fmt(r.FID, 1) },
  {
    key: "IS", label: "IS", num: true, best: "max", get: (r) => r.IS_mean,
    show: (r) => (r.IS_mean == null ? "—" : <>{fmt(r.IS_mean, 2)}<span className="faint"> ± {fmt(r.IS_std, 2)}</span></>),
  },
  {
    key: "CLIP", label: "CLIP", num: true, best: "max", get: (r) => r.CLIP_mean,
    show: (r) => (r.CLIP_mean == null ? "—" : <>{fmt(r.CLIP_mean, 3)}<span className="faint"> ± {fmt(r.CLIP_std, 3)}</span></>),
  },
  { key: "sec", label: "s / img", num: true, best: "min", get: (r) => r.sec_per_image, show: (r) => fmtSeconds(r.sec_per_image) },
  { key: "res", label: "Resolution", num: true, get: (r) => r.resolution },
  { key: "guidance", label: "Guidance", num: true, get: (r) => r.guidance },
  { key: "encoder", label: "Encoder", get: (r) => r.encoder || null },
];

/** Best value of each markable column within each group (FID is only comparable at equal N). */
function bestByGroup(rows: MetricRow[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const col of COLS) {
    if (!col.best) continue;
    for (const r of rows) {
      const v = col.get(r);
      if (isReal(r) || typeof v !== "number") continue;
      const k = `${r.group}:${col.key}`;
      const cur = best.get(k);
      if (cur === undefined || (col.best === "min" ? v < cur : v > cur)) best.set(k, v);
    }
  }
  return best;
}

function compare(a: number | string | null, b: number | string | null, dir: Dir): number {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1; // missing values always last
  if (b == null || b === "") return -1;
  const c = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return dir === "ascending" ? c : -c;
}

export function MetricsTable({ rows }: { rows: MetricRow[] }) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(null);
  const best = useMemo(() => bestByGroup(rows), [rows]);
  const sorted = useMemo(() => {
    const col = sort && COLS.find((c) => c.key === sort.key);
    if (!col || !sort) return rows;
    return rows.map((r, i) => ({ r, i }))
      .sort((a, b) => compare(col.get(a.r), col.get(b.r), sort.dir) || a.i - b.i)
      .map((x) => x.r);
  }, [rows, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "ascending" ? "descending" : "ascending" } : { key, dir: "ascending" }));

  return (
    <div className="table-wrap">
      <table className="table metrics-table">
        <caption className="sr-only">Metrics</caption>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.key} scope="col" className={c.num ? "num" : undefined} aria-sort={sort?.key === c.key ? sort.dir : undefined}>
                <button type="button" className="sort-button" onClick={() => toggle(c.key)}>
                  {c.label}
                  <span className="sort-mark" aria-hidden="true">
                    {sort?.key === c.key ? (sort.dir === "ascending" ? "↑" : "↓") : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={`${r.group}:${r.config}`} className={isReal(r) ? "row-reference" : undefined}>
              {COLS.map((c, ci) => {
                const v = c.get(r);
                const isBest = c.best != null && !isReal(r) && typeof v === "number" && best.get(`${r.group}:${c.key}`) === v;
                const content = c.show ? c.show(r) : v ?? "—";
                if (ci === 0) {
                  return (
                    <th key={c.key} scope="row" className="cell-label">
                      <SeriesDot config={r.config} />
                      {content}
                    </th>
                  );
                }
                return (
                  <td key={c.key} data-col={c.key} data-best={isBest ? "true" : undefined}
                    className={[c.num && "num", isBest && "is-best", c.key === "encoder" && "muted"].filter(Boolean).join(" ") || undefined}>
                    {content}
                    {isBest && <span className="sr-only"> (best)</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

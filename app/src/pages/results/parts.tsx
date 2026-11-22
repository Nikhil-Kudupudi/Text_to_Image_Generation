import type { ReactNode } from "react";
import { isReal } from "../../lib/configs";
import type { MetricRow } from "../../types";

/** A titled chart card; every chart on the page sits in one. */
export function ChartCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="card chart-card">
      <div className="chart-card-head">
        <h4 className="chart-card-title">{title}</h4>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Small heading inside a section. */
export function SubHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="sub-head">
      <h3>{children}</h3>
      {aside}
    </div>
  );
}

export const M3_TABLES = "outputs/milestone_3/tables/";
export const M2_SWEEP = "outputs/milestone_2/sweep/";

/** The reference row of real COCO photos the notebook adds to each metrics group. */
export { isReal } from "../../lib/configs";

/** Metric rows of one group, generated configs only (real photos excluded). */
export function generated(metrics: MetricRow[], group: MetricRow["group"]): MetricRow[] {
  return metrics.filter((r) => r.group === group && !isReal(r));
}

export { fmtGb } from "../../lib/format";

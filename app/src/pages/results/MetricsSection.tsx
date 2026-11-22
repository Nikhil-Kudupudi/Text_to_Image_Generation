import { EmptyState, Section } from "../../components/ui";
import type { MetricRow, RankRow } from "../../types";
import { MetricsTable } from "./MetricsTable";
import { M3_TABLES, SubHead } from "./parts";
import { RankHeatmaps, WinnerCards } from "./Ranking";

/** Full metrics table, rank heatmaps per question, and the winners at the very end. */
export function MetricsSection({ metrics, ranking }: { metrics: MetricRow[]; ranking: RankRow[] }) {
  return (
    <Section id="metrics" title="Metrics">
      {metrics.length > 0 ? (
        <MetricsTable rows={metrics} />
      ) : (
        <EmptyState title="No metrics yet" hint={`${M3_TABLES}m3_metrics.json`} />
      )}
      <SubHead>Ranking</SubHead>
      {ranking.length > 0 ? (
        <>
          <RankHeatmaps ranking={ranking} />
          <WinnerCards ranking={ranking} />
        </>
      ) : (
        <EmptyState title="No ranking yet" hint={`${M3_TABLES}m3_ranking.csv`} />
      )}
    </Section>
  );
}

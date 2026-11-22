import { RankHeatmap } from "../../components/charts";
import { Icon } from "../../components/Icon";
import { SeriesDot } from "../../components/ui";
import { fmt, fmtSeconds } from "../../lib/format";
import type { RankRow } from "../../types";
import { ChartCard } from "./parts";

const QUESTIONS: { q: RankRow["question"]; title: string; best: string }[] = [
  { q: "models", title: "Models", best: "Best model" },
  { q: "guidance", title: "Guidance", best: "Best guidance" },
  { q: "embedding", title: "Embedding", best: "Best embedding" },
];

function byQuestion(ranking: RankRow[]) {
  return QUESTIONS.map((meta) => ({
    ...meta,
    rows: ranking.filter((r) => r.question === meta.q).sort((a, b) => a.overall_rank - b.overall_rank),
  })).filter((g) => g.rows.length > 0);
}

/** One rank heatmap per question (rows in overall order, winner marked). */
export function RankHeatmaps({ ranking }: { ranking: RankRow[] }) {
  return (
    <div className="results-grid">
      {byQuestion(ranking).map(({ q, title, rows }) => (
        <ChartCard key={q} title={title} aside={<span className="faint num">N = {rows[0].N}</span>}>
          <RankHeatmap
            columns={["FID", "IS", "CLIP"]}
            rows={rows.map((r, i) => ({ label: r.label, ranks: [r.rank_FID, r.rank_IS, r.rank_CLIP], avg: r.avg_rank, winner: i === 0 }))}
            ariaLabel={`Ranking: ${q}`}
          />
        </ChartCard>
      ))}
    </div>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <div className="winner-num">
      <span className="winner-num-label">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

/** The winner of each question, shown last on the page. */
export function WinnerCards({ ranking }: { ranking: RankRow[] }) {
  const groups = byQuestion(ranking);
  if (groups.length === 0) return null;
  return (
    <div className="winner-cards">
      {groups.map(({ q, best, rows }) => {
        const w = rows[0];
        return (
          <div key={q} className="card winner-card" data-testid="winner-card">
            <h3 className="winner-kicker">
              <Icon name="trophy" size={14} />
              {best}
            </h3>
            <div className="winner-label">
              <SeriesDot config={w.config} />
              <span>{w.label}</span>
            </div>
            <div className="winner-avg num">avg rank {fmt(w.avg_rank, 2)}</div>
            <div className="winner-nums">
              <Num label="FID" value={fmt(w.FID, 1)} />
              <Num label="IS" value={fmt(w.IS_mean, 2)} />
              <Num label="CLIP" value={fmt(w.CLIP_mean, 3)} />
              <Num label="s / img" value={fmtSeconds(w.sec_per_image)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

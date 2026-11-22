import { BarChart, LineChart, ScatterChart, type Better } from "../../components/charts";
import { EmptyState, Pill, Section } from "../../components/ui";
import { seriesVar } from "../../lib/configs";
import type { MetricRow } from "../../types";
import { ChartCard, M3_TABLES, SubHead, generated, isReal } from "./parts";

interface Metric {
  key: "FID" | "IS" | "CLIP";
  better: Better;
  value(r: MetricRow): number | null;
  err(r: MetricRow): number | null;
  format(v: number): string;
}

const METRICS: Metric[] = [
  { key: "FID", better: "lower", value: (r) => r.FID, err: () => null, format: (v) => v.toFixed(1) },
  { key: "IS", better: "higher", value: (r) => r.IS_mean, err: (r) => r.IS_std, format: (v) => v.toFixed(2) },
  { key: "CLIP", better: "higher", value: (r) => r.CLIP_mean, err: (r) => r.CLIP_std, format: (v) => v.toFixed(3) },
];

// The guidance renders reuse the sd_tuned pipeline, so the lines wear its colour.
const GUIDANCE_COLOR = seriesVar("sd_tuned");

/** Real photos give IS and CLIP a reference value; they have no FID against themselves. */
function referenceOf(metrics: MetricRow[], group: MetricRow["group"], m: Metric) {
  const real = metrics.find((r) => r.group === group && isReal(r));
  const v = real ? m.value(real) : null;
  return v == null ? undefined : { value: v, label: "real photos" };
}

export function PerformanceSection({ metrics }: { metrics: MetricRow[] }) {
  const models = generated(metrics, "models");
  const guidance = generated(metrics, "guidance")
    .filter((r) => r.guidance != null)
    .sort((a, b) => (a.guidance as number) - (b.guidance as number));
  const scatter = models.filter((r) => r.FID != null && r.CLIP_mean != null);

  if (models.length === 0 && guidance.length === 0) {
    return (
      <Section id="performance" title="Performance">
        <EmptyState title="No metrics yet" hint={`${M3_TABLES}m3_metrics.json`} />
      </Section>
    );
  }

  return (
    <Section id="performance" title="Performance" actions={<Pill>FID compares within equal N</Pill>}>
      {models.length > 0 && (
        <>
          <SubHead aside={<span className="faint num">N = {models[0].N}</span>}>Models</SubHead>
          <div className="results-grid">
            {METRICS.map((m) => (
              <ChartCard key={m.key} title={m.key}>
                <BarChart
                  items={models.map((r) => ({ key: r.config, label: r.label, value: m.value(r), err: m.err(r), color: seriesVar(r.config) }))}
                  better={m.better} format={m.format} reference={referenceOf(metrics, "models", m)}
                  ariaLabel={`${m.key} by model`}
                />
              </ChartCard>
            ))}
          </div>
        </>
      )}
      {guidance.length > 0 && (
        <>
          <SubHead aside={<span className="faint num">N = {guidance[0].N}</span>}>Guidance</SubHead>
          <div className="results-grid">
            {METRICS.map((m) => (
              <ChartCard key={m.key} title={`${m.key} vs guidance`}>
                <LineChart
                  points={guidance.map((r) => ({ x: r.guidance as number, y: m.value(r), err: m.err(r) }))}
                  xLabel="guidance" yLabel={m.key} better={m.better} format={m.format} color={GUIDANCE_COLOR}
                  ariaLabel={`${m.key} vs guidance`}
                />
              </ChartCard>
            ))}
          </div>
        </>
      )}
      {scatter.length > 0 && (
        <>
          <SubHead>Trade-off</SubHead>
          <div className="results-grid results-grid-wide">
            <ChartCard title="FID vs CLIP">
              <ScatterChart
                points={scatter.map((r) => ({
                  key: r.config, label: r.label, x: r.CLIP_mean as number, y: r.FID as number,
                  size: r.sec_per_image ?? undefined, color: seriesVar(r.config),
                }))}
                xLabel="CLIP (higher is better)" yLabel="FID (lower is better)"
                formatX={(v) => v.toFixed(3)} formatY={(v) => v.toFixed(1)}
                sizeLabel="s / img" ariaLabel="FID vs CLIP"
              />
            </ChartCard>
          </div>
        </>
      )}
    </Section>
  );
}

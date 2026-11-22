import { useState } from "react";
import { BarChart, LineChart } from "../../components/charts";
import { Lightbox, type LightboxItem } from "../../components/Lightbox";
import { seriesVar } from "../../lib/configs";
import { fmt } from "../../lib/format";
import { m2Url } from "../../lib/urls";
import type { M2Results, SweepSettingRow } from "../../types";
import { ChartCard } from "./parts";

// The earlier sweep ran on SD v1.5, the same model as sd_baseline, so it wears that colour.
const COLOR = seriesVar("sd_baseline");
const clip3 = (v: number) => v.toFixed(3);
const clipOf = (r: SweepSettingRow) => (r.status === "ok" ? r.clip_score_mean : null);
const secs = (r: SweepSettingRow) => (r.seconds == null ? "" : ` · ${Math.round(r.seconds)} s`);

/** "dpmpp_s20_g7.5_trailing_zerosnr" -> "trailing zerosnr" */
function scheduleName(r: SweepSettingRow): string {
  const prefix = `${r.sampler}_s${r.steps}_g${r.guidance}_`;
  const rest = r.label.startsWith(prefix) ? r.label.slice(prefix.length) : r.label;
  return rest.replace(/_/g, " ");
}

function shortName(r: SweepSettingRow): string {
  if (r.axis === "guidance") return `g ${r.guidance}`;
  if (r.axis === "sampler") return `${r.sampler} ${r.steps}`;
  return scheduleName(r);
}

function GridChips({ rows, grids, onOpen }: { rows: SweepSettingRow[]; grids: Record<string, string>; onOpen(label: string): void }) {
  const withGrid = rows.filter((r) => grids[r.label]);
  if (withGrid.length === 0) return null;
  return (
    <div className="grid-chips" role="group" aria-label="Image grids">
      {withGrid.map((r) => (
        <button key={r.label} type="button" className="chip" onClick={() => onOpen(r.label)}
          aria-label={`${shortName(r)} grid: ${r.label}`} title={r.label}>
          {shortName(r)}
        </button>
      ))}
    </div>
  );
}

/** Milestone 2 settings sweep: CLIP vs guidance (line), CLIP by sampler and by schedule (bars). */
export function SweepCharts({ m2 }: { m2: M2Results }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = m2.summary?.reference_real_photos;
  const reference = typeof ref === "number" ? { value: ref, label: "real photos" } : undefined;

  const guidance = m2.sweep.filter((r) => r.axis === "guidance").sort((a, b) => a.guidance - b.guidance);
  const sampler = m2.sweep.filter((r) => r.axis === "sampler");
  const schedule = m2.sweep.filter((r) => r.axis === "schedule");

  const ordered = [...guidance, ...sampler, ...schedule].filter((r) => m2.grids[r.label]);
  const items: LightboxItem[] = ordered.map((r) => ({
    src: m2Url(m2.grids[r.label]),
    alt: `10-image grid for ${r.label}`,
    title: r.label,
    meta: `CLIP ${fmt(clipOf(r), 3)}${secs(r)}`,
  }));
  const openLabel = (label: string) => setOpen(ordered.findIndex((r) => r.label === label));
  const bars = (rows: SweepSettingRow[], name: (r: SweepSettingRow) => string) =>
    rows.map((r) => ({ key: r.label, label: `${name(r)}${secs(r)}`, value: clipOf(r), err: r.status === "ok" ? r.clip_score_std : null, color: COLOR }));

  return (
    <>
      <div className="results-grid">
        {guidance.length > 0 && (
          <ChartCard title="CLIP vs guidance" aside={reference && <span className="pill">real photos {clip3(reference.value)}</span>}>
            <LineChart
              points={guidance.map((r) => ({ x: r.guidance, y: clipOf(r), err: r.status === "ok" ? r.clip_score_std : null }))}
              xLabel="guidance" yLabel="CLIP" better="higher" format={clip3} color={COLOR}
              ariaLabel="Earlier sweep: CLIP vs guidance"
            />
            <GridChips rows={guidance} grids={m2.grids} onOpen={openLabel} />
          </ChartCard>
        )}
        {sampler.length > 0 && (
          <ChartCard title="CLIP by sampler">
            <BarChart items={bars(sampler, (r) => `${r.sampler} ${r.steps}`)} better="higher" format={clip3}
              reference={reference} ariaLabel="Earlier sweep: CLIP by sampler" />
            <GridChips rows={sampler} grids={m2.grids} onOpen={openLabel} />
          </ChartCard>
        )}
        {schedule.length > 0 && (
          <ChartCard title="CLIP by schedule">
            <BarChart items={bars(schedule, scheduleName)} better="higher" format={clip3}
              reference={reference} ariaLabel="Earlier sweep: CLIP by schedule" />
            <GridChips rows={schedule} grids={m2.grids} onOpen={openLabel} />
          </ChartCard>
        )}
      </div>
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}

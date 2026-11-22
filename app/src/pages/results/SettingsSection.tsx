import { EmptyState, Section, SeriesDot } from "../../components/ui";
import { configLabel } from "../../lib/configs";
import { fmt, fmtSeconds } from "../../lib/format";
import type { M2Results, RenderRow } from "../../types";
import { M2_SWEEP, M3_TABLES, SubHead, fmtGb } from "./parts";
import { SweepCharts } from "./SweepCharts";

function RenderTable({ rows }: { rows: RenderRow[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Render settings</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Encoder</th>
            <th scope="col">Sampler</th>
            <th scope="col" className="num">Steps</th>
            <th scope="col" className="num">Guidance</th>
            <th scope="col" className="num">Resolution</th>
            <th scope="col" className="num">s / img</th>
            <th scope="col" className="num">VRAM</th>
            <th scope="col" className="num">Images</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const short = r.n_images != null && r.images < r.n_images;
            return (
              <tr key={r.config}>
                <th scope="row" className="cell-label" title={r.model}>
                  <SeriesDot config={r.config} />
                  {configLabel(r.config)}
                </th>
                <td className="muted">{r.encoder ?? "—"}</td>
                <td className="mono">{r.sampler ?? "—"}</td>
                <td className="num">{r.steps ?? "—"}</td>
                <td className="num">{r.guidance ?? "—"}</td>
                <td className="num">{r.resolution ?? "—"}</td>
                <td className="num">{fmtSeconds(r.sec_per_image)}</td>
                <td className="num">{fmtGb(r.peak_vram_gb)}</td>
                <td className="num">
                  {short ? (
                    <span className="warn" title="images on disk / images logged">
                      {r.images} / {r.n_images}
                    </span>
                  ) : (
                    r.images
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsSection({ models, m2 }: { models: RenderRow[] | null; m2: M2Results | null }) {
  const sweep = m2?.sweep ?? [];
  const minutes = m2?.summary?.total_gpu_minutes;
  return (
    <Section id="settings" title="Settings">
      {models && models.length > 0 ? (
        <RenderTable rows={models} />
      ) : (
        <EmptyState title="No render log" hint={`${M3_TABLES}m3_generation_log.csv`} />
      )}
      <SubHead
        aside={
          sweep.length > 0 && (
            <span className="pill">
              {sweep.length} settings · 10 prompts each{typeof minutes === "number" ? ` · ${fmt(minutes, 1)} GPU min` : ""}
            </span>
          )
        }
      >
        Earlier sweep
      </SubHead>
      {m2 && sweep.length > 0 ? (
        <SweepCharts m2={m2} />
      ) : (
        <EmptyState title="No settings sweep" hint={`${M2_SWEEP}all_results.csv`} />
      )}
    </Section>
  );
}

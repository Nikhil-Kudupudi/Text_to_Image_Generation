import type { M3Results } from "../../types";
import { StatTile } from "../../components/ui";
import { configLabel } from "../../lib/configs";
import { fmt, fmtSeconds } from "../../lib/format";
import { bestBy, modelMetric, secPerImage, winner } from "./data";

const DASH = "—";

export function StatTiles({ m3 }: { m3: M3Results }) {
  const win = winner(m3);
  const clip = bestBy(m3, (r) => modelMetric(m3, r.config)?.CLIP_mean ?? null, true);
  const fid = bestBy(m3, (r) => modelMetric(m3, r.config)?.FID ?? null, false);
  const fast = bestBy(m3, (r) => secPerImage(m3, r), false);

  return (
    <section className="stats home-stats" aria-label="Overview">
      <StatTile label="Winner" value={win ? win.label : DASH} sub={win?.avgRank != null ? `avg rank ${fmt(win.avgRank, 1)}` : undefined} />
      <StatTile label="Best CLIP" value={clip ? fmt(clip.value, 3) : DASH} sub={clip ? configLabel(clip.config) : undefined} />
      <StatTile label="Best FID" value={fid ? fmt(fid.value, 1) : DASH} sub={fid ? configLabel(fid.config) : undefined} />
      <StatTile label="Fastest" value={fast ? fmtSeconds(fast.value) : DASH} sub={fast ? configLabel(fast.config) : undefined} />
    </section>
  );
}

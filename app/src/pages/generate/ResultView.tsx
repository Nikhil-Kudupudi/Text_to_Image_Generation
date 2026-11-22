import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { SeriesDot } from "../../components/ui";
import { fmt, fmtSeconds } from "../../lib/format";
import type { GenerateResponse, Preset } from "../../types";
import { presetName } from "./form";
import { GenIcon } from "./icons";

export interface Pending {
  startedAt: number;
  /** the backend has to load another model family first (~10 s extra) */
  loading: boolean;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

/** The square result frame, the progress overlay while generating, then stats and actions. */
export function ResultView({
  result,
  pending,
  presets,
  onReuse,
}: {
  result: GenerateResponse | null;
  pending: Pending | null;
  presets: Preset[];
  onReuse(r: GenerateResponse): void;
}) {
  const elapsed = useElapsed(pending?.startedAt ?? null);

  return (
    <div className="gen-result" data-testid={result ? "result" : undefined}>
      <div className="gen-frame" aria-busy={pending !== null}>
        {result ? (
          <img
            key={result.id}
            className={pending ? "gen-image is-stale" : "gen-image"}
            src={result.image}
            alt={result.prompt}
            decoding="async"
          />
        ) : (
          !pending && (
            <div className="gen-placeholder" aria-hidden="true">
              <Icon name="image" size={32} />
            </div>
          )
        )}
        {pending && (
          <div className="gen-progress" role="status">
            <span className="gen-spinner" aria-hidden="true" />
            <span>{pending.loading ? "Loading model…" : "Generating…"}</span>
            <span className="num faint">{(elapsed / 1000).toFixed(1)} s</span>
          </div>
        )}
      </div>

      {result && (
        <div className="gen-result-foot">
          <dl className="gen-stats">
            <div>
              <dt>Time</dt>
              <dd className="num">{fmtSeconds(result.seconds)}</dd>
            </div>
            <div>
              <dt>CLIP</dt>
              <dd className="num">{fmt(result.clip, 3)}</dd>
            </div>
            <div>
              <dt>Preset</dt>
              <dd className="gen-stat-preset">
                <SeriesDot config={result.preset} />
                {presetName(result.preset, presets)}
              </dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd className="num">{result.seed}</dd>
            </div>
          </dl>
          <div className="row gen-result-actions">
            <a className="button" href={result.image} download={`${result.id}.png`}>
              <Icon name="download" size={16} />
              Download
            </a>
            <button type="button" className="button" onClick={() => onReuse(result)}>
              <GenIcon name="reuse" size={16} />
              Reuse settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

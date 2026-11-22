import type { M3Results } from "../../types";
import { Card, Section, SeriesDot } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { configLabel } from "../../lib/configs";
import { fmt, fmtSeconds } from "../../lib/format";
import { modelMetric, secPerImage, specLine, winner } from "./data";

export function ModelCards({ m3, selected, onSelect }: { m3: M3Results; selected: string; onSelect(config: string): void }) {
  const win = winner(m3)?.config;
  return (
    <Section id="configs" title="Configs">
      <div className="model-cards">
        {m3.models.map((row) => {
          const metric = modelMetric(m3, row.config);
          const isSelected = row.config === selected;
          return (
            <Card
              key={row.config}
              className={isSelected ? "model-card is-selected" : "model-card"}
              onClick={() => onSelect(row.config)}
            >
              <div className="model-card-body">
                <div className="model-card-head">
                  <SeriesDot config={row.config} />
                  <h3 className="model-card-title">{configLabel(row.config)}</h3>
                  {row.config === win && <Icon name="trophy" size={14} title="Winner" className="model-card-win" />}
                  {isSelected && <span className="sr-only">selected</span>}
                </div>
                <div className="model-card-spec faint">{specLine(row)}</div>
                <dl className="model-card-nums">
                  <div>
                    <dt>CLIP</dt>
                    <dd>{fmt(metric?.CLIP_mean, 3)}</dd>
                  </div>
                  <div>
                    <dt>FID</dt>
                    <dd>{fmt(metric?.FID, 1)}</dd>
                  </div>
                  <div>
                    <dt>s/img</dt>
                    <dd>{fmtSeconds(secPerImage(m3, row))}</dd>
                  </div>
                </dl>
              </div>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

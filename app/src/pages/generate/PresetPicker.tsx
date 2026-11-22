import { SeriesDot } from "../../components/ui";
import type { ModelConfig, Preset } from "../../types";
import { presetName, samplerName } from "./form";

/** Radio group of the backend's presets, each with its series colour dot. */
export function PresetPicker({
  presets,
  value,
  onChange,
}: {
  presets: Preset[];
  value: ModelConfig;
  onChange(p: Preset): void;
}) {
  const current = presets.find((p) => p.id === value);
  return (
    <fieldset className="gen-presets">
      <legend className="gen-label">Preset</legend>
      <div className="gen-preset-list">
        {presets.map((p) => (
          <label key={p.id} className="gen-preset" title={p.label}>
            <input
              type="radio"
              name="gen-preset"
              className="gen-preset-input"
              value={p.id}
              checked={p.id === value}
              onChange={() => onChange(p)}
            />
            <SeriesDot config={p.id} />
            <span>{presetName(p.id, presets)}</span>
          </label>
        ))}
      </div>
      {current && (
        <div className="gen-preset-meta faint mono">
          {samplerName(current.sampler)} · {current.resolution} px
        </div>
      )}
    </fieldset>
  );
}

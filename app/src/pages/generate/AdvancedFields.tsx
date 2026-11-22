import { randomSeed, type FormState } from "./form";
import { GenIcon } from "./icons";

type Patch = Partial<FormState>;

/** Guidance / steps / seed behind a disclosure; the summary line shows the current values. */
export function AdvancedFields({ form, onChange }: { form: FormState; onChange(p: Patch): void }) {
  const summary = [
    form.guidance !== "" ? `g ${form.guidance}` : null,
    form.steps !== "" ? `${form.steps} steps` : null,
    form.seed !== "" ? `seed ${form.seed}` : "random seed",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="gen-advanced">
      <summary>
        <span className="gen-label">Advanced</span>
        <span className="faint mono gen-advanced-summary">{summary}</span>
      </summary>
      <div className="gen-advanced-grid">
        <label className="gen-field">
          <span className="gen-label">Guidance</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            max={20}
            step={0.5}
            value={form.guidance}
            onChange={(e) => onChange({ guidance: e.target.value })}
          />
        </label>
        <label className="gen-field">
          <span className="gen-label">Steps</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            value={form.steps}
            onChange={(e) => onChange({ steps: e.target.value })}
          />
        </label>
        <div className="gen-field gen-field-seed">
          <label className="gen-label" htmlFor="gen-seed">
            Seed
          </label>
          <div className="gen-seed">
            <input
              id="gen-seed"
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={2 ** 32 - 1}
              step={1}
              placeholder="random"
              value={form.seed}
              onChange={(e) => onChange({ seed: e.target.value })}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Random seed"
              title="Random seed"
              onClick={() => onChange({ seed: String(randomSeed()) })}
            >
              <GenIcon name="dice" />
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

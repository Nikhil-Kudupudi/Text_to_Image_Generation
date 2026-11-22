import type { FormEvent, KeyboardEvent } from "react";
import type { Preset } from "../../types";
import { AdvancedFields } from "./AdvancedFields";
import { withPreset, type FormState } from "./form";
import { GenIcon } from "./icons";
import { PresetPicker } from "./PresetPicker";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function PromptForm({
  form,
  onChange,
  presets,
  suggestions,
  onMoreSuggestions,
  placeholder,
  disabled,
  canSubmit,
  generating,
  note,
  error,
  onSubmit,
}: {
  form: FormState;
  onChange(next: FormState): void;
  presets: Preset[];
  suggestions: string[];
  onMoreSuggestions(): void;
  placeholder: string;
  /** whole form inert (backend offline or still connecting) */
  disabled: boolean;
  canSubmit: boolean;
  generating: boolean;
  /** short status next to the button, e.g. backend busy */
  note: string | null;
  error: string | null;
  onSubmit(): void;
}) {
  const patch = (p: Partial<FormState>) => onChange({ ...form, ...p });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <form className="card gen-form" onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <fieldset className="gen-fieldset" disabled={disabled}>
        <textarea
          className="input gen-prompt"
          aria-label="Prompt"
          rows={4}
          maxLength={2000}
          placeholder={placeholder}
          value={form.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
        />

        {suggestions.length > 0 && (
          <div className="gen-chips" role="group" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" className="gen-chip" title={s} onClick={() => patch({ prompt: s })}>
                {s}
              </button>
            ))}
            <button
              type="button"
              className="icon-button ghost gen-chip-more"
              aria-label="Other suggestions"
              title="Other suggestions"
              onClick={onMoreSuggestions}
            >
              <GenIcon name="shuffle" size={16} />
            </button>
          </div>
        )}

        {presets.length > 0 && (
          <PresetPicker presets={presets} value={form.preset} onChange={(p) => onChange(withPreset(form, p))} />
        )}

        <AdvancedFields form={form} onChange={patch} />

        <div className="gen-actions">
          <button
            type="submit"
            className="button button-primary gen-submit"
            disabled={!canSubmit}
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {generating ? "Generating…" : "Generate"}
            {!generating && (
              <kbd className="gen-kbd" aria-hidden="true">
                {IS_MAC ? "⌘" : "Ctrl"} ↵
              </kbd>
            )}
          </button>
          {note && <span className="faint gen-note">{note}</span>}
        </div>
        {error && (
          <p className="gen-error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}

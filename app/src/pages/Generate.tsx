import { useEffect, useMemo, useRef, useState } from "react";
import { generate } from "../lib/api";
import { useResults } from "../lib/ManifestContext";
import type { GenerateResponse, HealthResponse } from "../types";
import {
  EMPTY_FORM,
  FALLBACK_PLACEHOLDER,
  fromResult,
  initialPreset,
  needsLoad,
  pickSuggestions,
  presetName,
  toRequest,
  withPreset,
  type FormState,
} from "./generate/form";
import { HistoryStrip } from "./generate/HistoryStrip";
import { OfflineCard } from "./generate/OfflineCard";
import { PromptForm } from "./generate/PromptForm";
import { ResultView, type Pending } from "./generate/ResultView";
import { useBackend, type BackendStatus } from "./generate/useBackend";
import "../styles/generate.css";

function BackendBadge({ status, health }: { status: BackendStatus; health: HealthResponse | null }) {
  const text = status === "online" ? health?.gpu ?? health?.device ?? "Online" : status === "offline" ? "Offline" : "Connecting";
  const title = status === "online" && health?.loaded ? `Loaded: ${presetName(health.loaded)}` : undefined;
  return (
    <span className="gen-badge" title={title}>
      <span className={`gen-dot ${status === "online" ? "is-on" : status === "offline" ? "is-off" : ""}`} aria-hidden="true" />
      {text}
    </span>
  );
}

export default function GeneratePage({ pollMs = 5000 }: { pollMs?: number }) {
  const { data } = useResults();
  const { health, status, presets, history, addHistory, refreshHealth } = useBackend(pollMs);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const alive = useRef(true);
  const seeded = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Take the default preset's guidance/steps once the presets arrive.
  useEffect(() => {
    if (seeded.current || presets.length === 0) return;
    seeded.current = true;
    setForm((f) => {
      const p = initialPreset(presets, f.preset);
      return p ? withPreset(f, p) : f;
    });
  }, [presets]);

  const prompts = data?.m3?.prompts ?? [];
  const suggestions = useMemo(() => pickSuggestions(prompts, round), [prompts, round]);
  const placeholder = prompts[0]?.caption ?? FALLBACK_PLACEHOLDER;

  const online = status === "online" && presets.length > 0;
  const remoteBusy = online && (health?.busy ?? false) && pending === null;
  const canSubmit = online && !remoteBusy && pending === null && form.prompt.trim() !== "";

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setPending({ startedAt: Date.now(), loading: needsLoad(health?.loaded, form.preset) });
    try {
      const r = await generate(toRequest(form));
      if (!alive.current) return;
      setResult(r);
      addHistory(r);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof TypeError ? "Couldn't reach the backend. Is it still running?" : (e as Error).message);
    } finally {
      if (alive.current) {
        setPending(null);
        void refreshHealth();
      }
    }
  };

  const reuse = (r: GenerateResponse) => {
    setForm(fromResult(r));
    setError(null);
  };

  return (
    <div className="gen">
      <header className="page-head">
        <h1>Generate</h1>
        <BackendBadge status={status} health={health} />
      </header>

      {status === "offline" && <OfflineCard pollMs={pollMs} />}

      <div className="gen-layout">
        <PromptForm
          form={form}
          onChange={setForm}
          presets={presets}
          suggestions={suggestions}
          onMoreSuggestions={() => setRound((n) => n + 1)}
          placeholder={placeholder}
          disabled={!online}
          canSubmit={canSubmit}
          generating={pending !== null}
          note={remoteBusy ? "Backend busy with another generation" : null}
          error={error}
          onSubmit={() => void submit()}
        />
        <ResultView result={result} pending={pending} presets={presets} onReuse={reuse} />
      </div>

      <HistoryStrip items={history} presets={presets} onReuse={reuse} />
    </div>
  );
}

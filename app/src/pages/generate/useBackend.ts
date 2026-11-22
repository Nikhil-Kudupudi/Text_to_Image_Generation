import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth, getHistory, getPresets } from "../../lib/api";
import type { GenerateResponse, HealthResponse, Preset } from "../../types";

export type BackendStatus = "checking" | "online" | "offline";

/**
 * Health, presets and history of the local generation backend.
 * Health is polled every `pollMs` while the backend is offline or busy with someone else's job,
 * and re-checked on window focus and whenever the page asks (after a generation).
 */
export function useBackend(pollMs: number) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<BackendStatus>("checking");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [history, setHistory] = useState<GenerateResponse[]>([]);
  const alive = useRef(true);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await getHealth();
      if (!alive.current) return;
      setHealth(h);
      setStatus(h.ok ? "online" : "offline");
    } catch {
      if (!alive.current) return;
      setHealth(null);
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refreshHealth();
    const onFocus = () => void refreshHealth();
    window.addEventListener("focus", onFocus);
    return () => {
      alive.current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshHealth]);

  const busy = health?.busy ?? false;
  useEffect(() => {
    if (status === "online" && !busy) return;
    const t = setInterval(() => void refreshHealth(), pollMs);
    return () => clearInterval(t);
  }, [status, busy, pollMs, refreshHealth]);

  // Each time the backend comes up: presets (if still missing) and the history.
  const havePresets = presets.length > 0;
  useEffect(() => {
    if (status !== "online") return;
    let cancelled = false;
    if (!havePresets) {
      getPresets()
        .then((p) => !cancelled && setPresets(p))
        .catch(() => !cancelled && setStatus("offline"));
    }
    getHistory()
      .then((h) => !cancelled && setHistory(h))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Keyed on status alone on purpose: reload only on the transition to online.
  }, [status]);

  const addHistory = useCallback((r: GenerateResponse) => {
    setHistory((h) => [r, ...h.filter((x) => x.id !== r.id)]);
  }, []);

  return { health, status, presets, history, addHistory, refreshHealth };
}

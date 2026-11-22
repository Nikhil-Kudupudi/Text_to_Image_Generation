import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Manifest } from "../types";
import { resultUrl } from "./urls";

export interface ResultsState {
  data: Manifest | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Exported so tests can inject a manifest without fetching:
 * <ResultsContext.Provider value={{ data, error: null, loading: false, reload() {} }}>
 */
export const ResultsContext = createContext<ResultsState>({
  data: null,
  error: null,
  loading: false,
  reload: () => {},
});

/** Fetches the manifest on mount, on reload() and whenever the window regains focus. */
export function ManifestProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    fetch(resultUrl("manifest.json"), { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Manifest: HTTP ${res.status}`);
        return (await res.json()) as Manifest;
      })
      .then(
        (m) => {
          if (id !== seq.current) return;
          setData(m);
          setError(null);
        },
        (e: unknown) => {
          if (id !== seq.current) return;
          setError(e instanceof Error ? e.message : String(e));
        },
      )
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("focus", reload);
      seq.current++; // ignore responses that land after unmount
    };
  }, [reload]);

  const value = useMemo(() => ({ data, error, loading, reload }), [data, error, loading, reload]);
  return <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>;
}

export function useResults(): ResultsState {
  return useContext(ResultsContext);
}

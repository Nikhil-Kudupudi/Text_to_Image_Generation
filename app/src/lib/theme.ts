import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "t2i-theme";

function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function darkQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  } catch {
    return null;
  }
}

const systemTheme = (): Theme => (darkQuery()?.matches ? "dark" : "light");

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

/** Call once before the first render so the first paint has the right theme. */
export function initTheme(): Theme {
  const t = storedTheme() ?? systemTheme();
  applyTheme(t);
  return t;
}

/** Current theme + toggle. Follows the OS until the user picks one; the pick is persisted. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const mq = darkQuery();
    if (!mq) return;
    const onChange = () => {
      if (!storedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // storage unavailable (private mode, blocked): the toggle still works for this visit
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}

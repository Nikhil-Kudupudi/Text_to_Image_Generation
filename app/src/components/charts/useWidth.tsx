import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Tracks an element's content width with ResizeObserver. Where ResizeObserver is missing
 * (jsdom) or the element has no layout yet, the width stays at `fallback`.
 */
export function useWidth<T extends HTMLElement = HTMLDivElement>(fallback = 640): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  // Never start wider than the window: a 640px first render on a phone widens the layout viewport.
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" && window.innerWidth > 0
      ? Math.min(fallback, Math.max(240, window.innerWidth - 32))
      : fallback,
  );
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = (w: number) => {
      if (w > 0) setWidth(Math.round(w));
    };
    apply(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

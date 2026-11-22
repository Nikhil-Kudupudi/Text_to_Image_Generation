import { useEffect, useRef, useState, type MouseEvent } from "react";

export const SECTIONS = [
  { id: "settings", label: "Settings" },
  { id: "performance", label: "Performance" },
  { id: "plots", label: "Plots" },
  { id: "metrics", label: "Metrics" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * Sticky in-page nav. Links scroll to their section without touching the hash
 * (the hash holds the route, #/results). The current section follows scrolling.
 */
export function SubNav() {
  const [current, setCurrent] = useState<SectionId>("settings");
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Current = the last section whose top has passed just under the sticky nav;
    // at the very bottom of the page, the last section.
    const update = () => {
      const line = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 24;
      let next: SectionId = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) next = s.id;
      }
      const doc = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) next = SECTIONS[SECTIONS.length - 1].id;
      setCurrent(next);
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const go = (e: MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    e.preventDefault();
    setCurrent(id);
    const target = document.getElementById(id);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav ref={navRef} className="subnav" aria-label="Results sections">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="subnav-link"
          aria-current={current === s.id ? "true" : undefined}
          onClick={(e) => go(e, s.id)}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}

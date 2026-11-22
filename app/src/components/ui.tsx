import { useState, type KeyboardEvent, type ReactNode } from "react";
import { seriesVar } from "../lib/configs";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** A page section: h2 title, optional actions on the right. `id` is the anchor target. */
export function Section({ id, title, actions, children }: { id: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="section" aria-labelledby={`${id}-title`}>
      <header className="section-head">
        <h2 id={`${id}-title`} className="section-title">
          {title}
        </h2>
        {actions != null && <div className="section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** The one card style. Clickable cards get role=button, keyboard activation and the .lift hover. */
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  if (!onClick) return <div className={cx("card", className)}>{children}</div>;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div className={cx("card", "lift", className)} role="button" tabIndex={0} onClick={onClick} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Segmented control: a row of toggle buttons, exactly one pressed. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="segmented-option"
          aria-pressed={o.value === value}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return <span className={cx("pill", tone === "accent" && "pill-accent")}>{children}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <div className="empty-title">{title}</div>
      {hint != null && <div className="empty-hint">{hint}</div>}
    </div>
  );
}

/** Small colour dot in the config's series colour. */
export function SeriesDot({ config }: { config: string }) {
  return <span className="series-dot" style={{ background: seriesVar(config) }} aria-hidden="true" />;
}

/** Lazy image in a square frame; a missing/broken image leaves an empty frame. A button when clickable. */
export function Thumb({ src, alt, onClick }: { src: string; alt: string; onClick?: () => void }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const className = cx("thumb", failed && "thumb-empty", onClick && "thumb-button");
  const content = failed ? null : (
    <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailedSrc(src)} />
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={alt}>
        {content}
      </button>
    );
  }
  return (
    <div className={className} role={failed ? "img" : undefined} aria-label={failed ? `${alt} (missing)` : undefined}>
      {content}
    </div>
  );
}

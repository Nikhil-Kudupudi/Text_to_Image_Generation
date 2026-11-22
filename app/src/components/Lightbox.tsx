import { useEffect, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface LightboxItem {
  src: string;
  alt: string;
  title?: string;
  meta?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Full-screen viewer. Controlled: `index` null (or out of range) = closed.
 * Keys: ←/→ move (wrapping), Esc closes. Focus is trapped inside and restored on close.
 */
export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: LightboxItem[];
  index: number | null;
  onClose(): void;
  onIndex(i: number): void;
}) {
  const open = index !== null && index >= 0 && index < items.length;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = items.length;

  // Latest values for the document listener without re-binding it on every index change.
  const live = useRef({ index, n, onClose, onIndex });
  live.current = { index, n, onClose, onIndex };

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      const { index: i, n: count, onClose: close, onIndex: go } = live.current;
      if (i === null) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight" && count > 1) {
        e.preventDefault();
        go((i + 1) % count);
      } else if (e.key === "ArrowLeft" && count > 1) {
        e.preventDefault();
        go((i - 1 + count) % count);
      } else if (e.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const inside = dialogRef.current?.contains(document.activeElement) ?? false;
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  if (!open || index === null) return null;
  const item = items[index];
  const onBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className="lightbox" data-testid="lightbox-backdrop" onClick={onBackdrop}>
      <div
        ref={dialogRef}
        className="lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={item.title ?? item.alt}
        onClick={onBackdrop}
      >
        <div className="lightbox-bar">
          <div className="lightbox-text">
            {item.title && <div className="lightbox-title">{item.title}</div>}
            {item.meta && <div className="lightbox-meta">{item.meta}</div>}
          </div>
          {n > 1 && (
            <span className="lightbox-count">
              {index + 1} / {n}
            </span>
          )}
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="lightbox-stage" onClick={onBackdrop}>
          {n > 1 && (
            <button
              type="button"
              className="icon-button lightbox-nav lightbox-prev"
              onClick={() => onIndex((index - 1 + n) % n)}
              aria-label="Previous"
            >
              <Icon name="chevronLeft" size={22} />
            </button>
          )}
          <img key={item.src} className="lightbox-img" src={item.src} alt={item.alt} />
          {n > 1 && (
            <button
              type="button"
              className="icon-button lightbox-nav lightbox-next"
              onClick={() => onIndex((index + 1) % n)}
              aria-label="Next"
            >
              <Icon name="chevronRight" size={22} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

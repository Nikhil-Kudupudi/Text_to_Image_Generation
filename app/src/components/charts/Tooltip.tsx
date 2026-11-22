import type { CSSProperties, ReactNode } from "react";

export interface TooltipRow {
  /** The number, shown strong. */
  value: string;
  /** What the number is, shown secondary. */
  label?: string;
  /** Series colour for a short line key. */
  color?: string;
}

export interface TooltipProps {
  /** Anchor in px, relative to the chart's positioned wrapper. */
  x: number;
  y: number;
  /** Wrapper width, used to flip the tooltip left near the right edge. */
  containerWidth: number;
  title?: string;
  rows: TooltipRow[];
  /** "above" (default) sits over the anchor; "right" sits beside it, vertically centred. */
  placement?: "above" | "right";
}

const box: CSSProperties = {
  position: "absolute",
  pointerEvents: "none",
  zIndex: 10,
  background: "var(--tooltip-bg)",
  color: "var(--tooltip-text)",
  borderRadius: "var(--radius-s, 6px)",
  padding: "6px 10px",
  fontSize: 12,
  lineHeight: 1.4,
  whiteSpace: "nowrap",
  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
};

/**
 * Floating readout for the hovered/focused mark. Values lead, labels follow. Hidden from
 * assistive tech: the same values live in each chart's table and in each mark's aria-label.
 */
export function Tooltip({ x, y, containerWidth, title, rows, placement = "above" }: TooltipProps) {
  const flipX = x > containerWidth - 180;
  let style: CSSProperties;
  if (placement === "right" && !flipX) {
    style = { ...box, left: x + 12, top: y, transform: "translate(0, -50%)" };
  } else if (placement === "right") {
    // No room beside the anchor: sit above it, ending at the anchor, so the mark's own label stays visible.
    style = { ...box, left: x, top: y - 14, transform: "translate(-100%, -100%)" };
  } else {
    const below = y < 56;
    style = {
      ...box,
      left: flipX ? x - 12 : x + 12,
      top: below ? y + 12 : y - 8,
      transform: `translate(${flipX ? "-100%" : "0"}, ${below ? "0" : "-100%"})`,
    };
  }
  return (
    <div data-testid="chart-tooltip" aria-hidden="true" style={style}>
      {title && <div style={{ opacity: 0.75, marginBottom: 2 }}>{title}</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {r.color && <LineKey color={r.color} />}
          <strong style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.value}</strong>
          {r.label && <span style={{ opacity: 0.75 }}>{r.label}</span>}
        </div>
      ))}
    </div>
  );
}

function LineKey({ color }: { color: string }): ReactNode {
  return <span style={{ display: "inline-block", width: 10, height: 2, borderRadius: 1, background: color }} />;
}

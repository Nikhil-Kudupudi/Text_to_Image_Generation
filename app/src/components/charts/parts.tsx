import type { CSSProperties, ReactNode, RefObject } from "react";

const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** The table-view twin of every chart: visually hidden, read by screen readers. */
export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    // Tables ignore width: 1px, so the clipping box is a wrapper div.
    <div style={srOnly}>
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** Positioned, width-tracked wrapper every chart mounts in (the tooltip is placed inside it). */
export function ChartFrame({ frameRef, children }: { frameRef: RefObject<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={frameRef} style={{ position: "relative", width: "100%" }}>
      {children}
    </div>
  );
}

/** Shared SVG props: scales with its box, system font, chart surface behind it. */
export function svgProps(width: number, height: number, ariaLabel: string) {
  return {
    role: "img" as const,
    "aria-label": ariaLabel,
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    style: { display: "block", fontFamily: "inherit", overflow: "visible" as const, maxWidth: "100%" },
  };
}

/** Focus ring for an SVG hit target, drawn by hand (outline on SVG nodes is unreliable). */
export const hitStyle: CSSProperties = { outline: "none", cursor: "default" };

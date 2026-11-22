import { useState } from "react";
import { ChartFrame, SrTable, hitStyle, svgProps } from "./parts";
import { Tooltip } from "./Tooltip";
import { useWidth } from "./useWidth";
import { FONT, TICK_STYLE, defaultFormat, linear, niceTicks, textWidth, tickFormatter } from "./scale";

export interface ScatterPoint {
  key: string;
  label: string;
  x: number;
  y: number;
  size?: number;
  color: string;
}

export interface ScatterChartProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  sizeLabel?: string;
  ariaLabel: string;
}

const HEIGHT = 300;
const TOP = 28;
const BOTTOM = 44;
const R_MIN = 4; // 8px dot
const R_MAX = 10; // 20px dot
const R_DEFAULT = 5;

type Box = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function padded(vals: number[]) {
  if (!vals.length) return niceTicks(0, 1);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
  return niceTicks(lo - pad, hi + pad);
}

/** Two numeric measures per entity, optional size channel, direct labels instead of a legend. */
export function ScatterChart({ points, xLabel, yLabel, formatX = defaultFormat, formatY = defaultFormat, sizeLabel, ariaLabel }: ScatterChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<{ i: number; focus: boolean } | null>(null);

  const xTicks = padded(points.map((p) => p.x));
  const yTicks = padded(points.map((p) => p.y));
  const xFmt = tickFormatter(xTicks);
  const yFmt = tickFormatter(yTicks);
  const left = Math.max(...yTicks.map((t) => textWidth(yFmt(t), FONT.tick))) + 14;
  const right = width - 12;
  const bottom = HEIGHT - BOTTOM;
  const x = linear([xTicks[0], xTicks[xTicks.length - 1]], [left, right]);
  const y = linear([yTicks[0], yTicks[yTicks.length - 1]], [bottom, TOP]);

  const sizes = points.flatMap((p) => (p.size != null && p.size >= 0 ? [Math.sqrt(p.size)] : []));
  const sMin = Math.min(...sizes);
  const sMax = Math.max(...sizes);
  const radius = (p: ScatterPoint) =>
    p.size == null || !sizes.length ? R_DEFAULT : sMax === sMin ? R_DEFAULT : R_MIN + ((Math.sqrt(p.size) - sMin) / (sMax - sMin)) * (R_MAX - R_MIN);
  const hasSize = sizes.length > 0;

  // Direct labels: right of the dot, else left, else nudged with a leader line.
  const placed: Box[] = points.map((p) => {
    const r = radius(p);
    return { x0: x(p.x) - r, x1: x(p.x) + r, y0: y(p.y) - r, y1: y(p.y) + r };
  });
  const labels = points.map((p) => {
    const cx = x(p.x);
    const cy = y(p.y);
    const r = radius(p);
    const w = textWidth(p.label, FONT.label);
    const tries = [
      { tx: cx + r + 6, ty: cy, anchor: "start" as const },
      { tx: cx - r - 6, ty: cy, anchor: "end" as const },
      { tx: cx + r + 6, ty: cy + 16, anchor: "start" as const },
      { tx: cx + r + 6, ty: cy - 16, anchor: "start" as const },
    ];
    const boxOf = (t: (typeof tries)[number]): Box => {
      const x0 = t.anchor === "start" ? t.tx : t.tx - w;
      return { x0, x1: x0 + w, y0: t.ty - 8, y1: t.ty + 8 };
    };
    const fits = (t: (typeof tries)[number]) => {
      const b = boxOf(t);
      return b.x0 >= 0 && b.x1 <= width && !placed.some((o) => overlaps(o, b));
    };
    const pick = tries.find(fits) ?? tries[0];
    placed.push(boxOf(pick));
    return { ...pick, leader: pick.ty !== cy };
  });

  const order = points.map((_, i) => i).sort((a, b) => radius(points[b]) - radius(points[a]));
  const cur = active ? points[active.i] : null;
  const tipRows = (p: ScatterPoint) => [
    { value: formatX(p.x), label: xLabel, color: p.color },
    { value: formatY(p.y), label: yLabel },
    ...(p.size != null ? [{ value: defaultFormat(p.size), label: sizeLabel ?? "size" }] : []),
  ];

  return (
    <ChartFrame frameRef={ref}>
      <svg {...svgProps(width, HEIGHT, ariaLabel)}>
        <rect width={width} height={HEIGHT} fill="var(--chart-surface)" />
        <g aria-hidden="true">
          <text x={0} y={14} fill="var(--text-2)" fontSize={FONT.label}>{yLabel}</text>
          {hasSize && sizeLabel && (
            <text x={width} y={14} textAnchor="end" fill="var(--text-3)" fontSize={FONT.tick}>{`dot size = ${sizeLabel}`}</text>
          )}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end" fill="var(--text-3)" style={TICK_STYLE}>{yFmt(t)}</text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={TOP} y2={bottom} stroke="var(--grid)" strokeWidth={1} />
              <text x={x(t)} y={bottom + 16} textAnchor="middle" fill="var(--text-3)" style={TICK_STYLE}>{xFmt(t)}</text>
            </g>
          ))}
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--axis)" strokeWidth={1} />
          <text x={(left + right) / 2} y={HEIGHT - 6} textAnchor="middle" fill="var(--text-2)" fontSize={FONT.label}>{xLabel}</text>
        </g>
        <g pointerEvents="none">
          {order.map((i) => {
            const p = points[i];
            return (
              <circle key={p.key} data-mark="dot" cx={x(p.x)} cy={y(p.y)} r={radius(p)} fill={p.color}
                stroke="var(--chart-surface)" strokeWidth={2} fillOpacity={active && active.i !== i ? 0.55 : 1} />
            );
          })}
          {points.map((p, i) => (
            <g key={p.key}>
              {labels[i].leader && (
                <line x1={x(p.x)} y1={y(p.y)} x2={labels[i].tx - 2} y2={labels[i].ty} stroke="var(--text-3)" strokeWidth={1} />
              )}
              <text x={labels[i].tx} y={labels[i].ty} dy="0.35em" textAnchor={labels[i].anchor} fill="var(--text-1)" fontSize={FONT.label}>
                {p.label}
              </text>
            </g>
          ))}
        </g>
        {points.map((p, i) => (
          <circle key={p.key} data-hit="dot" cx={x(p.x)} cy={y(p.y)} r={Math.max(12, radius(p) + 6)} fill="transparent"
            tabIndex={0} style={hitStyle} stroke={active?.i === i && active.focus ? "var(--accent)" : "none"} strokeWidth={2}
            aria-label={`${p.label}: ${xLabel} ${formatX(p.x)}, ${yLabel} ${formatY(p.y)}${p.size != null ? `, ${sizeLabel ?? "size"} ${defaultFormat(p.size)}` : ""}`}
            onPointerEnter={() => setActive({ i, focus: false })} onPointerLeave={() => setActive(null)}
            onFocus={() => setActive({ i, focus: true })} onBlur={() => setActive(null)} />
        ))}
      </svg>
      {cur && <Tooltip x={x(cur.x)} y={y(cur.y) - radius(cur)} containerWidth={width} title={cur.label} rows={tipRows(cur)} />}
      <SrTable
        caption={ariaLabel}
        head={["Item", xLabel, yLabel, ...(hasSize ? [sizeLabel ?? "Size"] : [])]}
        rows={points.map((p) => [p.label, formatX(p.x), formatY(p.y), ...(hasSize ? [p.size == null ? "—" : defaultFormat(p.size)] : [])])}
      />
    </ChartFrame>
  );
}

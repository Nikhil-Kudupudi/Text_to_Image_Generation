import { useState, type PointerEvent } from "react";
import { ChartFrame, SrTable, hitStyle, svgProps } from "./parts";
import { Tooltip } from "./Tooltip";
import { useWidth } from "./useWidth";
import { FONT, TICK_STYLE, betterHint, defaultFormat, linear, niceTicks, textWidth, tickFormatter, type Better } from "./scale";

export interface LinePoint {
  x: number;
  y: number | null;
  err?: number | null;
}

export interface LineChartProps {
  points: LinePoint[];
  xLabel: string;
  yLabel: string;
  better?: Better;
  format?: (v: number) => string;
  color?: string;
  /** Horizontal reference line (e.g. real photos), drawn in neutral ink and included in the y range. */
  reference?: { value: number; label: string };
  ariaLabel: string;
}

const HEIGHT = 260;
const TOP = 28;
const BOTTOM = 44;
const INSET = 12;

/** One series over a numeric x: crosshair + tooltip, error whiskers, line broken at nulls. */
export function LineChart({ points, xLabel, yLabel, better, format = defaultFormat, color = "var(--series-1)", reference, ariaLabel }: LineChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<{ i: number; focus: boolean } | null>(null);

  const pts = [...points].sort((a, b) => a.x - b.x);
  const valid = pts.map((p, i) => ({ ...p, i })).filter((p): p is LinePoint & { y: number; i: number } => p.y != null);
  const ys = valid.flatMap((p) => [p.y - (p.err ?? 0), p.y + (p.err ?? 0)]);
  if (reference && ys.length) ys.push(reference.value);
  const yTicks = ys.length ? niceTicks(Math.min(...ys), Math.max(...ys)) : [0, 1];
  const yFmt = tickFormatter(yTicks);
  const xs = pts.map((p) => p.x);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const uniqueX = [...new Set(xs)];
  const xTicks = uniqueX.length && uniqueX.length <= 8 ? uniqueX : niceTicks(xMin, xMax).filter((t) => t >= xMin && t <= xMax);

  const last = valid[valid.length - 1];
  const left = Math.max(...yTicks.map((t) => textWidth(yFmt(t), FONT.tick))) + 14;
  const right = width - (last ? textWidth(format(last.y), FONT.tick) + 18 : 16);
  const bottom = HEIGHT - BOTTOM;
  const x = linear([xMin, xMax], [left + INSET, right - INSET]);
  const y = linear([yTicks[0], yTicks[yTicks.length - 1]], [bottom, TOP]);
  const fmtVal = (p: LinePoint) => (p.y == null ? "—" : p.err != null ? `${format(p.y)} ± ${format(p.err)}` : format(p.y));

  // Consecutive non-null runs; a null closes the current run so the line breaks there.
  const segments: (typeof valid)[] = [[]];
  for (const p of pts.map((p, i) => ({ ...p, i }))) {
    const run = segments[segments.length - 1];
    if (p.y == null) {
      if (run.length) segments.push([]);
    } else run.push({ ...p, y: p.y });
  }

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || !valid.length) return;
    const px = (e.clientX - box.left) * (box.width ? width / box.width : 1);
    const near = valid.reduce((a, b) => (Math.abs(x(b.x) - px) < Math.abs(x(a.x) - px) ? b : a));
    setActive({ i: near.i, focus: false });
  };

  const cur = active ? pts[active.i] : null;
  const hint = better ? ` · ${betterHint(better)}` : "";

  return (
    <ChartFrame frameRef={ref}>
      <svg {...svgProps(width, HEIGHT, ariaLabel)}>
        <rect width={width} height={HEIGHT} fill="var(--chart-surface)" />
        <g aria-hidden="true">
          <text x={0} y={14} fill="var(--text-2)" fontSize={FONT.label}>
            {yLabel}
            {hint && <tspan fill="var(--text-3)" fontSize={FONT.tick}>{hint}</tspan>}
          </text>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end" fill="var(--text-3)" style={TICK_STYLE}>{yFmt(t)}</text>
            </g>
          ))}
          <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--axis)" strokeWidth={1} />
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={bottom + 16} textAnchor="middle" fill="var(--text-3)" style={TICK_STYLE}>{defaultFormat(t)}</text>
          ))}
          <text x={(left + right) / 2} y={HEIGHT - 6} textAnchor="middle" fill="var(--text-2)" fontSize={FONT.label}>{xLabel}</text>
        </g>
        <rect x={left} y={TOP} width={Math.max(0, right - left)} height={bottom - TOP} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setActive(null)} />
        {cur && (
          <line data-mark="crosshair" x1={x(cur.x)} x2={x(cur.x)} y1={TOP} y2={bottom} stroke="var(--text-3)" strokeWidth={1} pointerEvents="none" />
        )}
        {reference && valid.length > 0 && (
          <g data-mark="reference" aria-hidden="true" pointerEvents="none">
            <line x1={left} x2={right} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--text-3)" strokeWidth={1} />
            {/* Above the line, or below it when the line sits at the top of the plot (clear of the y label). */}
            <text x={left + 4} y={y(reference.value) < TOP + 14 ? y(reference.value) + 13 : y(reference.value) - 5}
              fill="var(--text-2)" fontSize={FONT.tick}>
              {reference.label} {format(reference.value)}
            </text>
          </g>
        )}
        <g pointerEvents="none">
          {valid.filter((p) => p.err != null).map((p) => (
            <g key={p.i} data-mark="err" stroke={color} strokeOpacity={0.7} strokeWidth={1.5} strokeLinecap="round">
              <line x1={x(p.x)} x2={x(p.x)} y1={y(p.y - p.err!)} y2={y(p.y + p.err!)} />
              <line x1={x(p.x) - 4} x2={x(p.x) + 4} y1={y(p.y - p.err!)} y2={y(p.y - p.err!)} />
              <line x1={x(p.x) - 4} x2={x(p.x) + 4} y1={y(p.y + p.err!)} y2={y(p.y + p.err!)} />
            </g>
          ))}
          {segments.filter((s) => s.length > 1).map((s) => (
            <path key={s[0].i} data-mark="line" d={s.map((p, k) => `${k ? "L" : "M"}${x(p.x)},${y(p.y)}`).join(" ")}
              fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {valid.map((p) => (
            <circle key={p.i} data-mark="point" cx={x(p.x)} cy={y(p.y)} r={active?.i === p.i ? 5 : 4}
              fill={color} stroke="var(--chart-surface)" strokeWidth={2} />
          ))}
          {last && (
            <text x={x(last.x) + 10} y={y(last.y)} dy="0.35em" fill="var(--text-1)" style={TICK_STYLE}>{format(last.y)}</text>
          )}
        </g>
        {valid.map((p) => (
          <circle key={p.i} data-hit="point" cx={x(p.x)} cy={y(p.y)} r={12} fill="transparent" tabIndex={0}
            aria-label={`${xLabel} ${defaultFormat(p.x)}: ${yLabel} ${fmtVal(p)}`} style={hitStyle}
            stroke={active?.i === p.i && active.focus ? "var(--accent)" : "none"} strokeWidth={2}
            onPointerEnter={() => setActive({ i: p.i, focus: false })} onPointerLeave={() => setActive(null)}
            onFocus={() => setActive({ i: p.i, focus: true })} onBlur={() => setActive(null)} />
        ))}
      </svg>
      {cur && cur.y != null && (
        <Tooltip x={x(cur.x)} y={y(cur.y)} containerWidth={width} title={`${xLabel} ${defaultFormat(cur.x)}`}
          rows={[{ value: fmtVal(cur), label: yLabel, color }]} />
      )}
      <SrTable
        caption={`${ariaLabel}${better ? ` (${betterHint(better)})` : ""}${reference ? `; ${reference.label} ${format(reference.value)}` : ""}`}
        head={[xLabel, yLabel, ...(pts.some((p) => p.err != null) ? ["±"] : [])]}
        rows={pts.map((p) => [
          defaultFormat(p.x),
          p.y == null ? "—" : format(p.y),
          ...(pts.some((d) => d.err != null) ? [p.err == null ? "—" : format(p.err)] : []),
        ])}
      />
    </ChartFrame>
  );
}

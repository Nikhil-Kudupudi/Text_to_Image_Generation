import { useState } from "react";
import { ChartFrame, SrTable, hitStyle, svgProps } from "./parts";
import { Tooltip } from "./Tooltip";
import { useWidth } from "./useWidth";
import { FONT, TICK_STYLE, betterHint, defaultFormat, fitText, hBarPath, linear, niceTicks, textWidth, tickFormatter, type Better } from "./scale";

export interface BarItem {
  key: string;
  label: string;
  value: number | null;
  err?: number | null;
  color: string;
}

export interface BarChartProps {
  items: BarItem[];
  better: Better;
  format?: (v: number) => string;
  reference?: { value: number; label: string };
  ariaLabel: string;
}

const ROW = 32;
const BAR = 20;
const AXIS_BAND = 44;

/** Horizontal bars: label left, value at the tip, null → no bar and "—". */
export function BarChart({ items, better, format = defaultFormat, reference, ariaLabel }: BarChartProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<{ i: number; focus: boolean } | null>(null);

  const fmt = (it: BarItem) =>
    it.value == null ? "—" : it.err != null ? `${format(it.value)} ± ${format(it.err)}` : format(it.value);
  const extremes = items.flatMap((it) =>
    it.value == null ? [] : [it.value - (it.err ?? 0), it.value + (it.err ?? 0)],
  );
  if (reference) extremes.push(reference.value);
  const ticks = niceTicks(Math.min(0, ...extremes), Math.max(0, ...extremes));
  const tickFmt = tickFormatter(ticks);

  const labelW = Math.min(width * (width < 480 ? 0.45 : 0.38), Math.max(...items.map((it) => textWidth(it.label, FONT.label)), 20) + 12);
  const valueW = Math.max(40, ...items.map((it) => textWidth(it.value == null ? "—" : format(it.value), FONT.tick) + 12));
  const left = labelW;
  const right = Math.max(left + 40, width - valueW);
  const top = reference ? 22 : 6;
  const plotH = items.length * ROW;
  const height = top + plotH + AXIS_BAND;
  const x = linear([ticks[0], ticks[ticks.length - 1]], [left, right]);
  const x0 = x(0);
  // Where the value label starts: past the bar end, or past the whisker when there is one.
  const tipOf = (it: BarItem) => (it.value == null ? x0 : x(it.value + (it.value >= 0 ? 1 : -1) * (it.err ?? 0)));
  const hint = better === "lower" ? `← ${betterHint(better)}` : `${betterHint(better)} →`;

  return (
    <ChartFrame frameRef={ref}>
      <svg {...svgProps(width, height, ariaLabel)}>
        <rect width={width} height={height} fill="var(--chart-surface)" />
        {active && (
          <rect
            x={2}
            y={top + active.i * ROW + 1}
            width={width - 4}
            height={ROW - 2}
            rx={4}
            fill="var(--grid)"
            fillOpacity={0.5}
            stroke={active.focus ? "var(--accent)" : "none"}
            strokeWidth={2}
          />
        )}
        <g aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top} y2={top + plotH} stroke="var(--grid)" strokeWidth={1} />
              <text x={x(t)} y={top + plotH + 16} textAnchor="middle" fill="var(--text-3)" style={TICK_STYLE}>
                {tickFmt(t)}
              </text>
            </g>
          ))}
          <line x1={x0} x2={x0} y1={top} y2={top + plotH} stroke="var(--axis)" strokeWidth={1} />
          <text x={(left + right) / 2} y={top + plotH + 36} textAnchor="middle" fill="var(--text-3)" fontSize={FONT.tick}>
            {hint}
          </text>
        </g>
        {items.map((it, i) => {
          const cy = top + i * ROW + ROW / 2;
          const tip = tipOf(it);
          const neg = it.value != null && it.value < 0;
          return (
            <g key={it.key}>
              <ItemLabel text={it.label} maxPx={left - 12} x={left - 10} y={cy} />
              {it.value != null && (
                <path data-mark="bar" d={hBarPath(x0, x(it.value), cy - BAR / 2, BAR)} fill={it.color}
                  fillOpacity={active && active.i !== i ? 0.55 : 1} />
              )}
              {it.value != null && it.err != null && (
                <g data-mark="err" stroke="var(--text-2)" strokeWidth={1.5} strokeLinecap="round">
                  <line x1={x(it.value - it.err)} x2={x(it.value + it.err)} y1={cy} y2={cy} />
                  <line x1={x(it.value - it.err)} x2={x(it.value - it.err)} y1={cy - 4} y2={cy + 4} />
                  <line x1={x(it.value + it.err)} x2={x(it.value + it.err)} y1={cy - 4} y2={cy + 4} />
                </g>
              )}
              <text x={tip + (neg ? -6 : 6)} y={cy} dy="0.35em" textAnchor={neg ? "end" : "start"}
                fill={it.value == null ? "var(--text-3)" : "var(--text-1)"} style={TICK_STYLE}>
                {it.value == null ? "—" : format(it.value)}
              </text>
              <rect data-hit="bar" x={0} y={cy - ROW / 2} width={width} height={ROW} fill="transparent"
                tabIndex={0} aria-label={`${it.label}: ${fmt(it)}`} style={hitStyle}
                onPointerEnter={() => setActive({ i, focus: false })} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive({ i, focus: true })} onBlur={() => setActive(null)} />
            </g>
          );
        })}
        {reference && (
          <g data-mark="reference" aria-hidden="true" pointerEvents="none">
            <line x1={x(reference.value)} x2={x(reference.value)} y1={top - 6} y2={top + plotH} stroke="var(--text-3)" strokeWidth={1} />
            <text x={x(reference.value)} y={top - 10} textAnchor={x(reference.value) > right - 60 ? "end" : "middle"}
              fill="var(--text-2)" fontSize={FONT.tick}>
              {reference.label}
            </text>
          </g>
        )}
      </svg>
      {active && items[active.i] && (
        <Tooltip
          placement="right"
          x={tipOf(items[active.i]) + 6 + textWidth(items[active.i].value == null ? "—" : format(items[active.i].value as number), FONT.tick)}
          y={top + active.i * ROW + ROW / 2}
          containerWidth={width}
          title={items[active.i].label}
          rows={[{ value: fmt(items[active.i]), label: betterHint(better), color: items[active.i].color }]}
        />
      )}
      <SrTable
        caption={`${ariaLabel} (${betterHint(better)})`}
        head={["Item", "Value", ...(items.some((it) => it.err != null) ? ["±"] : [])]}
        rows={items.map((it) => [
          it.label,
          it.value == null ? "—" : format(it.value),
          ...(items.some((d) => d.err != null) ? [it.err == null ? "—" : format(it.err)] : []),
        ])}
      />
    </ChartFrame>
  );
}

/** Category label; shortened with an ellipsis when it cannot fit, full text kept in <title>. */
function ItemLabel({ text, maxPx, x, y }: { text: string; maxPx: number; x: number; y: number }) {
  const shown = fitText(text, maxPx, FONT.label);
  return (
    <text x={x} y={y} dy="0.35em" textAnchor="end" fill="var(--text-1)" fontSize={FONT.label}>
      {shown !== text && <title>{text}</title>}
      {shown}
    </text>
  );
}

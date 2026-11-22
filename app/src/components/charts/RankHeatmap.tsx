import { useState, type KeyboardEvent } from "react";
import { ChartFrame, SrTable, hitStyle, svgProps } from "./parts";
import { Tooltip } from "./Tooltip";
import { useWidth } from "./useWidth";
import { FONT, TICK_STYLE, fitText, textWidth } from "./scale";

export interface HeatmapRow {
  label: string;
  ranks: (number | null)[];
  avg: number;
  winner?: boolean;
}

export interface RankHeatmapProps {
  columns: string[];
  rows: HeatmapRow[];
  /** Optional override; a descriptive default is generated. */
  ariaLabel?: string;
}

/** Sequential single-hue blue, darkest = rank 1 (best) → lightest = worst. Same in both themes. */
export const RANK_RAMP = ["#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6"];
const INK_DARK = "#1a1a19";
const INK_LIGHT = "#ffffff";

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** White or near-black, whichever contrasts more with the fill. */
export function inkFor(fill: string) {
  const l = luminance(fill);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminance(INK_DARK) + 0.05) ? INK_LIGHT : INK_DARK;
}

const CELL_H = 32;
const GAP = 2;
const AVG_W = 64;
const PILL_W = 50;

export function RankHeatmap({ columns, rows, ariaLabel }: RankHeatmapProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<{ r: number; c: number; focus: boolean } | null>(null);
  const [cursor, setCursor] = useState({ r: 0, c: 0 });

  const maxRank = Math.max(rows.length, ...rows.flatMap((r) => r.ranks.filter((v): v is number => v != null)));
  const fillFor = (rank: number) => RANK_RAMP[Math.round(((rank - 1) / Math.max(1, maxRank - 1)) * (RANK_RAMP.length - 1))];
  const labelW = Math.min(width * 0.4, Math.max(...rows.map((r) => textWidth(r.label, FONT.label) + (r.winner ? PILL_W + 8 : 0)), 40) + 14);
  const cellW = Math.max(28, Math.min(96, (width - labelW - AVG_W) / Math.max(1, columns.length)));
  const rotate = columns.some((c) => textWidth(c, FONT.tick) > cellW - 6);
  const headH = rotate ? Math.max(...columns.map((c) => textWidth(c, FONT.tick))) * 0.65 + 18 : 26;
  const gridW = labelW + cellW * columns.length + AVG_W;
  const height = headH + rows.length * CELL_H + 4;
  const name = ariaLabel ?? `Rank heatmap: ${rows.length} rows by ${columns.length} columns, rank 1 is best`;

  const move = (e: KeyboardEvent, r: number, c: number) => {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const step = d[e.key];
    if (!step) return;
    e.preventDefault();
    const next = { r: Math.min(rows.length - 1, Math.max(0, r + step[0])), c: Math.min(columns.length - 1, Math.max(0, c + step[1])) };
    setCursor(next);
    ref.current?.querySelector<SVGElement>(`[data-hit="cell"][data-row="${next.r}"][data-col="${next.c}"]`)?.focus();
  };

  const cur = active ? { row: rows[active.r], rank: rows[active.r]?.ranks[active.c] } : null;

  return (
    <ChartFrame frameRef={ref}>
      <svg {...svgProps(Math.max(width, gridW), height, name)}>
        <rect width={Math.max(width, gridW)} height={height} fill="var(--chart-surface)" />
        <g aria-hidden="true">
          <text x={0} y={headH - 9} fill="var(--text-3)" fontSize={FONT.tick}>rank · 1 = best</text>
          {columns.map((col, c) => {
            const cx = labelW + c * cellW + cellW / 2;
            return rotate ? (
              <text key={col} transform={`translate(${cx - 4},${headH - 8}) rotate(-40)`} fill="var(--text-2)" fontSize={FONT.tick}>{col}</text>
            ) : (
              <text key={col} x={cx} y={headH - 9} textAnchor="middle" fill="var(--text-2)" fontSize={FONT.tick}>{col}</text>
            );
          })}
          <text x={labelW + columns.length * cellW + AVG_W / 2} y={headH - 9} textAnchor="middle" fill="var(--text-2)" fontSize={FONT.tick}>avg rank</text>
        </g>
        {rows.map((row, r) => {
          const y0 = headH + r * CELL_H;
          const cy = y0 + CELL_H / 2;
          return (
            <g key={row.label} data-winner={row.winner ? "true" : undefined}>
              <text x={0} y={cy} dy="0.35em" fill="var(--text-1)" fontSize={FONT.label} fontWeight={row.winner ? 600 : 400}>
                {fitText(row.label, labelW - 12 - (row.winner ? PILL_W + 8 : 0), FONT.label)}
              </text>
              {row.winner && (
                <g transform={`translate(${Math.min(textWidth(row.label, FONT.label) + 8, labelW - PILL_W - 10)},${cy - 9})`}>
                  <rect width={PILL_W} height={18} rx={9} fill="none" stroke="var(--accent)" strokeWidth={1} />
                  <text x={PILL_W / 2} y={9} dy="0.35em" textAnchor="middle" fill="var(--text-1)" fontSize={11}>winner</text>
                </g>
              )}
              {columns.map((col, c) => {
                const rank = row.ranks[c] ?? null;
                const x0 = labelW + c * cellW;
                const fill = rank == null ? "var(--grid)" : fillFor(rank);
                const on = active?.r === r && active.c === c;
                return (
                  <g key={col}>
                    <rect data-mark={rank == null ? "empty" : "cell"} data-rank={rank ?? undefined} x={x0 + GAP / 2} y={y0 + GAP / 2}
                      width={cellW - GAP} height={CELL_H - GAP} rx={3} fill={fill} opacity={active && !on ? 0.8 : 1} />
                    <text x={x0 + cellW / 2} y={cy} dy="0.35em" textAnchor="middle" pointerEvents="none"
                      fill={rank == null ? "var(--text-3)" : inkFor(fill)} style={{ ...TICK_STYLE, fontWeight: 600 }}>
                      {rank == null ? "—" : rank}
                    </text>
                    <rect data-hit="cell" data-row={r} data-col={c} x={x0} y={y0} width={cellW} height={CELL_H} rx={4}
                      fill="transparent" stroke={on && active.focus ? "var(--accent)" : "none"} strokeWidth={2}
                      tabIndex={cursor.r === r && cursor.c === c ? 0 : -1} style={hitStyle}
                      aria-label={`${row.label}, ${col}: ${rank == null ? "no rank" : `rank ${rank} of ${maxRank}`}`}
                      onPointerEnter={() => setActive({ r, c, focus: false })} onPointerLeave={() => setActive(null)}
                      onFocus={() => { setActive({ r, c, focus: true }); setCursor({ r, c }); }} onBlur={() => setActive(null)}
                      onKeyDown={(e) => move(e, r, c)} />
                  </g>
                );
              })}
              <text x={labelW + columns.length * cellW + AVG_W / 2} y={cy} dy="0.35em" textAnchor="middle" fill="var(--text-1)" style={TICK_STYLE}>
                {row.avg.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
      {active && cur?.row && (
        <Tooltip x={labelW + active.c * cellW + cellW / 2} y={headH + active.r * CELL_H} containerWidth={width} title={cur.row.label}
          rows={[{ value: cur.rank == null ? "No rank" : `Rank ${cur.rank} of ${maxRank}`, label: columns[active.c] }]} />
      )}
      <SrTable
        caption={`${name}`}
        head={["Row", ...columns, "Avg rank"]}
        rows={rows.map((r) => [r.winner ? `${r.label} (winner)` : r.label, ...columns.map((_, c) => (r.ranks[c] == null ? "—" : String(r.ranks[c]))), r.avg.toFixed(2)])}
      />
    </ChartFrame>
  );
}

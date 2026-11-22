import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RankHeatmap } from "../../src/components/charts";

const columns = ["FID", "IS", "CLIP"];
const rows = [
  { label: "SD tuned", ranks: [1, 2, 1], avg: 1.33, winner: true },
  { label: "SD baseline", ranks: [2, 1, 3], avg: 2 },
  { label: "aMUSEd", ranks: [3, null, 2], avg: 2.5 },
];

function setup() {
  const utils = render(<RankHeatmap columns={columns} rows={rows} />);
  return { ...utils, svg: screen.getByRole("img") };
}

afterEach(cleanup);

describe("RankHeatmap", () => {
  it("has an accessible name", () => {
    const { svg } = setup();
    expect(svg).toHaveAttribute("aria-label");
    expect(svg.getAttribute("aria-label")).not.toBe("");
  });

  it("renders a cell with its rank inside for every value", () => {
    const { container } = setup();
    const cells = container.querySelectorAll('[data-mark="cell"]');
    expect(cells).toHaveLength(8);
    const svg = screen.getByRole("img");
    expect(within(svg).getByText("—")).toBeInTheDocument();
  });

  it("colours rank 1 darkest and the worst rank lightest", () => {
    const { container } = setup();
    const fills = (rank: string) =>
      [...container.querySelectorAll(`[data-mark="cell"][data-rank="${rank}"]`)].map((c) => c.getAttribute("fill"));
    expect(new Set(fills("1"))).toEqual(new Set(["#1c5cab"]));
    expect(new Set(fills("3"))).toEqual(new Set(["#b7d3f6"]));
  });

  it("marks the winner row with a text pill", () => {
    const { container, svg } = setup();
    const winner = container.querySelector('[data-winner="true"]');
    expect(winner).not.toBeNull();
    expect(within(winner as HTMLElement).getByText("winner")).toBeInTheDocument();
    expect(within(winner as HTMLElement).getByText("SD tuned")).toBeInTheDocument();
    expect(within(svg).getAllByText("winner")).toHaveLength(1);
  });

  it("shows a tooltip naming row and column on focus", () => {
    const { container } = setup();
    const cell = container.querySelector<SVGElement>('[data-hit="cell"][data-row="1"][data-col="2"]');
    fireEvent.focus(cell!);
    const tip = screen.getByTestId("chart-tooltip");
    expect(tip).toHaveTextContent("Rank 3");
    expect(tip).toHaveTextContent("SD baseline");
    expect(tip).toHaveTextContent("CLIP");
  });

  it("carries the data in a visually hidden table", () => {
    setup();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(rows.length + 1);
    expect(within(table).getByText("SD tuned (winner)")).toBeInTheDocument();
  });
});

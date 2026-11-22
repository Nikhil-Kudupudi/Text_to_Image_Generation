import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ScatterChart } from "../../src/components/charts";

const points = [
  { key: "sd", label: "SD baseline", x: 4.1, y: 0.31, size: 860, color: "var(--series-1)" },
  { key: "ldm", label: "LDM BERT", x: 9.8, y: 0.26, size: 1450, color: "var(--series-4)" },
  { key: "amused", label: "aMUSEd", x: 1.2, y: 0.28, size: 300, color: "var(--series-5)" },
];

function setup() {
  const utils = render(
    <ScatterChart
      points={points}
      xLabel="Seconds per image"
      yLabel="CLIP score"
      sizeLabel="Parameters (M)"
      ariaLabel="Speed vs quality"
    />,
  );
  return { ...utils, svg: screen.getByRole("img", { name: "Speed vs quality" }) };
}

afterEach(cleanup);

describe("ScatterChart", () => {
  it("renders a dot and a direct label for every point", () => {
    const { container, svg } = setup();
    expect(container.querySelectorAll('[data-mark="dot"]')).toHaveLength(points.length);
    for (const p of points) expect(within(svg).getByText(p.label)).toBeInTheDocument();
  });

  it("scales dot size between 8px and 20px diameter", () => {
    const { container } = setup();
    const radii = [...container.querySelectorAll('[data-mark="dot"]')].map((c) => Number(c.getAttribute("r")));
    expect(Math.min(...radii)).toBe(4);
    expect(Math.max(...radii)).toBe(10);
  });

  it("titles both axes and names the size encoding", () => {
    const { svg } = setup();
    expect(within(svg).getByText("Seconds per image")).toBeInTheDocument();
    expect(within(svg).getByText("CLIP score")).toBeInTheDocument();
    expect(within(svg).getByText(/Parameters \(M\)/)).toBeInTheDocument();
  });

  it("shows a tooltip on hover", async () => {
    const user = userEvent.setup();
    const { container } = setup();
    const hits = container.querySelectorAll<SVGElement>('[data-hit="dot"]');
    await user.hover(hits[1]);
    const tip = await screen.findByTestId("chart-tooltip");
    expect(tip).toHaveTextContent("LDM BERT");
    expect(tip).toHaveTextContent("9.8");
  });

  it("carries the data in a visually hidden table", () => {
    setup();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(points.length + 1);
  });
});

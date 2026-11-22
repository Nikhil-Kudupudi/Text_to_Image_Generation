import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LineChart, type LinePoint } from "../../src/components/charts";

const points: LinePoint[] = [
  { x: 1, y: 30.2 },
  { x: 3, y: 24.1, err: 0.8 },
  { x: 5, y: 22.7 },
  { x: 7.5, y: 23.9 },
  { x: 10, y: 26.4 },
];

function setup(pts = points) {
  const utils = render(
    <LineChart points={pts} xLabel="Guidance scale" yLabel="FID" better="lower" ariaLabel="FID vs guidance" />,
  );
  return { ...utils, svg: screen.getByRole("img", { name: "FID vs guidance" }) };
}

afterEach(cleanup);

describe("LineChart", () => {
  it("renders one marker per point and a single line", () => {
    const { container } = setup();
    expect(container.querySelectorAll('[data-mark="point"]')).toHaveLength(points.length);
    expect(container.querySelectorAll('[data-mark="line"]')).toHaveLength(1);
  });

  it("breaks the line at null values", () => {
    const pts = [...points.slice(0, 2), { x: 5, y: null }, ...points.slice(3)];
    const { container } = setup(pts);
    expect(container.querySelectorAll('[data-mark="point"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-mark="line"]')).toHaveLength(2);
  });

  it("draws error whiskers where err is given", () => {
    const { container } = setup();
    expect(container.querySelectorAll('[data-mark="err"]')).toHaveLength(1);
  });

  it("titles the axes with the better hint", () => {
    const { svg } = setup();
    expect(within(svg).getByText("Guidance scale")).toBeInTheDocument();
    expect(within(svg).getByText(/FID/)).toBeInTheDocument();
    expect(within(svg).getByText(/lower is better/)).toBeInTheDocument();
  });

  it("shows a tooltip with the point's values on hover and focus", async () => {
    const user = userEvent.setup();
    const { container } = setup();
    const hits = container.querySelectorAll<SVGElement>('[data-hit="point"]');
    expect(hits).toHaveLength(points.length);
    await user.hover(hits[1]);
    const tip = await screen.findByTestId("chart-tooltip");
    expect(tip).toHaveTextContent("24.1");
    expect(tip).toHaveTextContent("Guidance scale 3");
    expect(container.querySelector('[data-mark="crosshair"]')).not.toBeNull();
    fireEvent.pointerLeave(hits[1]);
    fireEvent.focus(hits[4]);
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("26.4");
  });

  it("carries the data in a visually hidden table", () => {
    setup();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(points.length + 1);
  });
});

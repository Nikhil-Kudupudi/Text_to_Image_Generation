import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { BarChart } from "../../src/components/charts";

const items = [
  { key: "a", label: "SD baseline", value: 21.4, err: 1.2, color: "var(--series-1)" },
  { key: "b", label: "LDM BERT", value: null, color: "var(--series-4)" },
  { key: "c", label: "aMUSEd", value: 35.9, color: "var(--series-5)" },
];

function setup(extra: Partial<Parameters<typeof BarChart>[0]> = {}) {
  const utils = render(
    <BarChart items={items} better="lower" ariaLabel="FID by model" format={(v) => v.toFixed(1)} {...extra} />,
  );
  const svg = screen.getByRole("img", { name: "FID by model" });
  return { ...utils, svg };
}

afterEach(cleanup);

describe("BarChart", () => {
  it("renders one bar per non-null item and a dash for null", () => {
    const { container, svg } = setup();
    expect(container.querySelectorAll('[data-mark="bar"]')).toHaveLength(2);
    expect(within(svg).getByText("—")).toBeInTheDocument();
    expect(within(svg).getByText("21.4")).toBeInTheDocument();
    expect(within(svg).getByText("35.9")).toBeInTheDocument();
  });

  it("labels every item and shows the better hint", () => {
    const { svg } = setup();
    for (const it of items) expect(within(svg).getByText(it.label)).toBeInTheDocument();
    expect(within(svg).getByText(/lower is better/)).toBeInTheDocument();
  });

  it("draws error whiskers only where err is given", () => {
    const { container } = setup();
    expect(container.querySelectorAll('[data-mark="err"]')).toHaveLength(1);
  });

  it("renders a reference line when given", () => {
    const { container, svg } = setup({ reference: { value: 25, label: "Real photos" } });
    expect(container.querySelector('[data-mark="reference"]')).not.toBeNull();
    expect(within(svg).getByText("Real photos")).toBeInTheDocument();
  });

  it("has no reference line by default", () => {
    const { container } = setup();
    expect(container.querySelector('[data-mark="reference"]')).toBeNull();
  });

  it("carries the data in a visually hidden table", () => {
    setup();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(items.length + 1);
    expect(within(table).getByText("LDM BERT")).toBeInTheDocument();
  });

  it("shows a tooltip on hover and on keyboard focus", async () => {
    const user = userEvent.setup();
    const { container } = setup();
    const hits = container.querySelectorAll<SVGElement>('[data-hit="bar"]');
    expect(hits).toHaveLength(items.length);
    await user.hover(hits[2]);
    const tip = await screen.findByTestId("chart-tooltip");
    expect(tip).toHaveTextContent("aMUSEd");
    expect(tip).toHaveTextContent("35.9");
    fireEvent.pointerLeave(hits[2]);
    expect(screen.queryByTestId("chart-tooltip")).toBeNull();
    fireEvent.focus(hits[0]);
    expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("21.4 ± 1.2");
  });
});

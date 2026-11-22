import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ResultsPage from "../../src/pages/Results";
import { ResultsContext } from "../../src/lib/ManifestContext";
import { fixtureManifest } from "../fixtures/manifest";
import type { Manifest } from "../../src/types";

function renderPage(data: Manifest | null) {
  return render(
    <ResultsContext.Provider value={{ data, error: null, loading: false, reload() {} }}>
      <ResultsPage />
    </ResultsContext.Provider>,
  );
}

const smoke = () => fixtureManifest({ size: "smoke" });
const section = (id: string) => document.getElementById(id) as HTMLElement;
const marks = (el: Element, mark: string) => el.parentElement!.querySelectorAll(`[data-mark="${mark}"]`);
const bodyRows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);

describe("Results page: sub-nav", () => {
  it("has four anchors in order and highlights the clicked one without changing the route", () => {
    renderPage(smoke());
    const nav = screen.getByRole("navigation", { name: "Results sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Settings", "Performance", "Plots", "Metrics"]);
    expect(links[0]).toHaveAttribute("aria-current", "true");
    window.location.hash = "#/results";
    fireEvent.click(links[3]);
    expect(links[3]).toHaveAttribute("aria-current", "true");
    expect(links[0]).not.toHaveAttribute("aria-current");
    expect(window.location.hash).toBe("#/results");
    for (const id of ["settings", "performance", "plots", "metrics"]) expect(section(id)).not.toBeNull();
  });

  it("puts the sections in order with metrics last", () => {
    renderPage(smoke());
    const ids = Array.from(document.querySelectorAll("section.section")).map((s) => s.id);
    expect(ids).toEqual(["settings", "performance", "plots", "metrics"]);
  });
});

describe("Results page: settings", () => {
  it("has one table row per m3 model with its render settings", () => {
    const data = smoke();
    renderPage(data);
    const table = screen.getByRole("table", { name: "Render settings" });
    const rows = bodyRows(table);
    expect(rows).toHaveLength(data.m3!.models.length);
    const tuned = within(rows[1]);
    for (const text of ["SD tuned", "euler_a", "30", "7.5", "512", "2.9 s", "2.6 GB"]) {
      expect(tuned.getAllByText(text).length).toBeGreaterThan(0);
    }
  });

  it("draws the earlier sweep by axis: guidance as a line, sampler as bars with seconds", () => {
    renderPage(smoke());
    const line = screen.getByRole("img", { name: "Earlier sweep: CLIP vs guidance" });
    expect(marks(line, "point")).toHaveLength(5);
    expect(marks(line, "reference")).toHaveLength(1);
    expect(marks(line, "reference")[0]).toHaveTextContent("real photos 0.320");
    const bars = screen.getByRole("img", { name: "Earlier sweep: CLIP by sampler" });
    expect(marks(bars, "bar")).toHaveLength(6);
    expect(marks(bars, "reference")).toHaveLength(1);
    expect(within(bars).getByText("real photos")).toBeInTheDocument();
    // seconds travel with the label into the tooltip and the table: euler_a is row 3 -> 49 s
    expect(within(bars).getByLabelText(/^euler_a 30 · 49 s:/)).toBeInTheDocument();
  });

  it("opens a sweep row's 10-image grid in the lightbox", () => {
    renderPage(smoke());
    fireEvent.click(screen.getByRole("button", { name: /grid: pndm_s50_g1_leading$/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img").getAttribute("src")).toContain("m2/sweep/pndm_s50_g1_leading/grid.png");
  });

  it("shows empty states when m3 or m2 is missing", () => {
    renderPage({ ...smoke(), m3: null });
    expect(within(section("settings")).queryByRole("table", { name: "Render settings" })).toBeNull();
    expect(within(section("settings")).getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Earlier sweep: CLIP vs guidance" })).toBeInTheDocument();
  });

  it("shows an empty sweep state without m2", () => {
    renderPage({ ...smoke(), m2: null });
    expect(screen.getByRole("table", { name: "Render settings" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Earlier sweep/ })).toBeNull();
    expect(within(section("settings")).getAllByRole("status")).toHaveLength(1);
  });
});

describe("Results page: performance", () => {
  it("has FID / IS / CLIP bars for the models group with error bars on IS and CLIP", () => {
    renderPage(smoke());
    const fid = screen.getByRole("img", { name: "FID by model" });
    const is = screen.getByRole("img", { name: "IS by model" });
    const clip = screen.getByRole("img", { name: "CLIP by model" });
    expect(marks(fid, "bar")).toHaveLength(5);
    expect(marks(fid, "err")).toHaveLength(0);
    expect(marks(is, "err")).toHaveLength(5);
    expect(marks(clip, "err")).toHaveLength(5);
    expect(within(fid).getByText(/lower is better/)).toBeInTheDocument();
  });

  it("has three guidance line charts and a FID vs CLIP scatter", () => {
    renderPage(fixtureManifest({ size: "full" }));
    for (const m of ["FID", "IS", "CLIP"]) {
      const chart = screen.getByRole("img", { name: `${m} vs guidance` });
      expect(marks(chart, "point")).toHaveLength(6);
    }
    const scatter = screen.getByRole("img", { name: "FID vs CLIP" });
    expect(marks(scatter, "dot")).toHaveLength(5);
    expect(within(scatter).getByText("SD tuned")).toBeInTheDocument();
    expect(screen.getByText("FID compares within equal N")).toBeInTheDocument();
  });

  it("renders an empty state when there are no metrics (partial)", () => {
    renderPage(fixtureManifest({ size: "smoke", partial: true }));
    const perf = section("performance");
    expect(within(perf).queryByRole("img")).toBeNull();
    expect(within(perf).getByRole("status")).toBeInTheDocument();
  });
});

describe("Results page: plots", () => {
  it("lists m3 plots then m2 plots and opens the lightbox", () => {
    renderPage(smoke());
    const gallery = section("plots");
    const buttons = within(gallery).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "FID IS bars", "CLIP alignment", "Ranking", "Guidance sensitivity", "Guidance",
    ]);
    fireEvent.click(buttons[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img").getAttribute("src")).toContain("m3/plots/m3_fid_is_bars.png");
    expect(within(dialog).getByText("FID IS bars")).toBeInTheDocument();
  });

  it("shows only m2 plots when m3 is missing", () => {
    renderPage({ ...smoke(), m3: null });
    const buttons = within(section("plots")).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Guidance"]);
  });
});

describe("Results page: metrics", () => {
  it("sorts the metrics table by a column, marks the best values and dashes nulls", () => {
    const data = smoke();
    data.m3!.metrics[4] = { ...data.m3!.metrics[4], IS_mean: null, IS_std: null };
    renderPage(data);
    const table = screen.getByRole("table", { name: "Metrics" });
    const first = () => bodyRows(table)[0].querySelector("th, td")!.textContent;
    expect(bodyRows(table)).toHaveLength(data.m3!.metrics.length);
    expect(first()).toBe("SD baseline");

    const fidHead = within(table).getByRole("button", { name: "FID" });
    fireEvent.click(fidHead);
    expect(fidHead.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(first()).toBe("SD baseline");
    fireEvent.click(fidHead);
    expect(fidHead.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(first()).toBe("g = 1");

    const baseline = bodyRows(table).find((r) => r.textContent!.startsWith("SD baseline"))!;
    expect(baseline.querySelector('[data-col="FID"]')).toHaveAttribute("data-best", "true");
    const amused = bodyRows(table).find((r) => r.textContent!.startsWith("aMUSEd"))!;
    expect(amused.querySelector('[data-col="IS"]')!.textContent).toBe("—");
  });

  it("draws a ranking heatmap per question and ends with three winner cards", () => {
    renderPage(smoke());
    const metrics = section("metrics");
    const maps = ["models", "guidance", "embedding"].map((q) => screen.getByRole("img", { name: `Ranking: ${q}` }));
    for (const m of maps) expect(m.querySelectorAll('[data-winner="true"]')).toHaveLength(1);

    const cards = within(metrics).getAllByTestId("winner-card");
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual([
      "Best model", "Best guidance", "Best embedding",
    ]);
    expect(within(cards[0]).getByText("SD baseline")).toBeInTheDocument();
    expect(within(cards[1]).getByText("g = 7.5")).toBeInTheDocument();
    expect(within(cards[2]).getByText("SD tuned")).toBeInTheDocument();
    // the winner cards come after every heatmap
    const last = maps[maps.length - 1];
    expect(last.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(metrics.lastElementChild!.contains(cards[2])).toBe(true);
  });

  it("renders empty states for metrics and ranking on a partial manifest", () => {
    renderPage(fixtureManifest({ size: "smoke", partial: true }));
    const metrics = section("metrics");
    expect(within(metrics).queryByRole("table")).toBeNull();
    expect(within(metrics).queryAllByTestId("winner-card")).toHaveLength(0);
    expect(within(metrics).getAllByRole("status").length).toBeGreaterThanOrEqual(1);
  });
});

describe("Results page: missing data", () => {
  it("renders every section with an empty state when there is no manifest", () => {
    renderPage(null);
    for (const id of ["settings", "performance", "plots", "metrics"]) {
      expect(within(section(id)).getAllByRole("status").length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the full fixture without errors", () => {
    const data = fixtureManifest({ size: "full" });
    renderPage(data);
    expect(bodyRows(screen.getByRole("table", { name: "Metrics" }))).toHaveLength(data.m3!.metrics.length);
  });
});

describe("Results page: real-photo reference rows", () => {
  // The notebooks add a "real" row (real COCO photos) to each metrics group: FID null, IS/CLIP set.
  function withReal(): Manifest {
    const m = fixtureManifest({ size: "smoke" });
    const real = (group: "models" | "guidance", N: number, IS: number, CLIP: number) => ({
      config: "real", group, label: "real photos", N, FID: null, IS_mean: IS, IS_std: 0.5, CLIP_mean: CLIP,
      CLIP_std: 0.03, sec_per_image: null, resolution: 512, encoder: "", guidance: null,
    });
    // Higher than every model on IS and CLIP, so a contestant treatment would make it "best".
    m.m3!.metrics.push(real("models", 8, 9.9, 0.399), real("guidance", 4, 9.8, 0.398));
    return m;
  }

  it("is a reference line on bars and guidance lines, never a bar or a point", () => {
    renderPage(withReal());
    const clip = screen.getByRole("img", { name: "CLIP by model" });
    expect(marks(clip, "bar")).toHaveLength(5);
    expect(marks(clip, "reference")).toHaveLength(1);
    expect(marks(screen.getByRole("img", { name: "FID by model" }), "reference")).toHaveLength(0);
    const line = screen.getByRole("img", { name: "CLIP vs guidance" });
    expect(marks(line, "point")).toHaveLength(2);
    expect(marks(line, "reference")[0]).toHaveTextContent("real photos 0.398");
    expect(marks(screen.getByRole("img", { name: "FID vs CLIP" }), "dot")).toHaveLength(5);
  });

  it("is a reference row in the metrics table and never marked best", () => {
    renderPage(withReal());
    const table = document.querySelector(".metrics-table") as HTMLElement;
    const realRows = Array.from(table.querySelectorAll("tr.row-reference"));
    expect(realRows).toHaveLength(2);
    for (const r of realRows) expect(r.querySelector('[data-best="true"]')).toBeNull();
    // The best CLIP in the models group is still a model (0.330), not real photos (0.399).
    const best = table.querySelectorAll('td[data-col="CLIP"][data-best="true"]');
    expect(Array.from(best).map((td) => td.textContent)).toContain("0.330 ± 0.030 (best)");
  });
});

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import WorkflowPage from "../../src/pages/Workflow";
import { ResultsContext } from "../../src/lib/ManifestContext";
import { fixtureManifest } from "../fixtures/manifest";
import type { Manifest } from "../../src/types";

function renderPage(data: Manifest | null) {
  return render(
    <ResultsContext.Provider value={{ data, error: null, loading: false, reload() {} }}>
      <WorkflowPage />
    </ResultsContext.Provider>,
  );
}

describe("Workflow page", () => {
  it("lists the stages in order", () => {
    renderPage(fixtureManifest({ size: "smoke" }));
    const stages = screen.getAllByTestId("stage");
    const ids = stages.map((s) => s.getAttribute("data-stage"));
    expect(ids).toEqual(["coco", "preprocess", "sweep", "render-models", "render-guidance", "evaluation", "website"]);
    expect(within(stages[0]).getByText(/COCO/)).toBeInTheDocument();
    expect(within(stages[2]).getByText(/Euler-a 30 steps/i)).toBeInTheDocument();
  });

  it("shows the folder tree entries", () => {
    renderPage(null);
    for (const p of [
      "outputs/milestone_3/",
      "images/",
      "plots/",
      "tables/",
      "outputs/milestone_2/",
      "outputs/live/",
      "data/processed/images_512/",
    ]) {
      expect(screen.getAllByText(p, { exact: false }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("history.jsonl")).toBeInTheDocument();
  });

  it("shows live counts from the manifest", () => {
    renderPage(fixtureManifest({ size: "smoke" }));
    expect(screen.getByTestId("count-models")).toHaveTextContent("40 images");
    expect(screen.getByTestId("count-guidance")).toHaveTextContent("8 images");
    expect(screen.getByTestId("count-plots")).toHaveTextContent("4 plots");
  });

  it("shows an em dash when milestone 3 is missing", () => {
    const m = fixtureManifest({ size: "smoke" });
    renderPage({ ...m, m3: null });
    expect(screen.getByTestId("count-models")).toHaveTextContent("—");
    expect(screen.getByTestId("count-guidance")).toHaveTextContent("—");
    expect(screen.getByTestId("count-plots")).toHaveTextContent("—");
  });
});

describe("Workflow page: data-driven stage text", () => {
  it("describes the renders from the manifest (smoke run)", () => {
    renderPage(fixtureManifest({ size: "smoke" }));
    const stage = (id: string) => document.querySelector(`[data-stage="${id}"]`) as HTMLElement;
    expect(stage("render-models")).toHaveTextContent("8 prompts, 5 models");
    expect(stage("render-guidance")).toHaveTextContent("4 prompts, g = 1, 7.5");
    expect(screen.getByText("sweep_g7.5/")).toBeInTheDocument();
  });

  it("describes the renders from the manifest (full run)", () => {
    renderPage(fixtureManifest({ size: "full" }));
    const stage = (id: string) => document.querySelector(`[data-stage="${id}"]`) as HTMLElement;
    expect(stage("render-models")).toHaveTextContent("500 prompts, 5 models");
    expect(stage("render-guidance")).toHaveTextContent("200 prompts, g = 1…15");
  });
});

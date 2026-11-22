import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomePage from "../../src/pages/Home";
import { ResultsContext } from "../../src/lib/ManifestContext";
import type { Manifest } from "../../src/types";
import { fixtureManifest } from "../fixtures/manifest";

function renderHome(data: Manifest | null, loading = false) {
  return render(
    <ResultsContext.Provider value={{ data, error: null, loading, reload() {} }}>
      <HomePage />
    </ResultsContext.Provider>,
  );
}

const region = (name: string) => screen.getByRole("region", { name });
const statValue = (label: string) => {
  const tile = within(region("Overview")).getByText(label).closest(".stat");
  if (!(tile instanceof HTMLElement)) throw new Error(`no stat tile ${label}`);
  return tile;
};

describe("Models page — smoke", () => {
  it("shows the heading and meta", () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    expect(screen.getByRole("heading", { level: 1, name: "Models" })).toBeInTheDocument();
    expect(screen.getByText("5 models · 8 prompts")).toBeInTheDocument();
  });

  it("stat tiles take the winner from ranking (question models, overall_rank 1)", () => {
    const data = fixtureManifest({ size: "smoke" });
    // make sd_tuned the winner so the tile can't just be the first model
    for (const r of data.m3!.ranking) {
      if (r.question !== "models") continue;
      if (r.config === "sd_tuned") r.overall_rank = 1;
      else if (r.config === "sd_baseline") r.overall_rank = 2;
    }
    renderHome(data);
    expect(within(statValue("Winner")).getByText("SD tuned")).toBeInTheDocument();
    expect(within(statValue("Best CLIP")).getByText("0.330")).toBeInTheDocument();
    expect(within(statValue("Best FID")).getByText("360.0")).toBeInTheDocument();
    expect(within(statValue("Fastest")).getByText("2.5 s")).toBeInTheDocument();
  });

  it("renders one card per m3.models with sampler, steps and resolution", () => {
    const data = fixtureManifest({ size: "smoke" });
    renderHome(data);
    const cards = within(region("Configs")).getAllByRole("button");
    expect(cards).toHaveLength(data.m3!.models.length);
    expect(within(cards[0]).getByText("SD baseline")).toBeInTheDocument();
    expect(within(cards[0]).getByText("pndm · 50 steps · 512 px")).toBeInTheDocument();
    expect(within(cards[0]).getByText("0.330")).toBeInTheDocument(); // CLIP
    expect(within(cards[0]).getByText("360.0")).toBeInTheDocument(); // FID
    expect(within(cards[0]).getByText("2.5 s")).toBeInTheDocument(); // s/img
  });

  it("compare strip shows the real photo plus one tile per model with per-image CLIP", async () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    const compare = region("Compare");
    expect(within(compare).getByText("a cat number 0")).toBeInTheDocument();
    const tiles = within(compare).getAllByTestId("compare-tile");
    expect(tiles).toHaveLength(6);
    expect(within(tiles[0]).getByRole("button", { name: "Real photo" })).toBeInTheDocument();
    expect(within(tiles[1]).getByRole("button", { name: "SD baseline" })).toBeInTheDocument();
    // clip[sd_baseline][0] = 0.3, clip[sd_tuned][0] = 0.315
    expect(within(tiles[1]).getByText("0.300")).toBeInTheDocument();
    expect(within(tiles[2]).getByText("0.315")).toBeInTheDocument();
    const img = within(tiles[2]).getByRole("img", { name: "SD tuned" });
    expect(img.getAttribute("src")).toContain("m3/images/sd_tuned/000.png");

    await userEvent.click(within(compare).getByRole("button", { name: "Next prompt" }));
    expect(within(compare).getByText("a dog number 1")).toBeInTheDocument();
    expect(within(compare).getByText("2 / 8")).toBeInTheDocument();
    // clip[sd_baseline][1] = 0.335
    expect(within(within(compare).getAllByTestId("compare-tile")[1]).getByText("0.335")).toBeInTheDocument();
  });

  it("prompt search filters captions", async () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    const compare = region("Compare");
    await userEvent.type(within(compare).getByRole("searchbox", { name: "Search prompts" }), "pizza");
    expect(within(compare).getByText("a pizza number 3")).toBeInTheDocument();
    expect(within(compare).getByText("1 / 1")).toBeInTheDocument();
    await userEvent.clear(within(compare).getByRole("searchbox", { name: "Search prompts" }));
    await userEvent.type(within(compare).getByRole("searchbox", { name: "Search prompts" }), "zebra");
    expect(within(compare).getByText("0 / 0")).toBeInTheDocument();
    expect(within(compare).queryAllByTestId("compare-tile")).toHaveLength(0);
  });

  it("switching to guidance shows one tile per m3.sweep", async () => {
    const data = fixtureManifest({ size: "smoke" });
    renderHome(data);
    const compare = region("Compare");
    await userEvent.click(within(compare).getByRole("button", { name: "Guidance" }));
    const tiles = within(compare).getAllByTestId("compare-tile");
    expect(tiles).toHaveLength(1 + data.m3!.sweep.length);
    expect(within(tiles[1]).getByText("g = 1")).toBeInTheDocument();
    expect(within(tiles[2]).getByText("g = 7.5")).toBeInTheDocument();
    expect(within(compare).getByText("1 / 4")).toBeInTheDocument();
  });

  it("clicking a compare tile opens the lightbox over that row", async () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    const compare = region("Compare");
    await userEvent.click(within(compare).getByRole("button", { name: "SD tuned" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("a cat number 0")).toBeInTheDocument();
    expect(within(dialog).getByText("3 / 6")).toBeInTheDocument();
    expect(within(dialog).getByText(/SD tuned · CLIP 0\.315/)).toBeInTheDocument();
  });

  it("clicking a model card selects it for browse", async () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    const cards = within(region("Configs")).getAllByRole("button");
    await userEvent.click(cards[1]);
    const browse = region("Browse");
    const imgs = within(browse).getAllByRole("img");
    expect(imgs).toHaveLength(8);
    expect(imgs[0].getAttribute("src")).toContain("m3/images/sd_tuned/000.png");
    expect(within(browse).getByRole("button", { name: "Tuned" })).toHaveAttribute("aria-pressed", "true");
  });

  it("browse thumbs open a lightbox with prompt and CLIP", async () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    const browse = region("Browse");
    await userEvent.click(within(browse).getByRole("button", { name: "a dog number 1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("a dog number 1")).toBeInTheDocument();
    expect(within(dialog).getByText(/CLIP 0\.335/)).toBeInTheDocument();
  });

  it("a broken image becomes an empty frame", () => {
    renderHome(fixtureManifest({ size: "smoke" }));
    const tile = within(region("Compare")).getAllByTestId("compare-tile")[1];
    fireEvent.error(within(tile).getByRole("img", { name: "SD baseline" }));
    expect(tile.querySelector(".thumb-empty")).not.toBeNull();
  });
});

describe("Models page — full", () => {
  it("browse grid pages 48 thumbs", async () => {
    renderHome(fixtureManifest({ size: "full" }));
    const browse = region("Browse");
    expect(within(browse).getAllByRole("img")).toHaveLength(48);
    expect(within(browse).getByText("1 / 11")).toBeInTheDocument();
    await userEvent.click(within(browse).getByRole("button", { name: "Next page" }));
    expect(within(browse).getByText("2 / 11")).toBeInTheDocument();
    expect(within(browse).getAllByRole("img")[0]).toHaveAttribute("alt", "a cat number 48");
    for (let i = 0; i < 9; i++) await userEvent.click(within(browse).getByRole("button", { name: "Next page" }));
    expect(within(browse).getByText("11 / 11")).toBeInTheDocument();
    expect(within(browse).getAllByRole("img")).toHaveLength(20);
  });

  it("guidance compare shows all six sweep values", async () => {
    renderHome(fixtureManifest({ size: "full" }));
    const compare = region("Compare");
    await userEvent.click(within(compare).getByRole("button", { name: "Guidance" }));
    expect(within(compare).getAllByTestId("compare-tile")).toHaveLength(7);
    expect(screen.getByText("5 models · 500 prompts")).toBeInTheDocument();
  });
});

describe("Models page — partial", () => {
  it("shows dashes for unknown stats and empty frames for missing images", async () => {
    renderHome(fixtureManifest({ size: "smoke", partial: true }));
    expect(within(statValue("Winner")).getByText("—")).toBeInTheDocument();
    expect(within(statValue("Best CLIP")).getByText("—")).toBeInTheDocument();
    expect(within(statValue("Best FID")).getByText("—")).toBeInTheDocument();
    expect(within(statValue("Fastest")).getByText("2.5 s")).toBeInTheDocument(); // from the generation log

    // ldm_bert has 4 of 8 images: prompt 5 has no image
    const compare = region("Compare");
    const next = within(compare).getByRole("button", { name: "Next prompt" });
    for (let i = 0; i < 5; i++) await userEvent.click(next);
    expect(within(compare).getByText("a kite number 5")).toBeInTheDocument();
    expect(within(compare).getByRole("img", { name: "LDM-BERT (missing)" })).toBeInTheDocument();
    expect(within(compare).queryByText(/^0\.\d{3}$/)).toBeNull(); // no per-image CLIP in a partial run
  });
});

describe("Models page — no data", () => {
  it("m3: null renders an EmptyState", () => {
    const data = fixtureManifest({ size: "smoke" });
    data.m3 = null;
    renderHome(data);
    expect(screen.getByRole("status")).toHaveTextContent("No results");
  });

  it("no manifest at all does not throw", () => {
    renderHome(null);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows loading while the manifest loads", () => {
    renderHome(null, true);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });
});

describe("Models page — images without prompt tables", () => {
  it("browses and compares the images by index when m3_prompts*.csv are missing", () => {
    const data = fixtureManifest({ size: "smoke", partial: true });
    data.m3!.prompts = [];
    data.m3!.promptsGuidance = [];
    renderHome(data);
    expect(screen.getByText("5 models · 8 prompts")).toBeInTheDocument();
    // compare: real photo frame empty (no photo known), one tile per model
    const tiles = screen.getAllByTestId("compare-tile");
    expect(tiles).toHaveLength(6);
    expect(within(tiles[0]).getByRole("img", { name: "Real photo (missing)" })).toBeInTheDocument();
    expect(within(tiles[1]).getByRole("button", { name: "SD baseline" })).toBeInTheDocument();
    // browse: thumbs labelled by index
    expect(within(region("Browse")).getByRole("button", { name: "#0" })).toBeInTheDocument();
  });
});

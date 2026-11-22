// Whole-app integration: <App/> with a mocked fetch serving the manifest (smoke, full, partial, empty,
// unreachable) and an offline /api backend. Every route must render its heading and never log an error.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../src/App";
import { fixtureManifest } from "../fixtures/manifest";
import type { Manifest } from "../../src/types";

type ManifestReply = Manifest | { status: number };

let manifestReply: ManifestReply;
let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: MockInstance;

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, statusText: "", json: async () => body } as unknown as Response;
}

beforeEach(() => {
  window.location.hash = "";
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("results/manifest.json")) {
      return "status" in manifestReply ? response(manifestReply.status, {}) : response(200, manifestReply);
    }
    if (url.startsWith("/api/")) throw new TypeError("Failed to fetch"); // backend not running
    throw new TypeError(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("scrollTo", vi.fn()); // jsdom does not implement it and reports that via console.error
  errorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  vi.unstubAllGlobals();
  errorSpy.mockRestore();
  window.location.hash = "";
});

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const heading = (name: string) => screen.findByRole("heading", { level: 1, name });
const main = () => screen.getByRole("main");

/** Visit every route; `expectData` checks that content (not only empty states) rendered. */
async function visitAll(expectData: boolean) {
  await heading("Models");
  if (expectData) await waitFor(() => expect(within(main()).getByRole("region", { name: "Configs" })).toBeInTheDocument());

  await go("#/results");
  await heading("Results");
  expect(within(main()).getByRole("navigation", { name: "Results sections" })).toBeInTheDocument();
  for (const id of ["settings", "performance", "plots", "metrics"]) expect(document.getElementById(id)).not.toBeNull();

  await go("#/workflow");
  await heading("Workflow");
  expect(screen.getAllByTestId("stage")).toHaveLength(7);

  await go("#/generate");
  await heading("Generate");
  // Backend offline: the clear offline state, the Generate button disabled.
  expect(await screen.findAllByText(/offline/i)).not.toHaveLength(0);
  expect(screen.getByRole("button", { name: /^generate/i })).toBeDisabled();

  await go("#/");
  await heading("Models");
  expect(screen.getByRole("link", { name: "Models" })).toHaveAttribute("aria-current", "page");
}

describe("App integration", () => {
  const cases: [string, () => ManifestReply, boolean][] = [
    ["smoke", () => fixtureManifest({ size: "smoke" }), true],
    ["full", () => fixtureManifest({ size: "full" }), true],
    ["partial", () => fixtureManifest({ size: "smoke", partial: true }), true],
    ["empty (m3 and m2 null)", () => ({ ...fixtureManifest({ size: "smoke" }), sources: { m3: false, m2: false, real: false }, m3: null, m2: null }), false],
  ];

  for (const [name, make, hasData] of cases) {
    it(`renders all four routes with the ${name} manifest and no console errors`, async () => {
      manifestReply = make();
      const { unmount } = render(<App />);
      await visitAll(hasData);
      unmount();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  }

  it("shows empty states and an error banner when the manifest cannot be fetched", async () => {
    manifestReply = { status: 404 };
    const { unmount } = render(<App />);
    await heading("Models");
    expect(await screen.findByRole("alert")).toHaveTextContent("Results unavailable");
    expect(screen.getByText("No results")).toBeInTheDocument();
    await go("#/results");
    await heading("Results");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    unmount();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("shows the real numbers on the Models page with the smoke manifest", async () => {
    manifestReply = fixtureManifest({ size: "smoke" });
    const { unmount } = render(<App />);
    await heading("Models");
    const overview = await screen.findByRole("region", { name: "Overview" });
    // winner from the ranking, best CLIP on the ~0.3 cosine scale
    const tile = (label: string) => within(overview).getByText(label).parentElement as HTMLElement;
    expect(tile("Winner")).toHaveTextContent("SD baseline");
    expect(tile("Best CLIP")).toHaveTextContent("0.330");
    expect(tile("Best FID")).toHaveTextContent("360.0");
    unmount();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

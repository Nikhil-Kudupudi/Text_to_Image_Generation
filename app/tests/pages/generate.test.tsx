import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GeneratePage from "../../src/pages/Generate";
import { ResultsContext } from "../../src/lib/ManifestContext";
import { fixtureManifest } from "../fixtures/manifest";
import type { GenerateResponse, HealthResponse, Manifest, Preset } from "../../src/types";

// ---- fake backend ----------------------------------------------------------------

const PRESETS: Preset[] = [
  { id: "sd_baseline", label: "SD 1.5 baseline", model: "sd15", sampler: "pndm", steps: 50, guidance: 7.5, resolution: 512, clip_layer: 1 },
  { id: "sd_tuned", label: "SD 1.5 tuned", model: "sd15", sampler: "euler_a", steps: 30, guidance: 7.5, resolution: 512, clip_layer: 1 },
  { id: "sd_tuned_clipskip2", label: "SD 1.5 tuned, CLIP skip 2", model: "sd15", sampler: "euler_a", steps: 30, guidance: 7.5, resolution: 512, clip_layer: 2 },
  { id: "ldm_bert", label: "LDM-BERT", model: "ldm", sampler: "ddim", steps: 50, guidance: 7.5, resolution: 256, clip_layer: null },
  { id: "amused", label: "aMUSEd 256", model: "amused", sampler: "masked unmasking", steps: 12, guidance: 7.5, resolution: 256, clip_layer: null },
];

const HEALTH: HealthResponse = { ok: true, device: "cuda", gpu: "Test GPU", loaded: "sd_tuned", busy: false };

function gen(id: string, prompt: string, extra: Partial<GenerateResponse> = {}): GenerateResponse {
  return {
    id,
    image: `/api/images/${id}.png`,
    prompt,
    preset: "sd_tuned",
    guidance: 7.5,
    steps: 30,
    seed: 42,
    seconds: 4.1,
    clip: 0.3571,
    created: "2026-11-22T20:36:14+00:00",
    ...extra,
  };
}

type Reply = { status: number; body: unknown } | Error;
type Handler = (init?: RequestInit) => Reply | Promise<Reply>;

let routes: Record<string, Handler>;
let fetchMock: ReturnType<typeof vi.fn>;

function fakeResponse(r: { status: number; body: unknown }): Response {
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    statusText: "",
    json: async () => r.body,
  } as unknown as Response;
}

function ok(body: unknown): Reply {
  return { status: 200, body };
}

beforeEach(() => {
  routes = {
    "GET /api/health": () => ok(HEALTH),
    "GET /api/presets": () => ok(PRESETS),
    "GET /api/history": () => ok([]),
    "POST /api/generate": () => ok(gen("20261122-000000-aaaaaa", "x")),
  };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = routes[key];
    if (!handler) throw new TypeError(`no route ${key}`);
    const reply = await handler(init);
    if (reply instanceof Error) throw reply;
    return fakeResponse(reply);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(data: Manifest | null = fixtureManifest({ size: "smoke" })) {
  return render(
    <ResultsContext.Provider value={{ data, error: null, loading: false, reload() {} }}>
      <GeneratePage pollMs={20} />
    </ResultsContext.Provider>,
  );
}

const promptBox = () => screen.getByLabelText("Prompt") as HTMLTextAreaElement;
const generateButton = () => screen.getByRole("button", { name: /^generate/i });
const ready = () => waitFor(() => expect(screen.getByRole("radio", { name: "SD tuned" })).toBeInTheDocument());

function generateCalls() {
  return fetchMock.mock.calls.filter(([u, init]) => u === "/api/generate" && (init as RequestInit | undefined)?.method === "POST");
}

// ---- tests -------------------------------------------------------------------------

describe("Generate page: backend offline", () => {
  it("disables the form and shows the start command, then recovers when health comes up", async () => {
    let up = false;
    routes["GET /api/health"] = () => (up ? ok(HEALTH) : new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Backend offline")).toBeInTheDocument();
    expect(screen.getByText("uv run uvicorn backend.app:app --port 8000")).toBeInTheDocument();
    expect(promptBox()).toBeDisabled();
    expect(generateButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Copy command" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

    up = true;
    await waitFor(() => expect(screen.queryByText("Backend offline")).not.toBeInTheDocument());
    await ready();
    expect(promptBox()).toBeEnabled();
  });

  it("disables Generate while another generation is running on the backend", async () => {
    routes["GET /api/health"] = () => ok({ ...HEALTH, busy: true });
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.type(promptBox(), "a cat");
    expect(generateButton()).toBeDisabled();
    expect(screen.getByText(/busy/i)).toBeInTheDocument();
  });
});

describe("Generate page: presets", () => {
  it("lists the five presets with sd_tuned selected and its defaults in Advanced", async () => {
    const user = userEvent.setup();
    renderPage();
    await ready();
    const radios = within(screen.getByRole("group", { name: "Preset" })).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "SD tuned" })).toBeChecked();
    expect(screen.getByLabelText("Guidance")).toHaveValue(7.5);
    expect(screen.getByLabelText("Steps")).toHaveValue(30);
    expect(screen.getByLabelText("Seed")).toHaveValue(null);

    await user.click(screen.getByRole("radio", { name: "LDM-BERT" }));
    expect(screen.getByRole("radio", { name: "LDM-BERT" })).toBeChecked();
    expect(screen.getByLabelText("Steps")).toHaveValue(50);

    await user.click(screen.getByRole("button", { name: "Random seed" }));
    const seed = Number((screen.getByLabelText("Seed") as HTMLInputElement).value);
    expect(Number.isInteger(seed) && seed >= 0).toBe(true);
  });
});

describe("Generate page: generating", () => {
  it("shows a busy state, then the image with seconds and CLIP", async () => {
    let finish: (r: Reply) => void = () => {};
    routes["GET /api/health"] = () => ok({ ...HEALTH, loaded: "amused" });
    routes["POST /api/generate"] = () => new Promise<Reply>((res) => (finish = res));
    const user = userEvent.setup();
    renderPage();
    await ready();

    await user.type(promptBox(), "a red bicycle");
    await user.click(generateButton());

    expect(await screen.findByRole("button", { name: /generating/i })).toBeDisabled();
    expect(screen.getByText(/loading model/i)).toBeInTheDocument();
    const body = JSON.parse(String((generateCalls()[0][1] as RequestInit).body));
    expect(body).toEqual({ prompt: "a red bicycle", preset: "sd_tuned", guidance: 7.5, steps: 30 });

    finish(ok(gen("20261122-153613-71512a", "a red bicycle", { seed: 7 })));
    const result = await screen.findByTestId("result");
    expect(within(result).getByRole("img", { name: "a red bicycle" })).toHaveAttribute("src", "/api/images/20261122-153613-71512a.png");
    expect(within(result).getByText("4.1 s")).toBeInTheDocument();
    expect(within(result).getByText("0.357")).toBeInTheDocument();
    expect(within(result).getByText("7")).toBeInTheDocument();
    const download = within(result).getByRole("link", { name: /download/i });
    expect(download).toHaveAttribute("href", "/api/images/20261122-153613-71512a.png");
    expect(download).toHaveAttribute("download");
    expect(generateButton()).toBeEnabled();
  });

  it("submits with Ctrl+Enter and sends the seed when set", async () => {
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.type(screen.getByLabelText("Seed"), "123");
    await user.type(promptBox(), "a dog");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    const body = JSON.parse(String((generateCalls()[0][1] as RequestInit).body));
    expect(body.seed).toBe(123);
    expect(body.prompt).toBe("a dog");
  });

  it("shows the server's detail on 409", async () => {
    routes["POST /api/generate"] = () => ({ status: 409, body: { detail: "A generation is already running; try again when it finishes." } });
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.type(promptBox(), "a cat");
    await user.click(generateButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("A generation is already running; try again when it finishes.");
  });

  it("shows the server's detail on 422", async () => {
    routes["POST /api/generate"] = () => ({ status: 422, body: { detail: [{ msg: "Input should be less than or equal to 20", loc: ["body", "guidance"] }] } });
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.type(promptBox(), "a cat");
    await user.click(generateButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Input should be less than or equal to 20");
  });

  it("explains a network failure", async () => {
    routes["POST /api/generate"] = () => new TypeError("Failed to fetch");
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.type(promptBox(), "a cat");
    await user.click(generateButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the backend/i);
  });
});

describe("Generate page: history", () => {
  it("shows earlier results newest first, opens the Lightbox and reuses settings", async () => {
    routes["GET /api/history"] = () =>
      ok([
        gen("20261122-120002-bbbbbb", "a newer kite", { preset: "amused", clip: 0.3148, seed: 99, steps: 12 }),
        gen("20261122-120001-aaaaaa", "an older bus"),
      ]);
    const user = userEvent.setup();
    renderPage();
    await ready();

    const items = await screen.findAllByTestId("history-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("button", { name: "a newer kite" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "an older bus" })).toBeInTheDocument();

    await user.click(within(items[0]).getByRole("button", { name: "a newer kite" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("a newer kite")).toBeInTheDocument();
    expect(within(dialog).getByText(/aMUSEd/)).toBeInTheDocument();
    expect(within(dialog).getByText(/CLIP 0\.315/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(within(items[0]).getByRole("button", { name: "Reuse" }));
    expect(promptBox()).toHaveValue("a newer kite");
    expect(screen.getByRole("radio", { name: "aMUSEd" })).toBeChecked();
    expect(screen.getByLabelText("Seed")).toHaveValue(99);
    expect(screen.getByLabelText("Steps")).toHaveValue(12);
  });

  it("puts a new generation first in the strip", async () => {
    routes["GET /api/history"] = () => ok([gen("20261122-120001-aaaaaa", "an older bus")]);
    routes["POST /api/generate"] = () => ok(gen("20261122-130000-cccccc", "a fresh pizza"));
    const user = userEvent.setup();
    renderPage();
    await ready();
    await screen.findAllByTestId("history-item");
    await user.type(promptBox(), "a fresh pizza");
    await user.click(generateButton());
    await screen.findByTestId("result");
    const items = screen.getAllByTestId("history-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("button", { name: "a fresh pizza" })).toBeInTheDocument();
  });
});

describe("Generate page: suggestions", () => {
  it("offers three captions from m3.prompts, stable across renders, and fills the prompt", async () => {
    const data = fixtureManifest({ size: "smoke" });
    const captions = data.m3!.prompts.map((p) => p.caption);
    const user = userEvent.setup();
    const view = renderPage(data);
    await ready();

    const chips = within(screen.getByRole("group", { name: "Suggestions" })).getAllByRole("button", { name: /^a / });
    expect(chips).toHaveLength(3);
    const texts = chips.map((c) => c.textContent ?? "");
    texts.forEach((t) => expect(captions).toContain(t));
    expect(new Set(texts).size).toBe(3);
    expect(captions).toContain(promptBox().placeholder);

    view.rerender(
      <ResultsContext.Provider value={{ data, error: null, loading: false, reload() {} }}>
        <GeneratePage pollMs={20} />
      </ResultsContext.Provider>,
    );
    const again = within(screen.getByRole("group", { name: "Suggestions" }))
      .getAllByRole("button", { name: /^a / })
      .map((c) => c.textContent);
    expect(again).toEqual(texts);

    await user.click(chips[1]);
    expect(promptBox()).toHaveValue(texts[1]);
  });

  it("has no suggestions without a manifest", async () => {
    renderPage(null);
    await ready();
    expect(screen.queryByRole("group", { name: "Suggestions" })).not.toBeInTheDocument();
    expect(promptBox().placeholder.length).toBeGreaterThan(0);
  });
});

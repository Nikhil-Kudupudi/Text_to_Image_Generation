# Results Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A four-page local website (Models, Results, Workflow, Generate) that reads the notebook output folders live and generates new images from typed prompts through a local FastAPI + diffusers backend.

**Architecture:** Vite dev-server plugin (`app/vite.config.ts` + `app/server/results.mjs`, done) serves a manifest and the output files under `/results/`. A React app with a sidebar shell, shared lib + UI + chart primitives, and one module per page consumes `app/src/types.ts`.

**Tech Stack:** Vite 6, React 18, TypeScript 5 (strict), Vitest 2 + Testing Library + jsdom. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-22-results-website-design.md`

## Global Constraints
- All code under `app/`; run commands from `app/`: `npm run check` (tsc), `npm test` (vitest), `npm run dev`.
- Runtime deps: `react`, `react-dom` only. No chart, CSS or router library.
- Types come from `app/src/types.ts`; do not redefine manifest shapes.
- Missing data (null `m3`/`m2`, empty arrays, null metric values) renders an empty state, never throws.
- Text minimal: headings are 1–3 words, no paragraphs, no caption text under images.
- Colours only through CSS variables defined in `src/styles/tokens.css`; model series vars `--series-1..5` in model order `sd_baseline, sd_tuned, sd_tuned_clipskip2, ldm_bert, amused`; `--series-muted` for anything else.
- Light and dark via `html[data-theme="light"|"dark"]`, default from `prefers-color-scheme`.
- Hover: `.lift` cards translateY(-2px); thumbnails scale(1.03) inside `overflow:hidden`; all motion off under `prefers-reduced-motion`.
- Each agent touches only its own files listed below.

## Review Focus
1. Folder present but tables missing (or the reverse) → pages show images without numbers, or numbers without images, never crash. (Task 6 page tests with a partial manifest.)
2. A config with fewer images than prompts → missing tiles show an empty frame, not a broken-image icon. (Task 3 compare strip test.)
3. Smoke-sized data (N=8, two guidance values) and full data (N=500, six values) both lay out. (Task 6 fixtures at both sizes.)
4. Null FID/IS (metric failed) → "—" in tables, bar omitted in charts. (Task 2 BarChart null test, Task 1 `fmt` test.)
5. Path traversal in `/results/...` URLs → 404. (Task 0 server test.)

---

### Task 0 (QA agent, wave 1): tests first for the server and shared lib
**Files:** Create `tests/server/results.test.mjs`, `tests/lib/urls.test.ts`, `tests/lib/format.test.ts`, `tests/lib/configs.test.ts`, `tests/lib/router.test.ts`, `tests/fixtures/manifest.ts`.
**Interfaces:** Consumes `parseCSV, buildManifest, resolveFile, loadSources` from `server/results.mjs` (exists) and the lib signatures of Task 1. Produces `fixtureManifest({ size: "smoke" | "full", partial?: boolean }): Manifest` in `tests/fixtures/manifest.ts` for all later tests.
- [ ] Server tests: `parseCSV` handles quoted commas and `""` escapes and CRLF; numbers coerced, empty → null. `buildManifest` on a temp dir tree (models + sweep folders, logs, metrics json, clip csv) returns models in fixed order, sweep sorted by guidance, `clip.sd_tuned[0]` numeric; missing tables → empty arrays; `m3: null` when source null. `resolveFile` rejects `../` and returns null for missing files.
- [ ] Lib tests (fail until Task 1): `imageUrl("sd_tuned", 7)` ends with `results/m3/images/sd_tuned/007.png`; `realUrl({image_512_path:"a.jpg"})` ends `results/real/a.jpg`; `fmt(null)==="—"`, `fmt(0.31987,3)==="0.320"`; `fmtSeconds(2.798)==="2.8 s"`; `plotTitle("m3_fid_is_bars.png")==="FID IS bars"`; `configLabel("sweep_g7.5")==="g = 7.5"`, `configLabel("sd_tuned")==="SD tuned"`; `seriesVar("amused")==="var(--series-5)"`, unknown → `"var(--series-muted)"`; `parseHash("#/results")==="results"`, `parseHash("")==="home"`, `parseHash("#/nope")==="home"`, `parseHash("#/generate")==="generate"`.
- [ ] Run `npm test`: server tests PASS, lib tests FAIL (modules missing). Commit.

### Task 1 (shell agent, wave 1): app shell, lib, UI kit, tokens
**Files:** Create `src/main.tsx`, `src/App.tsx`, `src/lib/{urls,format,configs,router,ManifestContext}.ts(x)`, `src/components/ui.tsx`, `src/components/Lightbox.tsx`, `src/components/Icon.tsx`, `src/styles/{tokens,base}.css`, stub `src/pages/{Home,Results,Workflow,Generate}.tsx` (each `export default function XPage()` rendering its heading only — page agents replace them).
**Interfaces (produces):**
- `urls.ts`: `resultUrl(path: string): string` (= `import.meta.env.BASE_URL + "results/" + path`), `imageUrl(config: string, idx: number): string`, `realUrl(p: Pick<Prompt,"image_512_path">): string`, `m3PlotUrl(name: string): string`, `m2Url(rel: string): string`.
- `format.ts`: `fmt(v: number | null | undefined, digits = 2): string`, `fmtSeconds(v: number | null | undefined): string`, `plotTitle(file: string): string` (strip `m2_`/`m3_` and extension, `_`→space, uppercase FID IS CLIP DDPM DPMPP, capitalise first letter).
- `configs.ts`: `MODEL_ORDER: ModelConfig[]`, `MODEL_META: Record<ModelConfig, { label: string; short: string }>` (labels: SD baseline, SD tuned, SD tuned clip-skip, LDM-BERT, aMUSEd), `configLabel(config: string): string`, `seriesVar(config: string): string`.
- `router.ts`: `type Route = "home" | "results" | "workflow" | "generate"`, `parseHash(hash: string): Route`, `useRoute(): [Route, (r: Route) => void]`.
- `ManifestContext.tsx`: `ManifestProvider({ children })`, `useResults(): { data: Manifest | null; error: string | null; loading: boolean; reload: () => void }` (fetch `resultUrl("manifest.json")`, `cache: "no-store"`, reload on window focus).
- `ui.tsx`: `Section({ id, title, actions?, children })`, `Card({ children, className?, onClick? })` (adds `.lift` when clickable), `StatTile({ label, value, sub? })`, `Segmented<T extends string>({ options: { value: T; label: string }[]; value: T; onChange(v: T): void })`, `Pill({ children, tone?: "neutral" | "accent" })`, `EmptyState({ title, hint? })`, `SeriesDot({ config })`, `Thumb({ src, alt, onClick? })` (lazy img in a square frame; on error shows an empty frame).
- `Lightbox.tsx`: `Lightbox({ items: { src: string; alt: string; title?: string; meta?: string }[]; index: number | null; onClose(): void; onIndex(i: number): void })`, keys ←/→/Esc, focus trapped, closes on backdrop click.
- `api.ts` (in `src/lib/`): `getHealth(): Promise<HealthResponse>`, `getPresets(): Promise<Preset[]>`, `generate(req: GenerateRequest): Promise<GenerateResponse>` (throws `Error(detail)` on non-2xx), `getHistory(): Promise<GenerateResponse[]>`; all against `/api/...`.
- `App.tsx`: sidebar (Models, Results, Workflow, Generate, theme toggle, manifest timestamp + reload button), main area renders the page for the route, wrapped in `ManifestProvider`.
- [ ] Make Task 0 lib tests pass; `npm run check` clean; `npm run dev` shows the shell with all three routes. Commit.

### Task 2 (charts agent, wave 1): SVG chart primitives
**Files:** Create `src/components/charts/{BarChart,LineChart,ScatterChart,RankHeatmap,Tooltip,useWidth,index}.tsx`, `tests/charts/*.test.tsx`.
**Interfaces (produces, re-exported from `index.tsx`):**
- `BarChart({ items: { key: string; label: string; value: number | null; err?: number | null; color: string }[]; better: "lower" | "higher"; format?: (v: number) => string; reference?: { value: number; label: string }; ariaLabel: string })` — horizontal bars, label left, value at tip, null → no bar and "—".
- `LineChart({ points: { x: number; y: number | null; err?: number | null }[]; xLabel: string; yLabel: string; better?: "lower" | "higher"; format?: (v: number) => string; color?: string; ariaLabel: string })` — crosshair + tooltip, error whiskers when `err`.
- `ScatterChart({ points: { key: string; label: string; x: number; y: number; size?: number; color: string }[]; xLabel: string; yLabel: string; formatX?; formatY?; sizeLabel?: string; ariaLabel: string })` — direct labels, size scaled 8–20px.
- `RankHeatmap({ columns: string[]; rows: { label: string; ranks: (number | null)[]; avg: number; winner?: boolean }[] })` — sequential blue cells (rank 1 darkest), numbers inside.
- Every chart: responsive width via `useWidth()`, `role="img"` + `aria-label`, a visually-hidden `<table>` of the data, tooltip on hover/focus.
- [ ] Tests first: BarChart renders one bar per non-null item and "—" for null; reference line rendered when given; LineChart renders N points and shows tooltip text on hover; ScatterChart renders labels; RankHeatmap marks the winner row. Then implement; `npm test` + `npm run check` clean. Commit.

### Task 3 (Models page agent, wave 2)
**Files:** Replace `src/pages/Home.tsx`; create `src/pages/home/{ModelCards,CompareStrip,BrowseGrid,PromptPicker}.tsx`, `tests/pages/home.test.tsx`.
**Consumes:** Task 1 lib + ui + Lightbox, `useResults()`.
- [ ] Tests first with `fixtureManifest`: stat tiles show winner label from `ranking` (question "models", overall_rank 1); one card per `m3.models`; compare strip shows real photo + one tile per model for the selected prompt with per-image CLIP; switch to guidance shows one tile per `m3.sweep`; browse grid pages 48 thumbs; missing image → empty frame; `m3: null` → EmptyState.
- [ ] Implement; tests + check clean. Commit.

### Task 4 (Results page agent, wave 2)
**Files:** Replace `src/pages/Results.tsx`; create `src/pages/results/{SettingsSection,PerformanceSection,PlotGallery,MetricsSection}.tsx`, `tests/pages/results.test.tsx`.
**Consumes:** Task 1 + Task 2 interfaces.
- [ ] Tests first: sticky sub-nav with 4 anchors; settings table one row per `m3.models` (sampler, steps, guidance, resolution, s/img, VRAM); earlier sweep charts from `m2.sweep` by `axis` (guidance → LineChart, sampler → BarChart); performance: FID/IS/CLIP BarCharts for `group==="models"`, three LineCharts for `group==="guidance"`, one ScatterChart; gallery lists `m3.plots` + `m2.plots` and opens Lightbox; metrics table sortable by column; ranking heatmap per question with winner cards last; partial manifest renders.
- [ ] Implement; tests + check clean. Commit.

### Task 5 (Workflow page agent, wave 2)
**Files:** Replace `src/pages/Workflow.tsx`; create `src/pages/workflow/{Sketch,FolderTree}.tsx`, `src/styles/sketch.css`, `tests/pages/workflow.test.tsx`.
- [ ] Tests first: renders the stages in order: COCO captions → preprocessing → settings sweep → render models / render guidance → evaluation → website; folder tree lists `outputs/milestone_3/{images,plots,tables}`, `outputs/milestone_2/`, `data/processed/images_512`; live counts from the manifest when present (images per config).
- [ ] Implement a hand-drawn wireframe (Kalam, dashed irregular-radius boxes, arrows), responsive to one column under 720px. Tests + check clean. Commit.

### Task 7 (backend agent, wave 1): live generation API
**Files:** Create `backend/__init__.py`, `backend/app.py`, `backend/presets.py`, `backend/engine.py`, `backend/tests/test_api.py`; modify `app/vite.config.ts` only if the proxy needs a change (it already proxies `/api` to `http://127.0.0.1:8000`).
**Interfaces (produces):** the HTTP API in the spec, JSON shapes exactly `Preset`, `HealthResponse`, `GenerateRequest`, `GenerateResponse` from `app/src/types.ts`. `engine.py`: `class Engine` with `load(preset_id) -> None`, `render(prompt, preset, guidance, steps, seed) -> PIL.Image`, `clip_score(prompt, image) -> float | None`; `app.py` gets the engine via a FastAPI dependency `get_engine()` so tests override it with a fake.
- [ ] Tests first (pytest + `fastapi.testclient`, fake engine, `LIVE_DIR` env pointing to a tmp dir): presets list has the five ids with the spec's sampler/steps/guidance; generate returns the contract fields and writes `<id>.png` + one history line; empty prompt / unknown preset / guidance 25 / steps 0 → 422; a request while busy → 409; `GET /api/images/<id>.png` → image/png; `../` in id → 404; history newest first, max 50.
- [ ] Implement with diffusers using the notebooks' settings (scheduler `from_config` on the pipeline's original config with `timestep_spacing="leading"`; clip-skip via `final_layer_norm(hidden_states[-2])` passed as `prompt_embeds`; fp16 on CUDA, fp32 on CPU; seed via `torch.Generator("cpu")`). Run `uv run pytest backend -q` green. Manual check on the local GPU: one `sd_tuned` generation via curl. Commit.

### Task 8 (Generate page agent, wave 2)
**Files:** Replace `src/pages/Generate.tsx`; create `src/pages/generate/{PromptForm,ResultView,HistoryStrip}.tsx`, `tests/pages/generate.test.tsx`.
**Consumes:** `src/lib/api.ts`, ui kit, Lightbox, `MODEL_META`/`seriesVar`.
- [ ] Tests first (mock `fetch`): backend down → disabled form + "Backend offline" state with the start command; presets populate a segmented/select control with default `sd_tuned`; submitting shows a busy state and then the image, seconds and CLIP; 409/422 errors show the server's `detail`; history strip shows earlier results newest first and opens Lightbox; prompt suggestions come from `m3.prompts` (three random captions) when the manifest has them.
- [ ] Implement; tests + check clean. Commit.

### Task 6 (QA judge, wave 3)
**Files:** Create `tests/pages/integration.test.tsx`; may fix defects in any file, reporting each.
- [ ] Render `App` with fixture manifests (smoke, full, partial, null) mocked via `fetch`; all routes render without errors; no console errors.
- [ ] Review all code against the spec's Look section and Review Focus; `npm test`, `npm run check`, `npm run build` all green. Report findings severity-ranked.

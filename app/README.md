# T2I Results

A local website for the text-to-image notebooks. It reads the notebook output folders in place and shows:

| Page | Route | What |
|---|---|---|
| Models | `#/` | stat tiles, one card per model, compare strip (real photo + every model), browse grid, lightbox |
| Results | `#/results` | render settings, earlier settings sweep, FID / IS / CLIP charts, notebook plots, metrics table, ranking |
| Workflow | `#/workflow` | pipeline sketch from COCO captions to this site, outputs folder tree |
| Generate | `#/generate` | type a prompt, pick a preset, generate live (needs the backend) |

React + Vite, no other runtime dependencies. Charts are hand-built SVG.

## Run

Two processes: the backend (only needed for Generate) and the frontend.

**Backend** (from the repo root, port 8000):

```sh
uv run uvicorn backend.app:app --port 8000
```

Without uv, use the project venv:

```sh
# Windows (PowerShell)
.venv\Scripts\python.exe -m uvicorn backend.app:app --port 8000
# macOS / Linux
.venv/bin/python -m uvicorn backend.app:app --port 8000
```

CUDA uses fp16, Apple silicon uses `mps`, everything else runs on CPU (slow). The first generation for a model family loads its weights (about 10 s).

**Frontend** (from `app/`, port 5173):

```sh
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend on `127.0.0.1:8000`. Every page works without the backend; Generate shows "Backend offline" until it is up.

## Where outputs go

Folders are set in `app/results.config.json` (the first existing path wins). Environment variables override them:

```sh
# Windows (PowerShell)
$env:RESULTS_M3 = "D:\runs\m3"; npm run dev
# macOS / Linux
RESULTS_M3=/runs/m3 npm run dev
```

Expected layout (repo root). Any folder or table may be missing; pages show an empty state instead.

```
outputs/
  milestone_3/                  RESULTS_M3: the three milestone 3 Kaggle outputs, merged
    images/<config>/000.png     sd_baseline, sd_tuned, sd_tuned_clipskip2, ldm_bert, amused, sweep_g<guidance>
    plots/*.png
    tables/                     m3_generation_log.csv, m3_sweep_log.csv, m3_prompts.csv,
                                m3_prompts_guidance.csv, m3_metrics.json (or .csv),
                                m3_clip_per_image.csv, m3_ranking.csv
  milestone_2/                  RESULTS_M2 (falls back to outputs/milestone_2_sd1.5/outputs/)
    sweep/all_results.csv
    sweep/<label>/grid.png
    plots/*.png
    tables/milestone_2_sd15.json
  live/                         written by the backend
    <id>.png
    history.jsonl
data/processed/images_512/      RESULTS_REAL: real COCO photos (000000348012.jpg ...)
```

The metrics and per-image CLIP tables include a `real` config: the real photos as a reference. It is drawn as a reference line or row and never ranked.

## A new Kaggle run

1. Download the outputs of the three milestone 3 notebooks.
2. Unzip them into `outputs/milestone_3/` so `images/`, `plots/` and `tables/` merge.
3. Refresh the browser (or press the reload button in the sidebar).

Nothing is rebuilt: the dev server rebuilds the manifest on every request. A smoke run (8 prompts) and a full run (500 prompts) both work.

## Static build

```sh
npm run build      # type check + bundle into app/dist/
npm run preview    # serve dist/ locally to check it
```

The build copies the results into `dist/results/` with a fixed `manifest.json`, so `dist/` can be served by any static host, from any sub-path. Rebuild to pick up new outputs. Generate needs the backend, so on a static host it shows "Backend offline". The copy includes every PNG (the smoke data is about 120 MB, mostly milestone 2 grids), so a full run makes a large `dist/`.

## Tests

```sh
# frontend (from app/)
npm run check      # tsc
npm test           # vitest: server, lib, charts, pages, whole-app integration

# backend (from the repo root, uses a fake engine, no GPU)
uv run pytest backend -q
# or: .venv\Scripts\python.exe -m pytest backend -q   (macOS: .venv/bin/python -m pytest backend -q)
```

## Code map

```
app/server/results.mjs     builds the manifest from the output folders, serves files, copies them for the build
app/vite.config.ts         dev middleware for /results/*, /api proxy, build copy
app/src/types.ts           the manifest and API contract
app/src/lib/               urls, formatting, model configs, router, manifest context, API client, theme
app/src/components/        UI kit, lightbox, icons, charts/ (Bar, Line, Scatter, RankHeatmap)
app/src/pages/             one folder per page
backend/                   FastAPI + diffusers live generation (app.py, engine.py, presets.py)
```

# Results website — design spec

## Purpose
A local website (later deployable) that shows what the notebooks produced: the images each model
generated from the COCO prompts, the settings and metrics behind them, and the end-to-end workflow.
The notebooks and the website develop independently: the site only reads output folders, so a new
Kaggle run shows up after dropping its outputs in place and refreshing the browser. Nothing is rebuilt.

## Data contract
- Output folders are configured in `app/results.config.json` (first existing path wins; env
  `RESULTS_M3`, `RESULTS_M2`, `RESULTS_REAL` override):
  - `m3` → `outputs/milestone_3/` = the three milestone 3 Kaggle outputs merged: `images/<config>/<idx:03d>.png`, `plots/*.png`, `tables/*.csv|json`
  - `m2` → `outputs/milestone_2/` (falls back to `outputs/milestone_2_sd1.5/outputs/`): `sweep/all_results.csv`, `sweep/<label>/grid.png`, `plots/*.png`, `tables/milestone_2_sd15.json`
  - `real` → `data/processed/images_512/`
- `app/server/results.mjs` builds one manifest (`app/src/types.ts` → `Manifest`) and resolves files.
  Dev server: `/results/manifest.json` (rebuilt per request) and `/results/<m3|m2|real>/<path>`.
  `npm run build` copies the same tree into `dist/results/` for static hosting.
- Any folder or table may be missing (a partly finished run). Every page must render an empty
  state for missing data, never crash.

## Pages (left sidebar, hash routes)
1. **Models** `#/`: stat tiles (winner, best CLIP, best FID, fastest), one card per model config,
   a compare strip (real photo + every model for one prompt, per-image CLIP), a switch to the
   guidance sweep, a paged browse grid for one model, a lightbox with ←/→/Esc.
2. **Results** `#/results`: settings (render log table + earlier settings sweep charts), performance
   charts (FID, IS, CLIP bars; FID/IS/CLIP vs guidance; FID vs CLIP scatter), notebook plot gallery,
   full metrics table and ranking with the winner of each question last.
3. **Workflow** `#/workflow`: a hand-drawn wireframe of the pipeline from COCO captions to this
   website, plus the outputs folder tree.

4. **Generate** `#/generate`: type a prompt, pick a preset (the five notebook configs), optionally
   guidance / steps / seed, press Generate; shows the image, seconds and its CLIP score, plus a
   history strip of earlier live generations. Disabled with a clear state when the backend is down.

## Live generation backend
- `backend/app.py` (FastAPI, run with `uv run uvicorn backend.app:app --port 8000` from the repo
  root); Vite proxies `/api` → `http://127.0.0.1:8000`.
- Presets mirror the notebooks exactly: `sd_baseline` PNDM 50 g7.5, `sd_tuned` Euler-a 30 g7.5,
  `sd_tuned_clipskip2` same with CLIP penultimate layer, `ldm_bert` CompVis/ldm-text2im-large-256
  50 steps, `amused` amused/amused-256 12 steps; leading spacing; fp16 on CUDA.
- One pipeline in memory at a time (switching preset unloads the previous); one generation at a time
  (a second request while busy gets HTTP 409).
- Endpoints: `GET /api/health`, `GET /api/presets`, `POST /api/generate`, `GET /api/history`,
  `GET /api/images/{id}.png`. Types in `app/src/types.ts`.
- Each result is saved to `outputs/live/<id>.png` and appended to `outputs/live/history.jsonl`.
- Validation: empty prompt, unknown preset, guidance outside 0–20, steps outside 1–100 → HTTP 422.

## Look
- Text is minimal: labels and numbers, no paragraphs. No caption text under images (a prompt shown
  once above a compare row is data, not a caption).
- One system: system sans for UI, Kalam only on the Workflow sketch; one card style, one radius scale
  (6/10px), one button style; light and dark themes (toggle + OS preference); no violet in UI chrome.
- Model colours follow the entity everywhere (dataviz reference palette, light/dark):
  sd_baseline blue `#2a78d6/#3987e5`, sd_tuned orange `#eb6834/#d95926`, sd_tuned_clipskip2 aqua
  `#1baf7a/#199e70`, ldm_bert yellow `#eda100/#c98500`, amused magenta `#e87ba4/#d55181`.
  Chart surface `#fcfcfb/#1a1a19`, grid `#e1e0d9/#2c2c2a`, axis `#c3c2b7/#383835`.
- Charts: hand-built SVG, bars ≤ 24px with a 4px rounded data end, 2px lines, markers r ≥ 4 with a
  2px surface ring, hairline solid grid, hover tooltip on every mark, legend for ≥ 2 series, text never
  in series colour, an accessible table for every chart, one y-axis only.
- Hover feedback: linked cards lift 2px, thumbnails zoom 1.03 inside their frame, buttons press.
  No scroll-driven animation. `prefers-reduced-motion` disables motion.
- Fast: lazy-loaded thumbnails, no chart or UI library beyond React.

## Out of scope (for now)
Auth, multi-user queueing, deployment config, GPU hosting.

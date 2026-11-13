# Milestone 2 — Conditional Generation & Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive Stable Diffusion 1.5 from explicitly-computed CLIP embeddings, then sweep CFG, sampler and noise schedule over a fixed prompt set with fixed latents, recording images and CLIP scores.

**Architecture:** Seven new modules under `src/modules/`, each with one responsibility, mirroring milestone 1's style: a thin module docstring explaining *why*, no inline narration. Pure logic (prompt selection, latent construction, grid building, result tables, image grids) is separated from GPU work so it is unit-testable on CPU. Notebooks only wire modules together and plot.

**Tech Stack:** Python 3.11, torch 2.11.0+cu128, diffusers, transformers, pandas, pytest.

**Spec:** `docs/milestone_2.md`

## Global Constraints

- Target hardware is an **RTX 5060 Laptop GPU, 8 GB VRAM, sm_120** — not the spec's 16 GB T4. Every pipeline is freed before the next loads; generation batch size defaults to 4, not 8.
- Modules import config flat (`import config as cfg`), siblings relatively (`from .x import y`); `src/` is on `sys.path`. Follow milestone 1 exactly.
- **Do not overcomment.** A module docstring stating what the module is for and why it exists, a one-line docstring per public function, and inline comments only where the code's intent is genuinely non-obvious. No comment restates what the next line does.
- Sweep protocol, verbatim from the spec: latents are **pre-generated and passed in**, built from `torch.Generator(device="cpu")`. Never a CUDA generator.
- `SEED = 42` from `config.py` is the only source of randomness.
- Fixed prompt set: **10** captions from the curated subset, **8–18 words**.
- Scheduler swaps go through `from_config(pipe.scheduler.config, ...)` so SD 1.5's trained `beta_schedule` survives.
- New tunable values go in `src/config.py`, never hardcoded in a module or notebook.
- Tests are CPU-only and must not download model weights; GPU work lives in notebooks.

## Review Focus

1. A prompt longer than 77 CLIP tokens — `encode_prompts` must truncate rather than raise, and the embedding shape must stay `(N, 77, 768)`.
2. `fixed_prompts` when the manifest holds fewer rows in the 8–18 word band than `n` requested — must raise a clear error, not silently return a short list.
3. A scheduler swap followed by a second swap — the second must read SD 1.5's original trained config, not the first swap's mutated one, or `beta_schedule` silently drifts.
4. `make_latents` called for a non-512 resolution (the 256 px LDM arm) — the latent must track the resolution, not stay hardcoded at 64×64.
5. A sweep where one config raises OOM mid-run — the already-completed rows must survive rather than the whole sweep being lost.

---

### Task 1: Test scaffolding and milestone-2 config

**Files:**
- Modify: `pyproject.toml` (add `pytest` dev dependency)
- Create: `tests/conftest.py`
- Create: `tests/test_config.py`
- Modify: `src/config.py` (append a milestone-2 section)

**Interfaces:**
- Consumes: nothing.
- Produces: `cfg.CFG_GRID: tuple[float, ...]`, `cfg.SAMPLERS: dict[str, int]` (name → default steps), `cfg.N_FIXED_PROMPTS: int`, `cfg.LATENT_SEED: int`, `cfg.GEN_BATCH_SIZE: int`, `cfg.SWEEP_DIR: Path`, `cfg.DDPM_STEPS: int`, `cfg.DDPM_N_PROMPTS: int`. A `tests/` tree where `import config as cfg` and `from modules import x` both work.

- [ ] **Step 1: Write `tests/conftest.py`**

Put `src/` on `sys.path` so tests import modules the way notebooks do:

```python
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
```

- [ ] **Step 2: Write the failing test**

```python
import config as cfg


def test_cfg_grid_spans_the_swept_range():
    assert min(cfg.CFG_GRID) >= 1.0
    assert max(cfg.CFG_GRID) <= 15.0
    assert 7.5 in cfg.CFG_GRID
    assert len(cfg.CFG_GRID) == 5


def test_sampler_registry_matches_the_spec():
    assert set(cfg.SAMPLERS) == {"pndm", "ddim", "lms", "euler", "euler_a", "dpmpp", "unipc"}
    assert cfg.SAMPLERS["pndm"] == 50
    assert cfg.SAMPLERS["dpmpp"] == 20


def test_fixed_prompt_and_latent_settings():
    assert cfg.N_FIXED_PROMPTS == 10
    assert cfg.LATENT_SEED == cfg.SEED
    assert cfg.GEN_BATCH_SIZE == 4
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_config.py -v`
Expected: FAIL — `AttributeError: module 'config' has no attribute 'CFG_GRID'` (or a collection error until pytest is installed).

- [ ] **Step 4: Add `pytest>=8.0` to `pyproject.toml` and sync**

Add a `[dependency-groups]` `dev` group rather than a runtime dependency. Run `uv sync --all-groups`.

- [ ] **Step 5: Append the milestone-2 section to `src/config.py`**

A `# ---- Milestone 2 ----` block defining the values in the Interfaces list. `CFG_GRID = (1.0, 4.0, 7.5, 11.0, 15.0)`. `SAMPLERS` maps the seven names to the spec's step counts (pndm 50, ddim 50, lms 30, euler 30, euler_a 30, dpmpp 20, unipc 20). `GEN_BATCH_SIZE = 4` with a one-line note that 8 GB, not the spec's 16 GB T4, sets it. `SWEEP_DIR = OUTPUT_DIR / "sweep"` added to `ALL_DIRS`.

- [ ] **Step 6: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_config.py -v`
Expected: PASS, 3 passed.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock tests/ src/config.py
git commit -m "test: add pytest scaffolding and milestone-2 config values"
```

---

### Task 2: Fixed prompt set

**Files:**
- Create: `src/modules/prompts.py`
- Create: `tests/test_prompts.py`

**Interfaces:**
- Consumes: `cfg.N_FIXED_PROMPTS`, `cfg.PROMPT_MIN_WORDS`, `cfg.PROMPT_MAX_WORDS`, `cfg.SEED`.
- Produces: `fixed_prompts(manifest: pd.DataFrame, n: int | None = None, min_words: int | None = None, max_words: int | None = None, seed: int | None = None) -> pd.DataFrame` returning the sampled manifest rows, index reset, in a stable order. Later tasks read its `caption`, `pair_idx` and `image_512_path` columns.

- [ ] **Step 1: Write the failing test**

Build a small synthetic manifest in the test (no disk, no COCO):

```python
def test_selection_is_deterministic_and_respects_word_bounds():
    m = _manifest(60)
    a = prompts.fixed_prompts(m, n=10, min_words=8, max_words=18, seed=42)
    b = prompts.fixed_prompts(m, n=10, min_words=8, max_words=18, seed=42)
    assert len(a) == 10
    assert a["caption"].tolist() == b["caption"].tolist()
    assert a["n_words"].between(8, 18).all()


def test_a_different_seed_selects_a_different_set():
    m = _manifest(60)
    a = prompts.fixed_prompts(m, n=10, seed=42)
    b = prompts.fixed_prompts(m, n=10, seed=7)
    assert a["caption"].tolist() != b["caption"].tolist()


def test_too_few_eligible_captions_raises():
    m = _manifest(60)
    with pytest.raises(ValueError, match="only 0"):
        prompts.fixed_prompts(m, n=10, min_words=40, max_words=50)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_prompts.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.prompts'`.

- [ ] **Step 3: Implement `fixed_prompts` in `src/modules/prompts.py`**

Filter on `n_words` between the bounds, then `DataFrame.sample(n, random_state=seed)` and sort by `pair_idx` so the order is stable regardless of sample order. Raise `ValueError` naming the eligible count when it is below `n`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_prompts.py -v`
Expected: PASS, 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/prompts.py tests/test_prompts.py
git commit -m "feat: add deterministic fixed prompt selection"
```

---

### Task 3: Fixed latents

**Files:**
- Create: `src/modules/latents.py`
- Create: `tests/test_latents.py`

**Interfaces:**
- Consumes: `cfg.LATENT_SEED`, `cfg.IMAGE_SIZE`, `cfg.SD_DTYPE`.
- Produces: `make_latents(n: int, height: int | None = None, width: int | None = None, seed: int | None = None, channels: int = 4, vae_scale: int = 8, dtype=None, device="cpu") -> torch.Tensor` of shape `(n, channels, height // vae_scale, width // vae_scale)`.

- [ ] **Step 1: Write the failing test**

```python
def test_shape_tracks_resolution():
    assert latents.make_latents(3, height=512, width=512).shape == (3, 4, 64, 64)
    assert latents.make_latents(2, height=256, width=256).shape == (2, 4, 32, 32)


def test_same_seed_reproduces_exactly():
    a = latents.make_latents(4, seed=42)
    b = latents.make_latents(4, seed=42)
    assert torch.equal(a, b)


def test_different_seed_differs():
    assert not torch.equal(latents.make_latents(4, seed=42), latents.make_latents(4, seed=43))


def test_generator_is_cpu_so_runs_reproduce_across_machines():
    a = latents.make_latents(4, seed=42)
    assert a.device.type == "cpu"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_latents.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.latents'`.

- [ ] **Step 3: Implement `make_latents` in `src/modules/latents.py`**

`torch.randn(shape, generator=torch.Generator(device="cpu").manual_seed(seed))`, then cast to `dtype` and move to `device`. The module docstring states the two spec rules (pre-generated latents, CPU generator) and why each is needed — that is the module's whole reason to exist.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_latents.py -v`
Expected: PASS, 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/latents.py tests/test_latents.py
git commit -m "feat: add fixed CPU-generator latents for the sweep"
```

---

### Task 4: Pipeline loading and scheduler swapping

**Files:**
- Create: `src/modules/sd_pipeline.py`
- Create: `tests/test_sd_pipeline.py`

**Interfaces:**
- Consumes: `cfg.SD_REPO_CANDIDATES`, `cfg.DEVICE`, `cfg.SD_DTYPE`, `cfg.SAMPLERS`.
- Produces:
  - `SCHEDULER_CLASSES: dict[str, type]` — the seven spec names mapped to diffusers scheduler classes.
  - `scheduler_kwargs(name: str, **overrides) -> dict` — the per-sampler defaults (`ddim` gets `eta=0`-compatible settings; `lms`/`euler`/`dpmpp`/`unipc` accept `use_karras_sigmas`) merged with caller overrides.
  - `set_scheduler(pipe, name: str, base_config: dict | None = None, **overrides)` — swaps `pipe.scheduler` via `from_config`, returning the pipe. Uses `base_config` (SD 1.5's original, captured at load) rather than the live scheduler's config, so repeated swaps never compound.
  - `load_sd(repo_candidates=None, device=None, dtype=None) -> tuple[pipe, str, dict]` returning the pipe, the repo that loaded, and the original scheduler config.
  - `free(*objects)` — deletes and calls `torch.cuda.empty_cache()`.

- [ ] **Step 1: Write the failing test**

No weights are downloaded; the tests cover the registry and the config algebra with a stub pipe.

```python
def test_registry_covers_every_configured_sampler():
    assert set(sd_pipeline.SCHEDULER_CLASSES) == set(cfg.SAMPLERS)


def test_karras_override_only_where_supported():
    assert sd_pipeline.scheduler_kwargs("dpmpp", use_karras_sigmas=True)["use_karras_sigmas"] is True
    assert "use_karras_sigmas" not in sd_pipeline.scheduler_kwargs("pndm")


def test_repeated_swaps_read_the_original_config():
    base = {"beta_schedule": "scaled_linear", "num_train_timesteps": 1000}
    pipe = _StubPipe(base)
    sd_pipeline.set_scheduler(pipe, "ddim", base_config=base, timestep_spacing="trailing")
    sd_pipeline.set_scheduler(pipe, "euler", base_config=base)
    assert pipe.scheduler.config["beta_schedule"] == "scaled_linear"
    assert "timestep_spacing" not in pipe.scheduler.config
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_sd_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.sd_pipeline'`.

- [ ] **Step 3: Implement `src/modules/sd_pipeline.py`**

`load_sd` tries each repo in `SD_REPO_CANDIDATES` in order, catching the load error and moving on, raising only when all fail; it disables the safety checker, calls `enable_attention_slicing()` and `enable_vae_slicing()` (8 GB), and captures `dict(pipe.scheduler.config)` before returning. `set_scheduler` must accept an injectable scheduler class lookup or construct via `SCHEDULER_CLASSES[name].from_config(...)` so the stub test can exercise it.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_sd_pipeline.py -v`
Expected: PASS, 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sd_pipeline.py tests/test_sd_pipeline.py
git commit -m "feat: add SD pipeline loading and config-preserving scheduler swaps"
```

---

### Task 5: Explicit `prompt_embeds` conditioning

**Files:**
- Create: `src/modules/conditioning.py`
- Create: `tests/test_conditioning.py`

**Interfaces:**
- Consumes: `clip_embeddings.load_sd_text_encoder`, `cfg.CLIP_MAX_TOKENS`.
- Produces:
  - `encode_prompts(prompts: list[str], tokenizer, text_encoder, device=None, dtype=None) -> torch.Tensor` of shape `(N, 77, 768)`.
  - `conditioning_pair(prompts, tokenizer, text_encoder, negative: str | list[str] = "", **kw) -> tuple[Tensor, Tensor]` — positive and negative embeds, the negative broadcast to `len(prompts)`.
  - `max_abs_difference(a: Tensor, b: Tensor) -> float` — the verification number task 9 prints when comparing the explicit path against `prompt=`.

This is spec task 1, the milestone's headline deliverable: our encoder, their UNet.

- [ ] **Step 1: Write the failing test**

A tiny stub tokenizer/encoder keeps this CPU-only and weight-free.

```python
def test_shape_is_the_sd_conditioning_shape():
    out = conditioning.encode_prompts(["a dog", "a cat"], _tok(), _enc())
    assert out.shape == (2, 77, 768)


def test_overlong_prompt_truncates_rather_than_raising():
    out = conditioning.encode_prompts([" ".join(["word"] * 400)], _tok(), _enc())
    assert out.shape == (1, 77, 768)


def test_negative_is_broadcast_to_every_prompt():
    pos, neg = conditioning.conditioning_pair(["a", "b", "c"], _tok(), _enc())
    assert pos.shape == neg.shape == (3, 77, 768)


def test_max_abs_difference_is_zero_for_identical_tensors():
    t = torch.randn(2, 77, 768)
    assert conditioning.max_abs_difference(t, t.clone()) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_conditioning.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.conditioning'`.

- [ ] **Step 3: Implement `src/modules/conditioning.py`**

Tokenize with `padding="max_length", max_length=cfg.CLIP_MAX_TOKENS, truncation=True`, run the encoder under `torch.no_grad()`, return `last_hidden_state` cast to the pipeline dtype. The module docstring explains the integration point — that `prompt=` and `prompt_embeds=` are the same path, and we are taking the second half ourselves.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_conditioning.py -v`
Expected: PASS, 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/conditioning.py tests/test_conditioning.py
git commit -m "feat: add explicit prompt_embeds conditioning"
```

---

### Task 6: Generation config and runner

**Files:**
- Create: `src/modules/generation.py`
- Create: `tests/test_generation.py`

**Interfaces:**
- Consumes: `sd_pipeline.set_scheduler`, `cfg.GEN_BATCH_SIZE`, `cfg.SAMPLERS`.
- Produces:
  - `GenConfig` — a frozen dataclass with `sampler: str`, `steps: int`, `guidance: float`, `guidance_rescale: float = 0.0`, `scheduler_kwargs: tuple[tuple[str, object], ...] = ()`, and a `label` property giving a filesystem-safe identifier (e.g. `dpmpp_s20_g7.5_karras`).
  - `generate(pipe, prompt_embeds, negative_embeds, latents, config: GenConfig, base_config=None, batch_size=None) -> list[PIL.Image]` — batches the prompts, slicing `latents` to match so each prompt keeps its own fixed latent.
  - `batches(n: int, size: int) -> list[slice]`.

- [ ] **Step 1: Write the failing test**

```python
def test_label_is_filesystem_safe_and_distinguishes_configs():
    a = generation.GenConfig("dpmpp", 20, 7.5)
    b = generation.GenConfig("dpmpp", 20, 11.0)
    assert a.label != b.label
    assert not set(a.label) & set('/\\: *?"<>|')


def test_karras_appears_in_the_label():
    c = generation.GenConfig("dpmpp", 20, 7.5, scheduler_kwargs=(("use_karras_sigmas", True),))
    assert "karras" in c.label


def test_batches_cover_every_index_exactly_once():
    assert generation.batches(10, 4) == [slice(0, 4), slice(4, 8), slice(8, 10)]
    assert generation.batches(4, 4) == [slice(0, 4)]
    assert generation.batches(0, 4) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_generation.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.generation'`.

- [ ] **Step 3: Implement `src/modules/generation.py`**

`generate` sets the scheduler from `config`, then for each slice calls the pipe with `prompt_embeds=`, `negative_prompt_embeds=`, `latents=`, `num_inference_steps=`, `guidance_scale=`, `guidance_rescale=` and no `prompt=` anywhere. Latents move to the pipe's device and dtype inside the call, not at construction.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_generation.py -v`
Expected: PASS, 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/generation.py tests/test_generation.py
git commit -m "feat: add generation config and batched runner"
```

---

### Task 7: Sweep grids, scoring and the results table

**Files:**
- Create: `src/modules/sweep.py`
- Create: `tests/test_sweep.py`

**Interfaces:**
- Consumes: `generation.GenConfig`, `generation.generate`, `sanity_checks.clip_scores`, `cfg.CFG_GRID`, `cfg.SAMPLERS`, `cfg.SWEEP_DIR`.
- Produces:
  - `guidance_configs(sampler="pndm", values=None, steps=None) -> list[GenConfig]`
  - `sampler_configs(guidance=7.5, samplers=None) -> list[GenConfig]`
  - `schedule_configs(sampler="dpmpp", guidance=7.5) -> list[GenConfig]` — the `timestep_spacing` × `rescale_betas_zero_snr` × `use_karras_sigmas` combinations from the spec's noise-schedule table.
  - `run_sweep(pipe, configs, prompts, prompt_embeds, negative_embeds, latents, scorer, out_dir=None, base_config=None) -> pd.DataFrame` — one row per config with `label`, `sampler`, `steps`, `guidance`, `clip_score_mean`, `clip_score_std`, `seconds`, `status`. Writes the table to `out_dir` **after every config**, so an OOM on config *k* leaves rows 0..*k*-1 on disk.
  - `summarise(df) -> pd.DataFrame` — the baseline-vs-best comparison, sorted by `clip_score_mean`.

- [ ] **Step 1: Write the failing test**

A fake `scorer` and a fake pipe keep this CPU-only.

```python
def test_guidance_grid_uses_the_configured_values():
    configs = sweep.guidance_configs()
    assert [c.guidance for c in configs] == list(cfg.CFG_GRID)
    assert len({c.label for c in configs}) == len(configs)


def test_sampler_grid_uses_each_sampler_s_own_step_count():
    by_name = {c.sampler: c.steps for c in sweep.sampler_configs()}
    assert by_name == dict(cfg.SAMPLERS)


def test_schedule_grid_varies_only_scheduler_kwargs():
    configs = sweep.schedule_configs()
    assert len({c.guidance for c in configs}) == 1
    assert len({c.scheduler_kwargs for c in configs}) == len(configs)


def test_a_failing_config_is_recorded_and_the_sweep_continues():
    df = sweep.run_sweep(_pipe(), _three_configs(), ..., generate_fn=_raises_on_second)
    assert len(df) == 3
    assert df["status"].tolist() == ["ok", "error", "ok"]
    assert df.loc[1, "clip_score_mean"] != df.loc[1, "clip_score_mean"]  # NaN


def test_rows_are_written_after_each_config(tmp_path):
    sweep.run_sweep(..., out_dir=tmp_path, generate_fn=_raises_on_second)
    assert (tmp_path / "sweep_results.csv").is_file()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_sweep.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.sweep'`.

- [ ] **Step 3: Implement `src/modules/sweep.py`**

`run_sweep` takes `generate_fn` defaulting to `generation.generate` so tests inject a fake. Each config is wrapped in `try/except Exception`, recording `status="error"` and the message, then `torch.cuda.empty_cache()` and on to the next. Images for a config go to `out_dir / config.label /`.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_sweep.py -v`
Expected: PASS, 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/sweep.py tests/test_sweep.py
git commit -m "feat: add sweep grids, scoring and crash-resilient results table"
```

---

### Task 8: Image grids and recording

**Files:**
- Create: `src/modules/recording.py`
- Create: `tests/test_recording.py`

**Interfaces:**
- Consumes: `cfg.SWEEP_DIR`, `cfg.GENERATIONS_DIR`, `utils.rel`.
- Produces:
  - `image_grid(images: list[Image], rows: int | None = None, cols: int | None = None, pad: int = 4) -> Image` — rows/cols inferred when omitted.
  - `save_run(images, labels, name, out_dir=None) -> list[str]` — writes each PNG plus a `grid.png`, returns relative paths.
  - `comparison_grid(rows: dict[str, list[Image]]) -> Image` — one labelled row per config, for baseline-vs-best.

- [ ] **Step 1: Write the failing test**

```python
def test_grid_geometry_for_an_exact_fit():
    g = recording.image_grid([_img(64, 64)] * 6, rows=2, cols=3, pad=0)
    assert g.size == (192, 128)


def test_grid_infers_a_layout_when_not_given_one():
    assert recording.image_grid([_img(32, 32)] * 7, pad=0).size[0] >= 32


def test_a_short_last_row_still_fits():
    g = recording.image_grid([_img(32, 32)] * 5, rows=2, cols=3, pad=0)
    assert g.size == (96, 64)


def test_save_run_writes_every_image_and_a_grid(tmp_path):
    paths = recording.save_run([_img(32, 32)] * 3, ["a", "b", "c"], "demo", out_dir=tmp_path)
    assert len(list(tmp_path.glob("demo/*.png"))) == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_recording.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.recording'`.

- [ ] **Step 3: Implement `src/modules/recording.py`**

Infer `cols = ceil(sqrt(n))` when both are omitted; derive the missing one with `ceil(n / other)`. Paste onto a white canvas sized from the first image.

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_recording.py -v`
Expected: PASS, 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/recording.py tests/test_recording.py
git commit -m "feat: add image grids and run recording"
```

---

### Task 9: The milestone-2 SD 1.5 notebook

**Files:**
- Create: `src/notebooks/milestone_2_sd15.ipynb`
- Modify: `src/modules/__init__.py` (extend the module map in the docstring)

**Interfaces:**
- Consumes: every module from tasks 2–8.
- Produces: `outputs/sweep/sweep_results.csv`, per-config image grids, `outputs/tables/milestone_2_*.json`.

This is the only GPU-dependent deliverable, and the one that satisfies spec deliverables 1–7.

- [ ] **Step 1: Write the notebook**

Sections in order, each a markdown cell then a code cell, matching milestone 1's voice:
1. Setup — `sys.path`, `cfg.ensure_dirs()`, `utils.set_seed()`, print GPU name and free VRAM.
2. Load the manifest, select the fixed 10 prompts (`prompts.fixed_prompts`).
3. Load SD 1.5 (`sd_pipeline.load_sd`), print the repo that won and the VRAM cost.
4. **Integration** — `conditioning.conditioning_pair`, generate once with `prompt_embeds=`, generate the same prompt with `prompt=`, print `max_abs_difference` and show both images side by side.
5. **Baseline** — PNDM, 30 steps, CFG 7.5, fixed latents; CLIP score; grid.
6. **CFG sweep** — `sweep.guidance_configs()`, results table, score-vs-guidance plot.
7. **Sampler comparison** — `sweep.sampler_configs()`, table, grid per sampler.
8. **Noise schedule** — `sweep.schedule_configs()`, table.
9. **DDPM illustration** — 2 prompts at `cfg.DDPM_STEPS` vs 20-step DPMSolver++, side by side.
10. **Results** — `sweep.summarise`, baseline-vs-best comparison grid, `utils.save_table`.

- [ ] **Step 2: Verify the notebook's imports resolve without a GPU run**

Run a script that imports every module the notebook uses and constructs the grids with no pipe:
`.venv/Scripts/python.exe -c "import sys; sys.path.insert(0,'src'); from modules import prompts, latents, sd_pipeline, conditioning, generation, sweep, recording; print(len(sweep.sampler_configs()), len(sweep.guidance_configs()), len(sweep.schedule_configs()))"`
Expected: three integers printed, 7 / 5 / 12.

- [ ] **Step 3: Run the full test suite**

Run: `.venv/Scripts/python.exe -m pytest tests/ -q`
Expected: PASS, all tests.

- [ ] **Step 4: Commit**

```bash
git add src/notebooks/milestone_2_sd15.ipynb src/modules/__init__.py
git commit -m "feat: add milestone 2 SD 1.5 notebook"
```

---

### Task 10 *(optional)*: GPT-2 encoder arm

**Files:**
- Create: `src/modules/gpt2_embeddings.py`
- Create: `tests/test_gpt2_embeddings.py`
- Create: `src/notebooks/milestone_2_encoders.ipynb`

**Interfaces:**
- Produces: `load()`, `encode_text(texts, tokenizer, model, ...) -> tuple[np.ndarray, np.ndarray]` (last-token and mean-pooled, each `(N, 768)`), `describe(model)` — the same three-function shape as `bert_embeddings.py`, so `sanity_checks.sibling_gap` takes it with no change.

- [ ] **Step 1: Write the failing test** — `mean_pool` ignores padding; last-token pooling picks the final *non-pad* token, not position −1 (GPT-2 pads right).
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement the module**, mirroring `bert_embeddings.py`. GPT-2 has no pad token: set `tokenizer.pad_token = tokenizer.eos_token`.
- [ ] **Step 4: Run it, confirm it passes.**
- [ ] **Step 5: Write `milestone_2_encoders.ipynb`** — encode the 6,000 captions with CLIP, BERT and GPT-2, call `sanity_checks.sibling_gap`, print the three-row table.
- [ ] **Step 6: Commit.**

---

### Task 11 *(optional)*: aMUSEd and LDM-BERT comparison arms

**Files:**
- Create: `src/modules/arms.py`
- Create: `tests/test_arms.py`
- Create: `src/notebooks/milestone_2_comparison.ipynb`

**Interfaces:**
- Produces: `load_amused()`, `load_ldm_bert()`, `run_arm(pipe, prompts, **kw) -> list[Image]` — a uniform call shape so the notebook scores all three arms with one loop.

- [ ] **Step 1: Write the failing test** — `run_arm` passes only the kwargs an arm's pipeline accepts (aMUSEd has no `num_inference_steps` semantics in common with SD's).
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement `src/modules/arms.py`.** Each loader frees the previous pipe first; 8 GB cannot hold two.
- [ ] **Step 4: Run it, confirm it passes.**
- [ ] **Step 5: Write `milestone_2_comparison.ipynb`** — the same 10 prompts through SD 1.5, LDM-BERT (256 px) and aMUSEd, one CLIP-score table, one comparison grid.
- [ ] **Step 6: Commit.**

"""The sweep: build the grids, run them, record what happened.

Three grids, each isolating one axis. Guidance varies CFG at a fixed sampler.
Sampler varies the sampler at a fixed CFG, each at its own step count -- an equal
step count across samplers would measure the step count, since DPMSolver++ reaches
at 20 steps what PNDM needs 50 for. Schedule varies only the scheduler's config.

`run_sweep` writes the results table after every config, not at the end. On 8 GB a
config can fail with an out-of-memory error partway through a long run, and losing
the twenty configs that already succeeded to the twenty-first is the expensive
mistake. A failure becomes a row with `status="error"` and the sweep carries on.

`generate_fn` and `scorer` are injected so the grid logic can be tested without a
GPU, and so a different arm can be scored by the same code.
"""

import time
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm.auto import tqdm

import config as cfg
from . import generation, recording, sd_pipeline

COLUMNS = [
    "label", "sampler", "steps", "guidance", "guidance_rescale", "scheduler_kwargs",
    "clip_score_mean", "clip_score_std", "seconds", "status", "error",
]


def guidance_configs(sampler="pndm", values=None, steps=None, rescale_above=12.0):
    """CFG swept at one sampler.

    `guidance_rescale` switches on above `rescale_above`, where the spec notes CFG
    starts to oversaturate.
    """
    values = cfg.CFG_GRID if values is None else values
    steps = cfg.SAMPLERS[sampler] if steps is None else steps
    return [
        generation.GenConfig(
            sampler, steps, g,
            guidance_rescale=cfg.GUIDANCE_RESCALE if g > rescale_above else 0.0)
        for g in values
    ]


def sampler_configs(guidance=None, samplers=None):
    """Every sampler at one guidance scale, each at its own step count."""
    guidance = cfg.GUIDANCE if guidance is None else guidance
    samplers = cfg.SAMPLERS if samplers is None else samplers
    return [generation.GenConfig(name, steps, guidance) for name, steps in samplers.items()]


def schedule_configs(sampler=None, guidance=None, steps=None):
    """The noise-schedule product: spacing x zero-SNR x Karras sigmas, one sampler."""
    sampler = cfg.SCHEDULE_SAMPLER if sampler is None else sampler
    guidance = cfg.GUIDANCE if guidance is None else guidance
    steps = cfg.SAMPLERS[sampler] if steps is None else steps

    return [
        generation.GenConfig(sampler, steps, guidance, scheduler_kwargs=(
            ("timestep_spacing", spacing),
            ("rescale_betas_zero_snr", zero_snr),
            ("use_karras_sigmas", karras),
        ))
        for spacing in cfg.TIMESTEP_SPACINGS
        for zero_snr in cfg.ZERO_SNR_OPTIONS
        for karras in cfg.KARRAS_OPTIONS
    ]


def run_sweep(pipe, configs, prompts, prompt_embeds, negative_embeds, latents, scorer,
              out_dir=None, base_config=None, generate_fn=None, batch_size=None,
              save_images=True, table_name="sweep_results"):
    """Render and score every config. Returns one row per config.

    `scorer(images, prompts) -> array` keeps the metric out of this module; the
    notebook passes a CLIP-score closure.
    """
    out_dir = Path(cfg.SWEEP_DIR if out_dir is None else out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    generate_fn = generation.generate if generate_fn is None else generate_fn
    table_path = out_dir / f"{table_name}.csv"

    rows = []
    for config in tqdm(configs, desc="sweep"):
        row = {
            "label": config.label, "sampler": config.sampler, "steps": config.steps,
            "guidance": config.guidance, "guidance_rescale": config.guidance_rescale,
            "scheduler_kwargs": str(dict(config.scheduler_kwargs)),
            "clip_score_mean": np.nan, "clip_score_std": np.nan,
            "status": "ok", "error": "",
        }
        started = time.time()
        try:
            images = generate_fn(pipe, prompt_embeds, negative_embeds, latents, config,
                                 base_config=base_config, batch_size=batch_size)
            scores = np.asarray(scorer(images, prompts), dtype=float)
            row["clip_score_mean"] = float(scores.mean())
            row["clip_score_std"] = float(scores.std())
            if save_images:
                recording.save_run(images, prompts, config.label, out_dir=out_dir)
        except Exception as exc:
            row["status"] = "error"
            row["error"] = f"{type(exc).__name__}: {exc}"
            sd_pipeline.free()

        row["seconds"] = round(time.time() - started, 2)
        rows.append(row)
        pd.DataFrame(rows)[COLUMNS].to_csv(table_path, index=False)

    return pd.DataFrame(rows)[COLUMNS]


def summarise(df, top=None):
    """Successful configs, best CLIP score first."""
    ranked = (df[df["status"] == "ok"]
              .sort_values("clip_score_mean", ascending=False)
              .reset_index(drop=True))
    return ranked if top is None else ranked.head(top)

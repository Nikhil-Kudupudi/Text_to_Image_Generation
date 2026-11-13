import numpy as np
import pandas as pd
import torch
from PIL import Image

import config as cfg
from modules import generation, sweep

BASE = {"beta_schedule": "scaled_linear", "num_train_timesteps": 1000}


def _args(n_prompts=2):
    """The tensor arguments run_sweep threads through to generate_fn."""
    return {
        "prompts": [f"prompt {i}" for i in range(n_prompts)],
        "prompt_embeds": torch.zeros(n_prompts, 77, 768),
        "negative_embeds": torch.zeros(n_prompts, 77, 768),
        "latents": torch.zeros(n_prompts, 4, 64, 64),
    }


def _three_configs():
    return [generation.GenConfig("ddim", 20, g) for g in (1.0, 7.5, 15.0)]


def _images(n):
    return [Image.new("RGB", (8, 8)) for _ in range(n)]


def _ok(pipe, pe, ne, lat, config, **kw):
    return _images(len(pe))


def _raises_on_second(pipe, pe, ne, lat, config, **kw):
    if config.guidance == 7.5:
        raise torch.cuda.OutOfMemoryError("out of memory")
    return _images(len(pe))


def _scorer(images, prompts):
    return np.full(len(images), 0.3)


# ---- grids ----------------------------------------------------------------
def test_guidance_grid_uses_the_configured_values():
    configs = sweep.guidance_configs()
    assert [c.guidance for c in configs] == list(cfg.CFG_GRID)
    assert len({c.label for c in configs}) == len(configs)


def test_sampler_grid_uses_each_samplers_own_step_count():
    assert {c.sampler: c.steps for c in sweep.sampler_configs()} == dict(cfg.SAMPLERS)


def test_sampler_grid_pins_timestep_spacing_so_only_the_sampler_varies():
    """SD 1.5's config omits timestep_spacing, so each class would pick its own default.

    PNDM and DDIM default to `leading` while LMS/Euler/DPM++/UniPC default to `linspace`,
    which would confound the sampler comparison with an axis the schedule grid sweeps.
    """
    spacings = {dict(c.scheduler_kwargs).get("timestep_spacing")
                for c in sweep.sampler_configs()}
    assert spacings == {cfg.BASE_TIMESTEP_SPACING}


def test_guidance_grid_pins_the_same_spacing_as_the_sampler_grid():
    spacings = {dict(c.scheduler_kwargs).get("timestep_spacing")
                for c in sweep.guidance_configs()}
    assert spacings == {cfg.BASE_TIMESTEP_SPACING}


def test_schedule_grid_covers_every_combination_with_unique_labels():
    configs = sweep.schedule_configs()
    expected = len(cfg.TIMESTEP_SPACINGS) * len(cfg.ZERO_SNR_OPTIONS) * len(cfg.KARRAS_OPTIONS)
    assert len(configs) == expected == 12
    assert len({c.label for c in configs}) == expected


def test_schedule_grid_varies_only_the_scheduler_kwargs():
    configs = sweep.schedule_configs()
    assert len({c.guidance for c in configs}) == 1
    assert len({c.sampler for c in configs}) == 1
    assert len({c.scheduler_kwargs for c in configs}) == len(configs)


def test_high_guidance_gets_the_rescale_the_spec_prescribes():
    rescales = {c.guidance: c.guidance_rescale for c in sweep.guidance_configs()}
    assert rescales[15.0] == cfg.GUIDANCE_RESCALE
    assert rescales[7.5] == 0.0


# ---- running --------------------------------------------------------------
def test_every_config_becomes_a_row_with_its_score(tmp_path):
    df = sweep.run_sweep(None, _three_configs(), **_args(), scorer=_scorer,
                         out_dir=tmp_path, base_config=BASE, generate_fn=_ok)
    assert len(df) == 3
    assert df["status"].tolist() == ["ok"] * 3
    assert df["clip_score_mean"].tolist() == [0.3] * 3


def test_a_failing_config_is_recorded_and_the_sweep_continues(tmp_path):
    df = sweep.run_sweep(None, _three_configs(), **_args(), scorer=_scorer,
                         out_dir=tmp_path, base_config=BASE, generate_fn=_raises_on_second)
    assert df["status"].tolist() == ["ok", "error", "ok"]
    assert np.isnan(df.loc[1, "clip_score_mean"])
    assert "out of memory" in df.loc[1, "error"]


def test_each_row_reaches_disk_before_the_next_config_starts(tmp_path):
    """The point of the flush: a kernel death on config k must leave 0..k-1 readable.

    Asserting only that the CSV exists at the end would pass even with the write moved
    outside the loop, so this reads the file from inside each generate call.
    """
    rows_on_disk = []

    def spy(pipe, pe, ne, lat, config, **kw):
        path = tmp_path / "sweep_results.csv"
        rows_on_disk.append(len(pd.read_csv(path)) if path.is_file() else 0)
        return _images(len(pe))

    sweep.run_sweep(None, _three_configs(), **_args(), scorer=_scorer,
                    out_dir=tmp_path, base_config=BASE, generate_fn=spy)
    assert rows_on_disk == [0, 1, 2]


def test_rows_survive_on_disk_when_a_later_config_fails(tmp_path):
    sweep.run_sweep(None, _three_configs(), **_args(), scorer=_scorer,
                    out_dir=tmp_path, base_config=BASE, generate_fn=_raises_on_second)
    written = pd.read_csv(tmp_path / "sweep_results.csv")
    assert len(written) == 3
    assert written["status"].tolist() == ["ok", "error", "ok"]


def test_images_are_written_per_config(tmp_path):
    sweep.run_sweep(None, _three_configs()[:1], **_args(), scorer=_scorer,
                    out_dir=tmp_path, base_config=BASE, generate_fn=_ok)
    label = _three_configs()[0].label
    assert (tmp_path / label / "grid.png").is_file()


# ---- summary --------------------------------------------------------------
def test_summarise_ranks_by_score_and_drops_failures(tmp_path):
    df = sweep.run_sweep(None, _three_configs(), **_args(), scorer=_scorer,
                         out_dir=tmp_path, base_config=BASE, generate_fn=_raises_on_second)
    out = sweep.summarise(df)
    assert "error" not in out["status"].tolist()
    assert out["clip_score_mean"].is_monotonic_decreasing

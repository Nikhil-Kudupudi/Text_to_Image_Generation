import pytest

import config as cfg
from modules import sd_pipeline


class _StubScheduler:
    """Accepts anything, so the swap tests measure `set_scheduler`, not diffusers."""

    def __init__(self, **kwargs):
        self.config = kwargs

    @classmethod
    def from_config(cls, config, **kwargs):
        return cls(**{**config, **kwargs})


class _StubPipe:
    def __init__(self, config):
        self.scheduler = _StubScheduler(**config)


_STUBS = {"ddim": _StubScheduler, "euler": _StubScheduler}


def test_registry_covers_every_configured_sampler():
    assert set(sd_pipeline.SCHEDULER_CLASSES) >= set(cfg.SAMPLERS)


def test_ddpm_is_available_but_is_not_a_sweep_arm():
    """The 1000-step illustration needs the registry; it must not join the sweep."""
    assert "ddpm" in sd_pipeline.SCHEDULER_CLASSES
    assert "ddpm" not in cfg.SAMPLERS


def test_karras_is_kept_only_where_the_scheduler_accepts_it():
    assert sd_pipeline.scheduler_kwargs("dpmpp", use_karras_sigmas=True)["use_karras_sigmas"] is True
    assert "use_karras_sigmas" not in sd_pipeline.scheduler_kwargs("pndm", use_karras_sigmas=True)
    assert "use_karras_sigmas" not in sd_pipeline.scheduler_kwargs("euler_a", use_karras_sigmas=True)


def test_zero_snr_is_dropped_for_a_scheduler_that_cannot_take_it():
    assert "rescale_betas_zero_snr" not in sd_pipeline.scheduler_kwargs("pndm", rescale_betas_zero_snr=True)
    assert sd_pipeline.scheduler_kwargs("ddim", rescale_betas_zero_snr=True)["rescale_betas_zero_snr"] is True


def test_dpmpp_defaults_to_the_plus_plus_algorithm():
    assert sd_pipeline.scheduler_kwargs("dpmpp")["algorithm_type"] == "dpmsolver++"


def test_the_schedule_sweep_sampler_accepts_every_swept_axis():
    kw = sd_pipeline.scheduler_kwargs(
        cfg.SCHEDULE_SAMPLER,
        timestep_spacing="trailing", rescale_betas_zero_snr=True, use_karras_sigmas=True,
    )
    assert set(kw) >= {"timestep_spacing", "rescale_betas_zero_snr", "use_karras_sigmas"}


def test_repeated_swaps_read_the_original_config():
    base = {"beta_schedule": "scaled_linear", "num_train_timesteps": 1000}
    pipe = _StubPipe(base)
    sd_pipeline.set_scheduler(pipe, "ddim", base_config=base, scheduler_classes=_STUBS,
                              timestep_spacing="trailing")
    sd_pipeline.set_scheduler(pipe, "euler", base_config=base, scheduler_classes=_STUBS)
    assert pipe.scheduler.config["beta_schedule"] == "scaled_linear"
    assert "timestep_spacing" not in pipe.scheduler.config


def test_an_unknown_sampler_name_fails_loudly():
    with pytest.raises(KeyError):
        sd_pipeline.scheduler_kwargs("not_a_sampler")


def test_vram_report_works_without_a_gpu():
    report = sd_pipeline.vram_report()
    assert "device" in report

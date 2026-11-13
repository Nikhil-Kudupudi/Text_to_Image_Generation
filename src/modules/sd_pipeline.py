"""Loading Stable Diffusion 1.5 and swapping its sampler without losing its training.

Two things here are easy to get wrong.

**The scheduler swap.** `DDIMScheduler()` constructs a scheduler with *library*
defaults, which are not SD 1.5's -- `beta_schedule` would silently become `linear`
where SD 1.5 trained on `scaled_linear`, and every image would come out wrong for
a reason nothing reports. The swap must go through `from_config`. It must also read
the *original* config each time: swapping twice from `pipe.scheduler.config`
compounds the first swap's overrides into the second.

**What each sampler accepts.** The spec's noise-schedule axes are not universal --
`EulerAncestralDiscreteScheduler` has no `use_karras_sigmas`, `PNDMScheduler` has
no `rescale_betas_zero_snr`. Passing one anyway is a TypeError mid-sweep, so the
accepted set is read from each class's signature rather than hardcoded.

Memory: this targets an 8 GB laptop GPU, so slicing is on by default and `free()`
exists to be called between arms.
"""

import gc
import inspect

import torch
from diffusers import (
    DDIMScheduler,
    DDPMScheduler,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    LMSDiscreteScheduler,
    PNDMScheduler,
    StableDiffusionPipeline,
    UniPCMultistepScheduler,
)

import config as cfg

SCHEDULER_CLASSES = {
    "pndm": PNDMScheduler,
    "ddim": DDIMScheduler,
    "lms": LMSDiscreteScheduler,
    "euler": EulerDiscreteScheduler,
    "euler_a": EulerAncestralDiscreteScheduler,
    "dpmpp": DPMSolverMultistepScheduler,
    "unipc": UniPCMultistepScheduler,
    # Not in cfg.SAMPLERS on purpose: ~1000 steps is 100x the cost of DPMSolver++ for a
    # worse image, so DDPM is a two-prompt illustration rather than a sweep arm.
    "ddpm": DDPMScheduler,
}

SCHEDULER_DEFAULTS = {
    "dpmpp": {"algorithm_type": "dpmsolver++"},
}


def _accepted(scheduler_cls, kwargs):
    """Drop the kwargs this scheduler class cannot take."""
    params = inspect.signature(scheduler_cls.__init__).parameters
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return dict(kwargs)
    return {k: v for k, v in kwargs.items() if k in params}


def scheduler_kwargs(name, scheduler_cls=None, **overrides):
    """This sampler's defaults merged with `overrides`, filtered to what it accepts."""
    cls = SCHEDULER_CLASSES[name] if scheduler_cls is None else scheduler_cls
    return _accepted(cls, {**SCHEDULER_DEFAULTS.get(name, {}), **overrides})


def set_scheduler(pipe, name, base_config=None, scheduler_classes=None, **overrides):
    """Swap `pipe.scheduler` to `name`, rebuilt from SD 1.5's original config.

    Pass `base_config` -- the dict `load_sd` captured at load time -- so a second
    swap does not inherit the first one's overrides.
    """
    classes = SCHEDULER_CLASSES if scheduler_classes is None else scheduler_classes
    cls = classes[name]
    base = dict(pipe.scheduler.config) if base_config is None else dict(base_config)
    pipe.scheduler = cls.from_config(base, **scheduler_kwargs(name, scheduler_cls=cls, **overrides))
    return pipe


def enable_memory_savers(pipe):
    """Turn on the slicing an 8 GB card wants, using whichever API this version has.

    diffusers 0.42 removed the pipeline-level `enable_vae_slicing()` wrapper and left
    the method on the VAE itself, so both are probed rather than assumed.
    """
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    vae = getattr(pipe, "vae", None)
    if hasattr(vae, "enable_slicing"):
        vae.enable_slicing()
    return pipe


def load_sd(repo_candidates=None, device=None, dtype=None, slicing=True):
    """Load SD 1.5. Returns `(pipe, repo_id, base_scheduler_config)`.

    The candidates are tried in order because the original `runwayml` repo was
    withdrawn; `base_scheduler_config` is captured before anything touches the
    scheduler and is what every later swap rebuilds from.
    """
    repo_candidates = cfg.SD_REPO_CANDIDATES if repo_candidates is None else repo_candidates
    device = cfg.DEVICE if device is None else device
    dtype = cfg.SD_DTYPE if dtype is None else dtype

    errors = {}
    for repo in repo_candidates:
        try:
            pipe = StableDiffusionPipeline.from_pretrained(
                repo, torch_dtype=dtype, safety_checker=None, requires_safety_checker=False,
            )
        except Exception as exc:
            errors[repo] = f"{type(exc).__name__}: {exc}"
            continue

        pipe = pipe.to(device)
        pipe.set_progress_bar_config(disable=True)
        if slicing and device.type == "cuda":
            enable_memory_savers(pipe)
        return pipe, repo, dict(pipe.scheduler.config)

    raise RuntimeError("no Stable Diffusion repo could be loaded: " + repr(errors))


def free(*objects):
    """Drop references and return the VRAM, so the next arm has room to load."""
    for obj in objects:
        if hasattr(obj, "to"):
            try:
                obj.to("cpu")
            except Exception:
                pass
        del obj
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()


def vram_report(device=None):
    """Allocated / reserved / total VRAM in GB, for the notebook to print."""
    device = cfg.DEVICE if device is None else device
    if device.type != "cuda":
        return {"device": str(device)}
    props = torch.cuda.get_device_properties(device)
    gb = 1024 ** 3
    return {
        "device": props.name,
        "total_gb": round(props.total_memory / gb, 2),
        "allocated_gb": round(torch.cuda.memory_allocated(device) / gb, 2),
        "reserved_gb": round(torch.cuda.memory_reserved(device) / gb, 2),
        "peak_gb": round(torch.cuda.max_memory_allocated(device) / gb, 2),
    }

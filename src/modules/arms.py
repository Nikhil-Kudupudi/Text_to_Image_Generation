"""The two comparison arms: aMUSEd and LDM-BERT.

**aMUSEd** answers "transformer-only against diffusion" as cleanly as it can be
answered. It uses the same CLIP ViT-L/14 text encoder as SD 1.5, so the encoder is
held fixed and the only thing that changes is how the image is made: SD denoises
continuous latents over ~30 steps, aMUSEd chops the image into discrete tiles, masks
them all, and fills in the blanks over ~12 rounds -- BERT's masked-prediction trick
applied to pictures. No noise, no noise schedule, no samplers.

That also means **the fixed-latent protocol does not transfer**. There is no starting
noise to hold still; aMUSEd's randomness is in which tokens it commits to first. The
arms share the prompts and the seed, not the latents.

**LDM-BERT** is the BERT-conditioned arm, at 256px.

`run_arm` passes only the keyword arguments a pipeline actually declares. The three
pipelines do not share a call signature -- `guidance_rescale` is meaningless to a
masked transformer -- and LDM's signature ends in `**kwargs`, which would swallow a
wrong argument silently rather than raising. Named parameters only, for all of them.
"""

import inspect

from diffusers import AmusedPipeline, LDMTextToImagePipeline

import config as cfg
from . import sd_pipeline

ARMS = {
    "amused": {
        "repo": "amused/amused-256",
        "pipeline": AmusedPipeline,
        "size": 256,
        "kind": "masked transformer",
        "encoder": "CLIP ViT-L/14 -- the same one SD 1.5 uses",
    },
    "ldm_bert": {
        "repo": "CompVis/ldm-text2im-large-256",
        "pipeline": LDMTextToImagePipeline,
        "size": 256,
        "kind": "latent diffusion",
        "encoder": "BERT",
    },
}


def load_arm(name, device=None, dtype=None, previous=None):
    """Load one arm, freeing `previous` first. Returns `(pipe, spec)`.

    8 GB cannot hold two of these at once, so the previous arm goes before this one
    arrives rather than after.
    """
    spec = ARMS[name]
    device = cfg.DEVICE if device is None else device
    dtype = cfg.SD_DTYPE if dtype is None else dtype

    if previous is not None:
        sd_pipeline.free(previous)

    pipe = spec["pipeline"].from_pretrained(spec["repo"], torch_dtype=dtype).to(device)
    pipe.set_progress_bar_config(disable=True)
    sd_pipeline.enable_memory_savers(pipe)
    return pipe, spec


def load_amused(**kwargs):
    return load_arm("amused", **kwargs)


def load_ldm_bert(**kwargs):
    return load_arm("ldm_bert", **kwargs)


def accepted_kwargs(pipe, kwargs):
    """Only the arguments this pipeline names explicitly -- `**kwargs` does not count."""
    params = inspect.signature(pipe.__call__).parameters
    named = {k for k, p in params.items()
             if p.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)}
    return {k: v for k, v in kwargs.items() if k in named}


def run_arm(pipe, prompts, **kwargs):
    """Generate one image per prompt, passing only what this pipeline accepts."""
    return pipe(prompt=list(prompts), **accepted_kwargs(pipe, kwargs)).images

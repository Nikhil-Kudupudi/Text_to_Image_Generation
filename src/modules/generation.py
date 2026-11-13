"""One swept configuration, and the call that renders it.

`GenConfig` is frozen and its `scheduler_kwargs` is a tuple of pairs rather than a
dict, so a config is hashable -- the sweep puts them in sets and uses `label` as a
directory name, and a mutable config would let two runs share an identity.

`generate` is the only place the pipeline is called, and it is called with
`prompt_embeds=` and never `prompt=`: that is the milestone's integration
requirement, enforced in one place rather than trusted across a notebook.

Batching exists for the 8 GB budget. Latents are sliced alongside the embeddings so
prompt *i* keeps its own noise no matter where the batch boundary falls.
"""

from dataclasses import dataclass, field

import config as cfg
from . import sd_pipeline

# Flags read better as a word than as `key=True` in a directory name.
_LABEL_FLAGS = {
    "use_karras_sigmas": "karras",
    "rescale_betas_zero_snr": "zerosnr",
}


@dataclass(frozen=True)
class GenConfig:
    """One point in the sweep: a sampler, a step count, a guidance scale, a schedule."""

    sampler: str
    steps: int
    guidance: float
    guidance_rescale: float = 0.0
    scheduler_kwargs: tuple = field(default=())

    @property
    def label(self):
        """A unique, filesystem-safe identifier, e.g. `dpmpp_s20_g7.5_trailing_karras`."""
        parts = [self.sampler, f"s{self.steps}", f"g{self.guidance:g}"]
        if self.guidance_rescale:
            parts.append(f"r{self.guidance_rescale:g}")
        for key, value in self.scheduler_kwargs:
            if value is True:
                parts.append(_LABEL_FLAGS.get(key, key))
            elif value is not False and value is not None:
                parts.append(str(value))
        return "_".join(parts)


def batches(n, size):
    """`n` indices as consecutive slices of at most `size`."""
    return [slice(i, min(i + size, n)) for i in range(0, n, size)]


def generate(pipe, prompt_embeds, negative_embeds, latents, config, base_config=None,
             batch_size=None, **pipe_kwargs):
    """Render one image per row of `prompt_embeds`. Returns a list of PIL images."""
    batch_size = cfg.GEN_BATCH_SIZE if batch_size is None else batch_size
    sd_pipeline.set_scheduler(pipe, config.sampler, base_config=base_config,
                              **dict(config.scheduler_kwargs))

    device, dtype = pipe.device, pipe.dtype
    images = []
    for part in batches(len(prompt_embeds), batch_size):
        out = pipe(
            prompt_embeds=prompt_embeds[part].to(device=device, dtype=dtype),
            negative_prompt_embeds=negative_embeds[part].to(device=device, dtype=dtype),
            latents=latents[part].to(device=device, dtype=dtype),
            num_inference_steps=config.steps,
            guidance_scale=config.guidance,
            guidance_rescale=config.guidance_rescale,
            **pipe_kwargs,
        )
        images.extend(out.images)
    return images

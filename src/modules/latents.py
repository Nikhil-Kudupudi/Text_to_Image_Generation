"""The starting noise, built once and passed into every run.

Two rules from the milestone-2 protocol, both of which exist because the obvious
alternative is subtly wrong:

1. **Pre-generate the latents.** Fixing the seed is not enough. Ancestral and SDE
   samplers draw extra noise inside the denoising loop, and different samplers
   consume the RNG stream differently, so two configs sharing a seed do not share
   a starting point. Passing the tensor in is the only way to hold it still.

2. **Draw on a CPU generator.** `torch.Generator(device="cuda")` is a different
   RNG stream from `device="cpu"`, so CUDA-seeded runs do not reproduce on another
   machine or another GPU. Milestone 1 used a CUDA generator; this corrects it.

Row *i* is prompt *i*'s noise, for every config, for the whole milestone.
"""

import torch

import config as cfg


def make_latents(n, height=None, width=None, seed=None, channels=4, vae_scale=8,
                 dtype=None, device="cpu"):
    """Noise of shape `(n, channels, height // vae_scale, width // vae_scale)`.

    `vae_scale` is SD's VAE downsampling factor, so a 512x512 image starts from a
    64x64 latent. It is a parameter because the LDM-BERT arm generates at 256.
    """
    height = cfg.IMAGE_SIZE if height is None else height
    width = cfg.IMAGE_SIZE if width is None else width
    seed = cfg.LATENT_SEED if seed is None else seed

    generator = torch.Generator(device="cpu").manual_seed(seed)
    shape = (n, channels, height // vae_scale, width // vae_scale)
    noise = torch.randn(shape, generator=generator)

    return noise.to(device=device, dtype=dtype) if dtype is not None else noise.to(device)

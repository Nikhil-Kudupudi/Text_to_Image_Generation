"""The fixed prompt set every swept config generates.

A sweep is only a sweep if the prompts never move. Every config in milestone 2 --
each guidance scale, each sampler, each noise schedule -- renders this same set
from the same latents, so a difference in CLIP score is a difference in the knob
and nothing else.

Selection is drawn from the curated manifest rather than hand-written, so the
prompts are real COCO captions the encoders have been measured on, and it is
seeded, so the set is identical on every machine and every re-run.
"""

import config as cfg


def fixed_prompts(manifest, n=None, min_words=None, max_words=None, seed=None):
    """Sample `n` captions in the `[min_words, max_words]` band. Returns manifest rows.

    The word band matters: a three-word caption underdetermines the image, so every
    config scores well and the sweep separates nothing. Eighteen words is where CLIP's
    77-token limit starts to bite.
    """
    n = cfg.N_FIXED_PROMPTS if n is None else n
    min_words = cfg.PROMPT_MIN_WORDS if min_words is None else min_words
    max_words = cfg.PROMPT_MAX_WORDS if max_words is None else max_words
    seed = cfg.SEED if seed is None else seed

    eligible = manifest[manifest["n_words"].between(min_words, max_words)]
    if len(eligible) < n:
        raise ValueError(
            f"{n} prompts requested but only {len(eligible)} captions fall in "
            f"{min_words}-{max_words} words"
        )

    # Sorted after sampling so the row order is the manifest's, not the sampler's --
    # two runs that pick the same captions also pair them with the same latents.
    return eligible.sample(n=n, random_state=seed).sort_values("pair_idx").reset_index(drop=True)

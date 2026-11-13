"""Driving the UNet from embeddings we computed ourselves.

This is milestone 2's headline deliverable. Normally you pass `prompt="a dog"` and
the pipeline runs CLIP for you; integrating the encoder explicitly means doing that
half by hand and handing the UNet a `(N, 77, 768)` tensor directly. There is no
`prompt=` anywhere downstream of this module.

Per-token states, not the pooled vector: the UNet cross-attends to each token
position, which is how "a *red* bus" colours the bus rather than tinting the whole
frame. The pooled vector would throw that structure away.

Verifying it worked is `max_abs_difference` against the same prompt run the normal
way. Expect *near*-identical rather than bit-identical -- milestone 1 encodes in
float32 and the pipeline runs float16.

The same code path is what a BERT->CLIP adapter would plug into, which is why it is
a module rather than three lines in a notebook.
"""

import torch

import config as cfg


@torch.no_grad()
def encode_prompts(prompts, tokenizer, text_encoder, device=None, dtype=None):
    """Per-token hidden states, `(len(prompts), 77, 768)`.

    Padding to the full 77 is not optional: the UNet's cross-attention expects the
    fixed sequence length it was trained with.
    """
    device = cfg.DEVICE if device is None else device
    dtype = getattr(text_encoder, "dtype", None) if dtype is None else dtype

    tokens = tokenizer(
        prompts, padding="max_length", max_length=cfg.CLIP_MAX_TOKENS,
        truncation=True, return_tensors="pt",
    ).to(device)

    hidden = text_encoder(**tokens).last_hidden_state
    return hidden.to(dtype) if dtype is not None else hidden


def conditioning_pair(prompts, tokenizer, text_encoder, negative="", **kwargs):
    """Positive and negative embeddings, both `(len(prompts), 77, 768)`.

    Classifier-free guidance needs an unconditional branch of the same length. A
    single string is broadcast; a list is used per prompt.
    """
    negatives = [negative] * len(prompts) if isinstance(negative, str) else list(negative)
    if len(negatives) != len(prompts):
        raise ValueError(f"{len(negatives)} negative prompts for {len(prompts)} prompts")

    return (
        encode_prompts(prompts, tokenizer, text_encoder, **kwargs),
        encode_prompts(negatives, tokenizer, text_encoder, **kwargs),
    )


def max_abs_difference(a, b):
    """Largest absolute element-wise gap between two tensors, as a float."""
    return float((a.float() - b.float()).abs().max())

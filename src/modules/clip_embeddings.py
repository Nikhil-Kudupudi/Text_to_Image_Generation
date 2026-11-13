"""CLIP text and image encoders.

Two checkpoints, doing two different jobs:

  `clip-vit-base-patch32`   pooled 512-d vectors in a space shared by text AND
                            images, so a caption vector and a photo vector are
                            directly comparable. This is what makes the
                            text -> image retrieval check possible.
  `clip-vit-large-patch14`  the exact text encoder Stable Diffusion v1.5 is
                            conditioned on. Its 77 x 768 per-token states are the
                            tensors the UNet cross-attends to -- no substitutes,
                            because a pretrained UNet only understands the space
                            it was trained in.

The conditioning tensor is one vector per token, not one per sentence, because
the generator reads the prompt token by token. That is how "a *red* bus" colours
the bus instead of tinting the whole picture red.
"""

import numpy as np
import torch
from PIL import Image
from tqdm.auto import tqdm
from transformers import CLIPImageProcessor, CLIPModel, CLIPTextModel, CLIPTokenizer

import config as cfg


def pooled(out):
    """Unwrap `get_text_features` / `get_image_features` across transformers versions.

    transformers >= 5 returns a pooling output object; earlier versions return a
    bare tensor. `pooler_output` is ALREADY projected into the joint space --
    applying `model.text_projection` on top of it would be wrong.
    """
    return out.pooler_output if hasattr(out, "pooler_output") else out


# ---------------------------------------------------------------------------
# Joint text + vision model
# ---------------------------------------------------------------------------
def load_joint(model_name=None, device=None, dtype=None):
    """Load the joint-space CLIP. Returns `(tokenizer, model, image_processor)`."""
    model_name = cfg.CLIP_JOINT_MODEL if model_name is None else model_name
    device = cfg.DEVICE if device is None else device
    dtype = cfg.ENCODER_DTYPE if dtype is None else dtype

    tokenizer = CLIPTokenizer.from_pretrained(model_name)
    model = CLIPModel.from_pretrained(model_name).to(device=device, dtype=dtype).eval()
    processor = CLIPImageProcessor.from_pretrained(model_name)
    return tokenizer, model, processor


def token_lengths(texts, tokenizer):
    """Untruncated token count per caption.

    CLIP's positional table stops at 77 tokens, so anything longer is silently
    truncated and the model never sees the end of the caption. Measuring this is
    how we know the word-count filter is already keeping us under the ceiling.
    """
    return np.array([len(tokenizer(t, truncation=False)["input_ids"]) for t in texts])


@torch.no_grad()
def encode_text(texts, tokenizer, model, batch_size=None, max_tokens=None, device=None):
    """Pooled 512-d vectors in CLIP's shared text/image space. Returns (N, 512) float32."""
    batch_size = cfg.BATCH_SIZE if batch_size is None else batch_size
    max_tokens = cfg.CLIP_MAX_TOKENS if max_tokens is None else max_tokens
    device = cfg.DEVICE if device is None else device

    out = []
    for i in tqdm(range(0, len(texts), batch_size), desc="CLIP joint-space"):
        toks = tokenizer(
            texts[i:i + batch_size], padding="max_length", max_length=max_tokens,
            truncation=True, return_tensors="pt",
        ).to(device)
        out.append(pooled(model.get_text_features(**toks)).float().cpu())
    return torch.cat(out).numpy()


@torch.no_grad()
def encode_images(images, processor, model, batch_size=32, device=None, progress=True):
    """Pooled 512-d image vectors in the same space as `encode_text`.

    `images` may be paths or already-open PIL images.
    """
    device = cfg.DEVICE if device is None else device
    out = []
    steps = range(0, len(images), batch_size)
    for i in tqdm(steps, desc="CLIP image encode", disable=not progress):
        batch = [
            img if isinstance(img, Image.Image) else Image.open(img)
            for img in images[i:i + batch_size]
        ]
        batch = [img.convert("RGB") for img in batch]
        px = processor(images=batch, return_tensors="pt").to(device)
        out.append(pooled(model.get_image_features(**px)).float().cpu())
    return torch.cat(out).numpy()


# ---------------------------------------------------------------------------
# Stable Diffusion conditioning encoder
# ---------------------------------------------------------------------------
def load_sd_text_encoder(model_name=None, device=None, dtype=None):
    """Load the text encoder SD v1.5 is conditioned on. Returns `(tokenizer, model)`."""
    model_name = cfg.CLIP_SD_MODEL if model_name is None else model_name
    device = cfg.DEVICE if device is None else device
    dtype = cfg.ENCODER_DTYPE if dtype is None else dtype

    tokenizer = CLIPTokenizer.from_pretrained(model_name)
    model = CLIPTextModel.from_pretrained(model_name).to(device=device, dtype=dtype).eval()
    return tokenizer, model


@torch.no_grad()
def encode_sequence(texts, tokenizer, model, batch_size=None, max_tokens=None, device=None):
    """Per-token hidden states (N, 77, 768) plus the pooled EOS vector (N, 768).

    The sequence tensor comes back as float16 -- it is ~710 MB at 6,000 captions
    in float32, and halving it costs nothing we can measure downstream.
    """
    batch_size = cfg.BATCH_SIZE if batch_size is None else batch_size
    max_tokens = cfg.CLIP_MAX_TOKENS if max_tokens is None else max_tokens
    device = cfg.DEVICE if device is None else device

    seq_out, pool_out = [], []
    for i in tqdm(range(0, len(texts), batch_size), desc="CLIP sequence"):
        toks = tokenizer(
            texts[i:i + batch_size], padding="max_length", max_length=max_tokens,
            truncation=True, return_tensors="pt",
        ).to(device)
        out = model(**toks)
        seq_out.append(out.last_hidden_state.to(torch.float16).cpu())
        pool_out.append(out.pooler_output.float().cpu())
    return torch.cat(seq_out).numpy(), torch.cat(pool_out).numpy()


def describe(model):
    """Parameter and layer counts, for the notebook to print after loading."""
    config = model.config
    out = {"parameters_millions": sum(p.numel() for p in model.parameters()) / 1e6}
    if hasattr(config, "text_config"):
        out["text_hidden_size"] = config.text_config.hidden_size
        out["vision_hidden_size"] = config.vision_config.hidden_size
        out["joint_projection_dim"] = config.projection_dim
    else:
        out["hidden_size"] = config.hidden_size
        out["layers"] = config.num_hidden_layers
    return out

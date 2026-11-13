"""GPT-2 text encoder -- the autoregressive comparison.

The third row of the encoder table, and the point the write-up turns on: CLIP's text
tower is **also causally masked**, so what separates CLIP from GPT-2 is not the
attention pattern but the training objective -- contrastive image-text matching
against next-token prediction. If masking were the explanation, these two rows would
look alike.

Pooling needs care for a causal model. Only the **last** token has attended to the
whole sentence, so it is the natural sentence vector -- but GPT-2 pads on the right,
so position -1 is usually padding, not the sentence. `last_token_pool` finds the last
real token instead. Mean pooling is reported alongside it because a causal model's
early positions have seen almost nothing, which tends to drag the mean toward the
first few words.

GPT-2 ships no padding token, so `load` points it at the EOS token. That is the
standard recipe and it is harmless here: every padded position is masked out of both
poolings.

Same three functions as `bert_embeddings`, so `sanity_checks.sibling_gap` takes this
encoder with no change.
"""

import torch
from tqdm.auto import tqdm
from transformers import AutoModel, AutoTokenizer

import config as cfg
from .bert_embeddings import mean_pool


def load(model_name=None, device=None, dtype=None):
    """Load GPT-2. Returns `(tokenizer, model)`."""
    model_name = cfg.GPT2_MODEL if model_name is None else model_name
    device = cfg.DEVICE if device is None else device
    dtype = cfg.ENCODER_DTYPE if dtype is None else dtype

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModel.from_pretrained(model_name).to(device=device, dtype=dtype).eval()
    return tokenizer, model


def last_token_pool(last_hidden_state, attention_mask):
    """The final *non-padding* token's hidden state, one vector per sequence."""
    lengths = attention_mask.sum(dim=1)
    index = (lengths - 1).clamp(min=0).to(last_hidden_state.device)
    return last_hidden_state[torch.arange(len(last_hidden_state), device=last_hidden_state.device), index]


@torch.no_grad()
def encode_text(texts, tokenizer, model, batch_size=None, max_tokens=None, device=None):
    """Encode captions two ways. Returns `(last, mean)`, each (N, 768) float32."""
    batch_size = cfg.BATCH_SIZE if batch_size is None else batch_size
    max_tokens = cfg.GPT2_MAX_TOKENS if max_tokens is None else max_tokens
    device = cfg.DEVICE if device is None else device

    last_out, mean_out = [], []
    for i in tqdm(range(0, len(texts), batch_size), desc="GPT-2"):
        toks = tokenizer(
            texts[i:i + batch_size], padding="max_length", max_length=max_tokens,
            truncation=True, return_tensors="pt",
        ).to(device)
        hidden = model(**toks).last_hidden_state
        last_out.append(last_token_pool(hidden, toks["attention_mask"]).float().cpu())
        mean_out.append(mean_pool(hidden, toks["attention_mask"]).float().cpu())
    return torch.cat(last_out).numpy(), torch.cat(mean_out).numpy()


def describe(model):
    """Parameter, layer and vocab counts, for the notebook to print after loading."""
    config = model.config
    return {
        "hidden_size": config.n_embd,
        "layers": config.n_layer,
        "vocab_size": config.vocab_size,
        "parameters_millions": sum(p.numel() for p in model.parameters()) / 1e6,
    }

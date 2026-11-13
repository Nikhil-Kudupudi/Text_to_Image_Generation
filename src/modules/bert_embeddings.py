"""BERT text encoder -- the comparison encoder.

`bert-base-uncased` is the same architecture class and roughly the same size as
CLIP's text tower, but trained with masked language modelling on text alone. It
has never seen an image. That difference is the point: both produce 768-d
sentence vectors that look equally reasonable on paper, so the only way to tell
them apart is to measure them, which is what `sanity_checks` does.

Pooling: BERT ships a `pooler_output`, but it is the tanh-projected [CLS] state
trained for next-sentence prediction, not for sentence similarity -- using it as
a sentence embedding is a well-documented trap. We compute two honest
alternatives instead, and prefer mean pooling when they disagree.

Swapping in a different text encoder means writing a file like this one with the
same two functions and changing one call in the notebook.
"""

import torch
from tqdm.auto import tqdm
from transformers import AutoModel, AutoTokenizer

import config as cfg


def load(model_name=None, device=None, dtype=None):
    """Load BERT. Returns `(tokenizer, model)`."""
    model_name = cfg.BERT_MODEL if model_name is None else model_name
    device = cfg.DEVICE if device is None else device
    dtype = cfg.ENCODER_DTYPE if dtype is None else dtype

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name).to(device=device, dtype=dtype).eval()
    return tokenizer, model


def mean_pool(last_hidden_state, attention_mask):
    """Mask-aware mean over the token dimension, so padding contributes nothing."""
    mask = attention_mask.unsqueeze(-1).to(last_hidden_state.dtype)
    return (last_hidden_state * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)


@torch.no_grad()
def encode_text(texts, tokenizer, model, batch_size=None, max_tokens=None, device=None):
    """Encode captions two ways. Returns `(cls, mean)`, each (N, 768) float32.

    `cls`  -- the first token's final hidden state, raw.
    `mean` -- the attention-mask-weighted mean over all real tokens, the standard
              recipe for sentence similarity from an MLM encoder.
    """
    batch_size = cfg.BATCH_SIZE if batch_size is None else batch_size
    max_tokens = cfg.BERT_MAX_TOKENS if max_tokens is None else max_tokens
    device = cfg.DEVICE if device is None else device

    cls_out, mean_out = [], []
    for i in tqdm(range(0, len(texts), batch_size), desc="BERT"):
        toks = tokenizer(
            texts[i:i + batch_size], padding="max_length", max_length=max_tokens,
            truncation=True, return_tensors="pt",
        ).to(device)
        hidden = model(**toks).last_hidden_state
        cls_out.append(hidden[:, 0].float().cpu())
        mean_out.append(mean_pool(hidden, toks["attention_mask"]).float().cpu())
    return torch.cat(cls_out).numpy(), torch.cat(mean_out).numpy()


def describe(model):
    """Parameter, layer and vocab counts, for the notebook to print after loading."""
    return {
        "hidden_size": model.config.hidden_size,
        "layers": model.config.num_hidden_layers,
        "vocab_size": model.config.vocab_size,
        "parameters_millions": sum(p.numel() for p in model.parameters()) / 1e6,
    }

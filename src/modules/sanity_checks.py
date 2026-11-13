"""Checks that the embeddings are **meaningful**, not merely well-formed.

Matching shapes prove nothing on their own -- a bug that encoded the same caption
6,000 times would pass a shape check. Four checks, cheapest first:

  1. `embedding_health`  expected dimensions, no NaN/Inf, sane vector norms.
  2. `retrieval`         the real test: does each caption retrieve *its own* image
                         out of 500? Chance is 1/500 = 0.2%.
  3. `sibling_gap`       the two captions of one image describe the same scene, so
                         they should land closer together than two random
                         captions. Needs no image tower, so BERT can take part --
                         which is what makes the CLIP-vs-BERT comparison possible.
  4. `top_neighbours`    the qualitative read: what does each encoder think is
                         similar?

These return numbers. Plotting stays in the notebook, where the figures appear.
"""

import numpy as np
import torch
import torch.nn.functional as F

import config as cfg


def expected_shapes(n_rows, save_seq_embeddings=None):
    """The shape every array should have, given the manifest row count."""
    save_seq = cfg.SAVE_SEQ_EMBEDDINGS if save_seq_embeddings is None else save_seq_embeddings
    expected = {
        "clip_text_joint": (n_rows, 512),
        "clip_sd_pooled": (n_rows, 768),
        "bert_cls": (n_rows, 768),
        "bert_mean": (n_rows, 768),
    }
    if save_seq:
        expected["clip_sd_sequence"] = (n_rows, cfg.CLIP_MAX_TOKENS, 768)
    return expected


def embedding_health(arrays, expected):
    """Shape, finiteness and norm statistics per array.

    Returns `(report, all_ok)`.
    """
    report, all_ok = {}, True
    for name, array in arrays.items():
        a32 = array.astype(np.float32)
        shape_ok = array.shape == expected[name]
        finite = bool(np.isfinite(a32).all())
        norms = np.linalg.norm(a32.reshape(len(a32), -1), axis=1)
        all_ok &= shape_ok and finite
        report[name] = {
            "shape": list(array.shape),
            "expected": list(expected[name]),
            "dtype": str(array.dtype),
            "shape_ok": shape_ok,
            "all_finite": finite,
            "norm_mean": float(norms.mean()),
            "norm_std": float(norms.std()),
        }
    return report, bool(all_ok)


def retrieval(text_emb, image_emb):
    """Text -> image retrieval over a square set of caption/image pairs.

    Retrieval needs exactly one correct answer per query, so the caller passes the
    first caption of each image only -- otherwise two queries compete for the same
    target.

    Returns a dict with the metrics plus the raw `sim`, `ranks`, `matched` and
    `mismatched` arrays, so the notebook can plot them without recomputing.
    """
    txt = F.normalize(torch.from_numpy(text_emb.astype(np.float32)), dim=-1)
    img = F.normalize(torch.from_numpy(image_emb.astype(np.float32)), dim=-1)
    sim = (txt @ img.T).numpy()                   # (n, n): rows = captions, cols = images

    n = len(sim)
    ranks = (-sim).argsort(axis=1)
    rank_of_gt = np.array([int(np.where(ranks[i] == i)[0][0]) for i in range(n)])
    r1, r5, r10 = (float((rank_of_gt < k).mean()) for k in (1, 5, 10))
    chance = 1.0 / n

    gt = np.arange(n)
    matched, mismatched = sim[gt, gt], sim[~np.eye(n, dtype=bool)]

    return {
        "n_queries": int(n),
        "recall_at_1": r1, "recall_at_5": r5, "recall_at_10": r10,
        "chance": chance,
        "times_better_than_chance": float(r1 / chance),
        "median_rank_of_correct_image": int(np.median(rank_of_gt)) + 1,
        "cosine_matched_mean": float(matched.mean()),
        "cosine_matched_std": float(matched.std()),
        "cosine_mismatched_mean": float(mismatched.mean()),
        "cosine_mismatched_std": float(mismatched.std()),
        "separation": float(matched.mean() - mismatched.mean()),
        # raw arrays, for plotting
        "sim": sim, "ranks": ranks, "matched": matched, "mismatched": mismatched,
    }


def sibling_gap(encoders, pair_a, pair_b, rng=None):
    """Sibling-caption agreement per encoder.

    A larger gap means the encoder places two descriptions of one scene closer
    together than two unrelated captions -- it is encoding meaning rather than
    surface word overlap. A high sibling cosine with an equally high random cosine
    means the opposite: everything is mapped into a narrow cone, so the rankings
    carry little information. Watch for that on the [CLS] row.

    Returns `{label: {"sibling_cos": .., "random_cos": .., "gap": ..}}`.
    """
    rng = np.random.default_rng(cfg.SEED) if rng is None else rng
    shuffled = rng.permutation(len(pair_b))

    scores = {}
    for label, emb in encoders.items():
        v = F.normalize(torch.from_numpy(emb.astype(np.float32)), dim=-1)
        sib = (v[pair_a] * v[pair_b]).sum(-1).numpy()
        rnd = (v[pair_a] * v[pair_b][shuffled]).sum(-1).numpy()
        scores[label] = {
            "sibling_cos": float(sib.mean()),
            "random_cos": float(rnd.mean()),
            "gap": float(sib.mean() - rnd.mean()),
        }
    return scores


def top_neighbours(emb, query_idx, k=5):
    """The `k` captions nearest to `query_idx` in this encoder's space.

    Returns `(indices, similarities)`. The query itself is excluded.
    """
    v = F.normalize(torch.from_numpy(emb.astype(np.float32)), dim=-1)
    sims = (v[query_idx] @ v.T).numpy()
    sims[query_idx] = -np.inf
    idx = sims.argsort()[::-1][:k]
    return idx, sims[idx]


def clip_scores(prompts, generated_images, real_images, tokenizer, model, processor, device=None):
    """CLIP cosine similarity for a batch of generation runs.

    Returns `(text_vs_generated, text_vs_real, generated_vs_real)`, each (N,).

    Every number is a cosine in CLIP's joint space. Text-image scores sit in a
    narrow band in practice -- roughly 0.25-0.35 for a caption and an image that
    genuinely match, around 0.1 for an unrelated pair. `generated_vs_real` is on a
    different scale entirely and runs much higher, because two images share far
    more structure with each other than a sentence ever shares with an image;
    compare it across rows, never against the first two.
    """
    from .clip_embeddings import encode_images, pooled   # local import: avoids a cycle at import time

    device = cfg.DEVICE if device is None else device
    with torch.no_grad():
        toks = tokenizer(prompts, padding="max_length", max_length=cfg.CLIP_MAX_TOKENS,
                         truncation=True, return_tensors="pt").to(device)
        t_emb = F.normalize(pooled(model.get_text_features(**toks)).float().cpu(), dim=-1)

    g_emb = F.normalize(torch.from_numpy(
        encode_images(generated_images, processor, model, device=device, progress=False)), dim=-1)
    r_emb = F.normalize(torch.from_numpy(
        encode_images(real_images, processor, model, device=device, progress=False)), dim=-1)

    return (
        (t_emb * g_emb).sum(-1).numpy(),
        (t_emb * r_emb).sum(-1).numpy(),
        (g_emb * r_emb).sum(-1).numpy(),
    )

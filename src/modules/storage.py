"""Everything that touches disk: the manifest, the .npy arrays, metadata, and the
cache logic that lets a re-run skip work it has already done.

The contract these functions enforce: **row *i* of every .npy file is the caption
at `pair_idx == i` in `pairs.parquet`.** One join key, checked before anything is
written and verified by a round-trip read afterwards.

    data/processed/
    |-- pairs.parquet            the curated manifest
    |-- pairs.csv                the same, human-readable
    |-- metadata.json            provenance: models, config, shapes, versions, timings
    |-- images_512/              512x512 RGB JPEG cache
    `-- embeddings/
        |-- clip_text_joint.npy  (N, 512)  float32   shared text/image space
        |-- clip_sd_pooled.npy   (N, 768)  float32   SD v1.5 text encoder, pooled
        |-- bert_cls.npy         (N, 768)  float32   [CLS] token
        `-- bert_mean.npy        (N, 768)  float32   mean-pooled

Figures and summary tables go somewhere separate, under `outputs/`, because they
describe a *run* rather than the dataset itself.

Every path comes from `config.py` -- change `EMB_DIR` there and everything here
follows.
"""

import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

import config as cfg
from utils import rel

MANIFEST_COLUMNS = [
    "pair_idx", "image_id", "ann_id", "cap_rank", "file_name",
    "caption_raw", "caption", "n_words", "n_chars",
    "height", "width", "image_path", "image_512_path",
]

# One row per retrieval image rather than one per pair, so it is exempt from the
# row-count check that flags stale arrays.
NON_PAIR_ARRAYS = {"clip_image_align"}


# ---------------------------------------------------------------------------
# Cache validity
# ---------------------------------------------------------------------------
def subset_fingerprint(captions, n_images=None, captions_per_image=None, seed=None):
    """A short hash of the exact caption list plus the settings that shape it.

    Cached arrays are reused only when this matches, so changing `N_IMAGES`, the
    cleaning rules or `SEED` throws the cache out automatically. Without it, a
    re-run could quietly pair new captions with old vectors.
    """
    n_images = cfg.N_IMAGES if n_images is None else n_images
    captions_per_image = cfg.CAPTIONS_PER_IMAGE if captions_per_image is None else captions_per_image
    seed = cfg.SEED if seed is None else seed

    src = "\n".join(captions) + f"|{n_images}|{captions_per_image}|{seed}"
    return hashlib.sha256(src.encode("utf-8")).hexdigest()[:16]


def cache_is_usable(fingerprint, previous_metadata=None, reuse=None, force_recompute=None):
    """Whether cached embeddings may be reused for this run."""
    reuse = cfg.REUSE_EXISTING if reuse is None else reuse
    force_recompute = cfg.FORCE_RECOMPUTE if force_recompute is None else force_recompute
    previous = (previous_metadata or {}).get("subset_fingerprint")
    return bool(reuse and not force_recompute and previous == fingerprint)


# ---------------------------------------------------------------------------
# Embedding arrays
# ---------------------------------------------------------------------------
def embedding_path(name, emb_dir=None):
    return (cfg.EMB_DIR if emb_dir is None else Path(emb_dir)) / f"{name}.npy"


def save_embedding(name, array, emb_dir=None):
    path = embedding_path(name, emb_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, array)
    return path


def load_embedding(name, emb_dir=None, mmap=False):
    return np.load(embedding_path(name, emb_dir), mmap_mode="r" if mmap else None)


def load_or_encode(names, encode_fn, n_rows, cache_usable=False, save=True,
                   reuse_log=None, emb_dir=None):
    """Return the named arrays, loading them from disk when a valid cache exists.

    `encode_fn` is only called on a miss, and its results are saved immediately so
    that a failure further down never throws away encoding work.

    Returns `(*arrays, elapsed_seconds)`; elapsed is 0.0 on a cache hit.
    """
    reuse_log = {} if reuse_log is None else reuse_log
    paths = [embedding_path(n, emb_dir) for n in names]

    if cache_usable and all(p.is_file() for p in paths):
        arrays = [np.load(p) for p in paths]
        if all(len(a) == n_rows for a in arrays):
            print(f"Reusing cached: {', '.join(p.name for p in paths)}")
            reuse_log.update({n: "reused" for n in names})
            return (*arrays, 0.0)
        print("  cached arrays have the wrong row count -- recomputing")

    t0 = time.time()
    result = encode_fn()
    arrays = list(result) if isinstance(result, tuple) else [result]
    elapsed = time.time() - t0

    for name, array in zip(names, arrays):
        if save:
            save_embedding(name, array, emb_dir)
            reuse_log[name] = "computed"
        else:
            reuse_log[name] = "computed (not saved)"
    return (*arrays, elapsed)


def save_arrays(arrays, manifest, emb_dir=None):
    """Write every array, each row-checked against the manifest first.

    Returns a list of `(name, shape, dtype, megabytes)` for the notebook to print.
    """
    rows = []
    for name, array in arrays.items():
        assert len(array) == len(manifest), (
            f"{name} has {len(array)} rows but the manifest has {len(manifest)}"
        )
        save_embedding(name, array, emb_dir)
        rows.append((name, array.shape, str(array.dtype), array.nbytes / 1024 ** 2))
    return rows


def find_stale(arrays, n_rows, emb_dir=None):
    """Arrays on disk left over from an earlier run with a different subset size.

    Reported, never deleted -- throwing away someone else's work on a path guess
    is not this function's call to make.
    """
    emb_dir = cfg.EMB_DIR if emb_dir is None else Path(emb_dir)
    stale = []
    for p in sorted(emb_dir.glob("*.npy")):
        if p.stem in arrays or p.stem in NON_PAIR_ARRAYS:
            continue
        shape = np.load(p, mmap_mode="r").shape
        if shape[0] != n_rows:
            stale.append((rel(p), shape, p.stat().st_size / 1024 ** 2))
    return stale


def existing_embeddings(emb_dir=None):
    """What is already on disk, for the "what will this run cost" report."""
    emb_dir = cfg.EMB_DIR if emb_dir is None else Path(emb_dir)
    if not emb_dir.is_dir():
        return []
    return [
        (p.name, np.load(p, mmap_mode="r").shape, p.stat().st_size / 1024 ** 2)
        for p in sorted(emb_dir.glob("*.npy"))
    ]


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
def write_manifest(subset, parquet_path=None, csv_path=None):
    """Write the manifest in the exact row order of the embedding arrays.

    Image paths are stored relative to the project root, so the artefacts stay
    portable across machines.
    """
    parquet_path = cfg.MANIFEST_PARQUET if parquet_path is None else Path(parquet_path)
    csv_path = cfg.MANIFEST_CSV if csv_path is None else Path(csv_path)
    parquet_path.parent.mkdir(parents=True, exist_ok=True)

    manifest = subset[MANIFEST_COLUMNS].copy()
    for col in ("image_path", "image_512_path"):
        manifest[col] = manifest[col].map(rel)

    manifest.to_parquet(parquet_path, index=False)
    manifest.to_csv(csv_path, index=False, encoding="utf-8")
    return manifest


def read_manifest(parquet_path=None):
    return pd.read_parquet(cfg.MANIFEST_PARQUET if parquet_path is None else parquet_path)


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------
def load_metadata(path=None):
    """The previous run's metadata, or None if there is none."""
    path = cfg.METADATA_FILE if path is None else Path(path)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_metadata(metadata, path=None):
    path = cfg.METADATA_FILE if path is None else Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    return path


def build_metadata(manifest, arrays, dataset_counts, cleaning_steps, timings,
                   fingerprint, reuse_log, not_persisted=None):
    """Assemble the provenance record.

    The config-derived sections are read straight from `config.py`; the caller
    supplies only the numbers that come out of the run itself.
    """
    import diffusers
    import torch
    import transformers

    return {
        "dataset": {
            "name": "COCO 2017 Captions",
            "split": "val2017",
            "annotations_file": rel(cfg.ANN_FILE),
            **dataset_counts,
            "n_curated_pairs": int(len(manifest)),
            "n_distinct_images": int(manifest["image_id"].nunique()),
            "captions_per_image": cfg.CAPTIONS_PER_IMAGE,
        },
        "image_preprocessing": {
            "size": [cfg.IMAGE_SIZE, cfg.IMAGE_SIZE],
            "mode": "RGB",
            "resize": "aspect-preserving shorter-side resize + centre crop (PIL ImageOps.fit, bicubic)",
            "exif_transpose": True,
            "normalisations": {"display_and_metrics": "[0, 1]", "sd_vae": "[-1, 1] via Normalize(0.5, 0.5)"},
            "cache_dir": rel(cfg.IMAGES_512_DIR),
        },
        "caption_cleaning": {
            "steps": list(cleaning_steps),
            "filters": {
                "min_words": cfg.MIN_WORDS, "max_words": cfg.MAX_WORDS,
                "min_chars": cfg.MIN_CHARS, "max_chars": cfg.MAX_CHARS,
                "drop_empty": True, "drop_duplicates": True, "drop_missing_image": True,
            },
            "stopwords": "not removed -- see the note in section 4",
        },
        "embeddings": {n: {"shape": list(a.shape), "dtype": str(a.dtype)} for n, a in arrays.items()},
        "embeddings_not_persisted": not_persisted or {},
        "models": {
            "clip_joint": cfg.CLIP_JOINT_MODEL,
            "clip_sd_text_encoder": cfg.CLIP_SD_MODEL,
            "bert": cfg.BERT_MODEL,
            "clip_max_tokens": cfg.CLIP_MAX_TOKENS,
            "bert_max_tokens": cfg.BERT_MAX_TOKENS,
            "encoder_dtype": str(cfg.ENCODER_DTYPE),
        },
        "encode_seconds": {k: round(v, 1) for k, v in timings.items()},
        "versions": {
            "python": sys.version.split()[0],
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "diffusers": diffusers.__version__,
        },
        "seed": cfg.SEED,
        "subset_fingerprint": fingerprint,   # guards cache reuse on the next run
        "cache_status": dict(reuse_log),
    }


# ---------------------------------------------------------------------------
# Round trip
# ---------------------------------------------------------------------------
def verify_round_trip(manifest, arrays, check=("clip_text_joint", "bert_mean")):
    """Reload from disk and confirm it matches what is in memory.

    Without this, a silent write failure would only surface in a later notebook.
    Returns a small summary dict; raises AssertionError if anything disagrees.
    """
    reloaded = read_manifest()
    assert len(reloaded) == len(manifest), "manifest row count changed on the round trip"
    assert reloaded["pair_idx"].tolist() == list(range(len(reloaded))), "pair_idx is not contiguous"

    for name in check:
        on_disk = load_embedding(name)
        assert np.array_equal(on_disk, arrays[name]), f"{name} does not match what was written"

    probe = reloaded.iloc[min(7, len(reloaded) - 1)]
    return {
        "manifest_rows": int(len(reloaded)),
        "arrays_checked": list(check),
        "probe_caption": probe["caption"],
        "probe_image": probe["image_512_path"],
    }

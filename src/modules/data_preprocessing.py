"""Caption cleaning, subset construction and image preprocessing.

Three stages, in the order the notebook runs them:

  1. `clean_captions` normalises raw COCO text; `filter_captions` drops the rows
     that are empty, duplicated, too short, too long, or whose image is missing.
  2. `build_subset` makes the deterministic N_IMAGES x CAPTIONS_PER_IMAGE
     selection and assigns `pair_idx`, the join key everything downstream uses.
  3. `preprocess_image` turns one photo into a 512x512 RGB image, with
     `resize_image` and `normalize_pixels` underneath it;
     `cache_resized_images` runs it over the whole subset and caches the result.
"""

import html
import re
import time
import unicodedata
from pathlib import Path

import numpy as np
from ftfy import fix_text
from PIL import Image, ImageOps
from torchvision.transforms import functional as TF
from tqdm.auto import tqdm

import config as cfg

# ---------------------------------------------------------------------------
# 1. Caption cleaning
# ---------------------------------------------------------------------------
# Regexes rather than hand-written character lists, because a whitelist removes
# every character we did NOT think of -- emoji, currency symbols, stray Unicode --
# whereas a blacklist only removes the ones someone remembered.
_HTML_TAG = re.compile(r"<[^>]+>")
_URL = re.compile(r"(?:https?://|www\.)\S+")
_SQUOTES = re.compile(r"[‘’‚‛′`]")          # curly single quotes -> '
_DQUOTES = re.compile(r"[“”„″]")                 # curly double quotes -> "
_DASHES = re.compile(r"[‐-―−]")                       # en / em / figure dashes -> -
_ALLOWED = re.compile(r"[^a-z0-9\s'.,!?-]")                          # whitelist: everything else -> space
_MULTI_PUNCT = re.compile(r"([.,!?-])\1+")                           # "!!!" -> "!"
_SPACE_PUNCT = re.compile(r"\s+([.,!?])")                            # "cat ." -> "cat."
_WHITESPACE = re.compile(r"\s+")                                     # any run of whitespace -> " "

CLEANING_STEPS = [
    "ftfy mojibake repair", "html unescape + tag strip", "url removal",
    "typographic folding (regex)", "unicode NFKD + ascii fold", "lowercase + strip",
    "whitelist regex", "punctuation collapse", "whitespace -> single space",
]


def clean_caption(text):
    """Normalise one raw COCO caption into clean, tokenizer-safe lowercase text.

    Order matters: each step assumes the previous one has run.
    """
    if not isinstance(text, str):
        return ""

    t = fix_text(text)                                   # 1. repair mojibake
    t = html.unescape(t)                                 # 2. &amp; -> &
    t = _HTML_TAG.sub(" ", t)                            #    strip HTML tags
    t = _URL.sub(" ", t)                                 # 3. drop URLs

    t = _SQUOTES.sub("'", t)                             # 4. typographic folding
    t = _DQUOTES.sub('"', t)
    t = _DASHES.sub("-", t)

    t = unicodedata.normalize("NFKD", t)                 # 5. decompose accents...
    t = t.encode("ascii", "ignore").decode("ascii")      #    ...and drop them

    t = t.lower().strip()                                # 6. lowercase + strip
    t = _ALLOWED.sub(" ", t)                             # 7. whitelist
    t = _MULTI_PUNCT.sub(r"\1", t)                       # 8. collapse repeated punctuation
    t = _SPACE_PUNCT.sub(r"\1", t)
    t = _WHITESPACE.sub(" ", t).strip()                  # 9. single spaces only

    return t


def clean_captions(df, source_col="caption_raw", progress=True):
    """Clean every caption in `df[source_col]`, adding `caption`, `n_words`, `n_chars`.

    Returns a new frame; the input is left alone.
    """
    out = df.copy()
    if progress:
        tqdm.pandas(desc="Cleaning captions")
        out["caption"] = out[source_col].progress_apply(clean_caption)
    else:
        out["caption"] = out[source_col].apply(clean_caption)
    out["n_words"] = out["caption"].str.split().str.len().fillna(0).astype(int)
    out["n_chars"] = out["caption"].str.len()
    return out


def cleaning_rule_hits(df, source_col="caption_raw"):
    """How much of the cleaner is load-bearing on this corpus, as opposed to defensive.

    COCO captions turn out to be plain ASCII already, so the Unicode steps change
    nothing here. We keep them anyway -- they cost nothing, and they are what makes
    quotes, dashes and accents come out consistent if any caption does carry them.
    """
    raw = df[source_col]
    return {
        "n_captions": int(len(df)),
        "altered_by_cleaning": int((df["caption"] != raw).sum()),
        "with_non_ascii": int(raw.map(lambda c: any(ord(ch) > 127 for ch in c)).sum()),
        "with_html": int(raw.str.contains(r"&\w+;|<[^>]+>", regex=True).sum()),
        "with_whitespace_to_fix": int(raw.str.contains(r"\s\s|^\s|\s$", regex=True).sum()),
        "needing_lowercase": int((raw != raw.str.lower()).sum()),
    }


def filter_captions(df, min_words=None, max_words=None, min_chars=None, max_chars=None):
    """Drop unusable rows, one rule at a time.

    Returns `(filtered_df, stages)` where `stages` is a list of
    `(rule name, rows remaining)` -- reporting it as a table rather than one
    chained expression makes it obvious if a single rule is dropping too much.
    """
    min_words = cfg.MIN_WORDS if min_words is None else min_words
    max_words = cfg.MAX_WORDS if max_words is None else max_words
    min_chars = cfg.MIN_CHARS if min_chars is None else min_chars
    max_chars = cfg.MAX_CHARS if max_chars is None else max_chars

    stages, out = [], df.copy()
    stages.append(("start", len(out)))

    out = out[out["caption"].str.strip().astype(bool)]
    stages.append(("drop empty", len(out)))

    out = out[(out["n_words"] >= min_words) & (out["n_chars"] >= min_chars)]
    stages.append((f"drop short (<{min_words}w / <{min_chars}c)", len(out)))

    out = out[(out["n_words"] <= max_words) & (out["n_chars"] <= max_chars)]
    stages.append((f"drop long (>{max_words}w / >{max_chars}c)", len(out)))

    out = out[out["image_path"].map(lambda p: Path(p).is_file())]
    stages.append(("drop missing image file", len(out)))

    out = out.drop_duplicates(subset="caption", keep="first")
    stages.append(("drop duplicate captions", len(out)))

    return out.reset_index(drop=True), stages


# ---------------------------------------------------------------------------
# 2. Subset construction
# ---------------------------------------------------------------------------
def build_subset(df, n_images=None, captions_per_image=None, seed=None):
    """Keep `n_images` distinct images with `captions_per_image` captions each.

    Deterministic: captions are ranked within each image by annotation id, images
    with enough surviving captions are eligible, and the images are drawn with a
    seeded generator. Re-running produces exactly the same rows.

    Every row gets `pair_idx` (0 .. N-1), which is the join key between the
    manifest and every embedding array -- row *i* of any .npy file is the caption
    on row *i* of the manifest, and nothing else needs to be tracked.

    Returns `(subset, info)`.
    """
    n_images = cfg.N_IMAGES if n_images is None else n_images
    captions_per_image = cfg.CAPTIONS_PER_IMAGE if captions_per_image is None else captions_per_image
    seed = cfg.SEED if seed is None else seed

    ranked = df.sort_values(["image_id", "ann_id"]).copy()
    ranked["cap_rank"] = ranked.groupby("image_id").cumcount()

    counts = ranked.groupby("image_id").size()
    eligible_ids = counts[counts >= captions_per_image].index

    rng = np.random.default_rng(seed)
    take = min(n_images, len(eligible_ids))
    chosen_ids = set(rng.choice(np.asarray(eligible_ids), size=take, replace=False))

    subset = ranked[ranked["image_id"].isin(chosen_ids) & (ranked["cap_rank"] < captions_per_image)]
    subset = subset.sort_values(["image_id", "cap_rank"]).reset_index(drop=True)
    subset.insert(0, "pair_idx", np.arange(len(subset)))

    assert subset["image_id"].nunique() == take
    assert (subset.groupby("image_id").size() == captions_per_image).all()
    assert subset["pair_idx"].tolist() == list(range(len(subset)))

    info = {
        "n_pairs": int(len(subset)),
        "n_distinct_images": int(subset["image_id"].nunique()),
        "captions_per_image": captions_per_image,
        "eligible_images": int(len(eligible_ids)),
        "requested_images": int(n_images),
        "short_of_request": int(max(0, n_images - take)),
        "caption_words": {
            "mean": float(subset["n_words"].mean()),
            "min": int(subset["n_words"].min()),
            "max": int(subset["n_words"].max()),
        },
        "seed": seed,
    }
    return subset, info


# ---------------------------------------------------------------------------
# 3. Image preprocessing
# ---------------------------------------------------------------------------
def resize_image(img, size=None):
    """Aspect-preserving resize of the shorter side, then a centre crop.

    A plain `resize((512, 512))` stretches non-square photos, and COCO images are
    mostly 640x480 -- every one would come out horizontally squashed, distorting
    object geometry in a dataset whose whole purpose is object-level semantics.
    `ImageOps.fit` gives exactly size x size with no warping.
    """
    size = cfg.IMAGE_SIZE if size is None else size
    return ImageOps.fit(img, (size, size), method=Image.Resampling.BICUBIC, centering=(0.5, 0.5))


def normalize_pixels(img, value_range="01"):
    """PIL image -> float tensor of shape (C, H, W).

    Two ranges, because different consumers want different ones:
      "01"  -- display, metrics, FID feature extractors
      "pm1" -- the Stable Diffusion VAE encoder
    """
    t = TF.to_tensor(img)                       # [0, 1]
    if value_range == "pm1":
        return t * 2.0 - 1.0                    # same as Normalize(0.5, 0.5)
    if value_range != "01":
        raise ValueError(f"value_range must be '01' or 'pm1', got {value_range!r}")
    return t


def preprocess_image(path, size=None):
    """Load one photo and return a size x size RGB PIL image.

    EXIF orientation is applied first, or a handful of photos arrive rotated 90
    degrees. `convert("RGB")` forces 3 channels, handling greyscale and CMYK.
    """
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    return resize_image(img, size)


def cache_resized_images(subset, out_dir=None, size=None, quality=95):
    """Process each distinct image once and cache it as JPEG.

    Only the distinct images are processed, not every pair -- the two captions of
    an image share one file. Cached as JPEG rather than as normalised tensors:
    3,000 float32 tensors of shape 3x512x512 would be ~9.4 GB, while the JPEGs are
    a few hundred MB, and normalising at load time is a cheap deterministic step.

    Files already present are skipped, so a re-run costs nothing. Rows whose image
    could not be processed are dropped and `pair_idx` is reassigned, so it stays
    contiguous and keeps matching the embedding arrays.

    Returns `(subset, info)`.
    """
    out_dir = cfg.IMAGES_512_DIR if out_dir is None else Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    unique_images = subset.drop_duplicates("image_id")[["image_id", "file_name", "image_path"]]
    failures, done = [], {}
    t0 = time.time()

    for _, row in tqdm(unique_images.iterrows(), total=len(unique_images), desc="Resizing to 512x512"):
        out_path = out_dir / row["file_name"]
        try:
            if not out_path.exists():
                preprocess_image(row["image_path"], size).save(out_path, "JPEG", quality=quality)
            done[row["image_id"]] = str(out_path)
        except Exception as exc:                  # noqa: BLE001 - record it and keep going
            failures.append((row["file_name"], repr(exc)))

    subset = subset.copy()
    subset["image_512_path"] = subset["image_id"].map(done)
    if failures:
        subset = subset[subset["image_512_path"].notna()].reset_index(drop=True)
        subset["pair_idx"] = np.arange(len(subset))

    info = {
        "n_distinct_images": int(len(unique_images)),
        "n_cached": len(done),
        "failures": failures,
        "seconds": round(time.time() - t0, 1),
        "cache_mb": sum(Path(p).stat().st_size for p in done.values()) / 1024 ** 2,
        "n_pairs_remaining": int(len(subset)),
    }
    return subset, info


def validate_cache(paths, size=None):
    """Confirm every cached file is exactly size x size RGB.

    Returns `(sizes, modes)` as sets, so the caller can assert on them and print
    what it found if the assertion fails.
    """
    size = cfg.IMAGE_SIZE if size is None else size
    sizes, modes = set(), set()
    for p in paths:
        with Image.open(p) as im:
            sizes.add(im.size)
            modes.add(im.mode)
    return sizes, modes

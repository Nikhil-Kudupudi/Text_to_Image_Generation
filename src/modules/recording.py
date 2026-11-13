"""Turning a run's images into the artefacts the write-up uses.

A sweep's output is only readable as a picture: fifty PNGs in a folder say nothing,
one grid per config says everything. `comparison_grid` is the baseline-vs-best
figure -- one labelled row per config, the same prompts down the columns, so the
knob's effect is the only thing that changes along a column.

Labels are slugified because they come from captions and config names, and a COCO
caption contains characters Windows will not accept in a filename.
"""

import math
import re

from PIL import Image, ImageDraw, ImageFont

import config as cfg
from utils import rel

LABEL_BAND = 20
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def slugify(text, max_length=60):
    """A filename-safe version of `text`."""
    return _UNSAFE.sub("_", str(text)).strip("_")[:max_length] or "untitled"


def _layout(n, rows, cols):
    if rows is None and cols is None:
        cols = math.ceil(math.sqrt(n))
    if cols is None:
        cols = math.ceil(n / rows)
    if rows is None:
        rows = math.ceil(n / cols)
    return rows, cols


def image_grid(images, rows=None, cols=None, pad=4, background=(255, 255, 255)):
    """Tile `images` into one picture, padded between and around the tiles."""
    if not images:
        raise ValueError("image_grid needs at least one image")

    rows, cols = _layout(len(images), rows, cols)
    w, h = images[0].size
    canvas = Image.new("RGB", (cols * w + (cols + 1) * pad, rows * h + (rows + 1) * pad), background)

    for i, img in enumerate(images):
        r, c = divmod(i, cols)
        canvas.paste(img, (pad + c * (w + pad), pad + r * (h + pad)))
    return canvas


def comparison_grid(rows, pad=4, background=(255, 255, 255)):
    """One labelled row per entry of `rows`, a `{label: [images]}` mapping."""
    if not rows:
        raise ValueError("comparison_grid needs at least one row")

    strips = {label: image_grid(images, rows=1, cols=len(images), pad=pad)
              for label, images in rows.items()}
    width = max(s.width for s in strips.values())
    canvas = Image.new("RGB", (width, sum(s.height + LABEL_BAND for s in strips.values())),
                       background)

    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    y = 0
    for label, strip in strips.items():
        draw.text((pad + 2, y + 4), str(label), fill=(0, 0, 0), font=font)
        canvas.paste(strip, (0, y + LABEL_BAND))
        y += LABEL_BAND + strip.height
    return canvas


def save_run(images, labels, name, out_dir=None, rows=None, cols=None, pad=4):
    """Write every image plus a `grid.png` into `<out_dir>/<name>/`.

    Returns the written paths, relative to the project root, for the notebook to print.
    """
    directory = (cfg.SWEEP_DIR if out_dir is None else out_dir) / name
    directory.mkdir(parents=True, exist_ok=True)

    written = []
    for i, (img, label) in enumerate(zip(images, labels)):
        path = directory / f"{i:02d}_{slugify(label)}.png"
        img.save(path)
        written.append(path)

    grid_path = directory / "grid.png"
    image_grid(images, rows=rows, cols=cols, pad=pad).save(grid_path)
    written.append(grid_path)

    return [rel(p) for p in written]

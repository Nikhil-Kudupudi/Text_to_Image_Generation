"""Small helpers every section uses: seeding, path printing, and saving figures
and summary tables to `outputs/`.

Kept out of `config.py` on purpose -- config holds values you edit, this holds
code you call.
"""

import json
import os
import random
from pathlib import Path

import numpy as np
import torch

import config as cfg


def set_seed(seed=None):
    """Reseed every RNG the pipeline touches.

    Called once at the start and again before generation, so the subset, the
    sampled examples and the generated images are identical on every re-run.
    """
    seed = cfg.SEED if seed is None else seed
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    # Deterministic convolution kernels: slightly slower, but two runs produce
    # identical tensors.
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    return seed


def rel(path):
    """`path` relative to the project root, as a string, for printing.

    Falls back to a computed relative path instead of raising when the path sits
    outside the root -- which happens on Kaggle, where the data and the code live
    on different mounts.
    """
    p = Path(path)
    try:
        return p.relative_to(cfg.PROJECT_ROOT).as_posix()
    except ValueError:
        return Path(os.path.relpath(p, cfg.PROJECT_ROOT)).as_posix()


def save_fig(fig, name):
    """Write a figure to `outputs/plots/` and return its path for printing."""
    cfg.PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    path = cfg.PLOTS_DIR / f"{name}.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    return rel(path)


def save_table(name, data):
    """Write a summary table to `outputs/tables/` as JSON.

    `default=float` converts numpy scalars, which json cannot serialise.
    """
    cfg.TABLES_DIR.mkdir(parents=True, exist_ok=True)
    path = cfg.TABLES_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=float)
    return rel(path)

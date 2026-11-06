# Text-to-Image Generation

Generating images from text using Transformer text encoders and diffusion models.

The pipeline pairs COCO 2017 captions with their images, cleans the captions, encodes them with CLIP
and BERT, and generates images with Stable Diffusion v1.5.

## Requirements

- Python 3.11 – 3.13
- [uv](https://docs.astral.sh/uv/) for dependency management
- About 10 GB of free disk space for the dataset and model weights
- A GPU is recommended but not required — everything runs on CPU, just more slowly

## Setup

### 1. Install uv

macOS / Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. Install the dependencies

```bash
uv sync
```

This reads `pyproject.toml`, resolves the exact versions in `uv.lock` and creates a `.venv` folder in
the project with everything installed.

### 3. Activate the environment

macOS / Linux:

```bash
source .venv/bin/activate
```

Windows (PowerShell):

```powershell
.venv\Scripts\Activate.ps1
```

Windows (Command Prompt):

```cmd
.venv\Scripts\activate.bat
```

You can skip this step if you prefix commands with `uv run` instead, for example `uv run python ...`.

### 4. Download the dataset

The project uses the **COCO 2017 validation split**. Download these two files:

- [val2017.zip](http://images.cocodataset.org/zips/val2017.zip) — 5,000 images (~780 MB)
- [annotations_trainval2017.zip](http://images.cocodataset.org/annotations/annotations_trainval2017.zip) — captions (~240 MB)

Unzip them into a `data/` folder at the root of the project, so the layout looks like this:

```
data/
├── annotations/
│   ├── captions_val2017.json
│   └── instances_val2017.json
└── val2017/
    ├── 000000000139.jpg
    └── ... (5,000 images)
```

Only `captions_val2017.json`, `instances_val2017.json` (object categories, used to check the subset's
category balance) and the `val2017` images are used. The other annotation files in the zip can be deleted.

### 5. Run the notebooks

Open the notebooks from `src/notebooks/` in VS Code or JupyterLab, select the project's `.venv` as the
kernel, and run them **in order**. Each one reads what the previous one wrote.

| Notebook | What it does | Writes | Time on Apple M5* |
|---|---|---|---|
| `01_data_preparation.ipynb` | Audits and cleans the COCO captions, filters images, picks 4,000 image–caption pairs, splits 80/10/10 by image, resizes and center-crops to 512×512 | `data/processed/pairs.parquet`, `captions.parquet`, `images_512/`, `cleaning_report.json` | ~30 s |
| `02_text_embeddings.ipynb` | Encodes the captions with CLIP ViT-L/14 (Stable Diffusion's text encoder) and BERT, then sanity-checks them with similarity, Recall@K and t-SNE | `data/processed/embeddings/*.pt`, `embedding_report.json` | ~7 min |
| `03_baseline_generation.ipynb` | Feeds the saved CLIP embeddings to Stable Diffusion v1.5 to generate the 5 sample prompt → image runs, scored with CLIP | `outputs/milestone1_samples/` | ~3 min |

\* Excluding the one-time model downloads (CLIP ~1.7 GB, BERT ~0.4 GB, Stable Diffusion v1.5 ~5 GB),
which Hugging Face caches for later runs. The notebooks pick the device automatically: CUDA, Apple MPS or CPU.

`milestone_1_hemanth.ipynb` is a standalone alternative to the 01 → 02 pipeline: it curates 2,000
image–caption pairs by CLIP score (best caption per image), encodes them with CLIP ViT-L/14 and BERT,
checks retrieval and caption similarity, and wraps the result in a training-ready PyTorch `Dataset`.
It writes only to `data/processed/hemanth/` and `outputs/hemanth/` (~6 min on an 8 GB Apple-silicon Mac).

To start JupyterLab from the terminal:

```bash
uv run jupyter lab
```

To re-run a notebook end to end from the terminal (outputs are saved into the notebook):

```bash
uv run jupyter nbconvert --to notebook --execute --inplace src/notebooks/01_data_preparation.ipynb
```

All processing is seeded, so re-running gives the same dataset and splits. Everything the notebooks
produce is written to `data/processed/` and `outputs/`, both of which are git-ignored. The figures are
also embedded in the committed notebooks.

## Project layout

```
data/                      # dataset (not in git) and generated artefacts
├── val2017/, annotations/ #   raw COCO 2017 val
└── processed/             #   cleaned pairs, 512×512 images, embeddings
docs/                      # milestone notes
outputs/                   # generated images and figures (not in git)
src/notebooks/             # the notebooks (01 → 02 → 03)
pyproject.toml             # dependencies (uv.lock pins exact versions)
```

## Documentation

Each stage of the project is documented in the `docs/` folder:

- [docs/milestone_1.md](docs/milestone_1.md) — project setup and dataset preparation: goals, tasks and
  deliverables for the first stage.

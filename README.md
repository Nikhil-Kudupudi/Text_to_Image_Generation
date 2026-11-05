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
│   └── captions_val2017.json
└── val2017/
    ├── 000000000139.jpg
    └── ... (5,000 images)
```

Only `captions_val2017.json` and the `val2017` images are used. The other annotation files in the zip
can be deleted.

### 5. Run the notebook

Open the notebook from `src/notebooks/` in VS Code or JupyterLab and select the project's `.venv` as
the kernel, then run the cells in order.

To start JupyterLab from the terminal:

```bash
uv run jupyter lab
```

The first run downloads the model weights from Hugging Face (about 5 GB) and caches them, so later runs
start much faster. Everything the notebook produces is written to `data/processed/` and `outputs/`,
both of which are git-ignored.

## Project layout

```
data/                      # dataset (not in git) and generated artefacts
docs/                      # milestone notes
outputs/                   # generated images
src/notebooks/             # the notebooks
pyproject.toml             # dependencies
```

## Documentation

Each stage of the project is documented in the `docs/` folder:

- [docs/milestone_1.md](docs/milestone_1.md) — project setup and dataset preparation: goals, tasks and
  deliverables for the first stage.

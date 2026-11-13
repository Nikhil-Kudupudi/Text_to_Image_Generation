# Text-to-Image Generation — standalone notebooks

Generating images from text with Transformer text encoders and diffusion models, on COCO 2017
captions.

**This branch is the Kaggle/Colab upload.** Each notebook is self-contained: there is no `src/`
package, nothing to clone, nothing to install in editable mode. Upload a single `.ipynb` and run it.

For the normal repository layout — `src/modules/`, the test suite, the implementation plan — see the
`feat-milestone-2` branch.

## The notebooks

| Notebook | What it produces | Needs |
|---|---|---|
| `notebooks/combined_milestone_1.ipynb` | the curated subset, CLIP + BERT embeddings, sanity checks | COCO val2017 + annotations |
| `notebooks/milestone_2_sd15.ipynb` | `prompt_embeds` integration, baseline, CFG + sampler + noise-schedule sweep, DDPM illustration | milestone 1's `data/processed/` |
| `notebooks/milestone_2_encoders.ipynb` | CLIP vs BERT vs GPT-2 sibling-gap comparison, no generation | milestone 1's `data/processed/` |
| `notebooks/milestone_2_comparison.ipynb` | SD 1.5 vs aMUSEd vs LDM-BERT — transformer-only against diffusion | the above, plus ~7 GB of weights |

## How a notebook is self-contained

Plain code cells, top to bottom. No `%%` magics, no files written beside the notebook, nothing
imported from this repository — each notebook defines the handful of functions it needs, where it
needs them.

Where the same idea appears in more than one encoder the functions are named apart
(`encode_clip_text`, `encode_bert_text`, `encode_gpt2_text`), because the encoders notebook uses
all three at once and a single `encode_text` would shadow the other two.

On Kaggle everything written lands under **`/kaggle/working/`** — artefacts in
`/kaggle/working/outputs/` (plots, tables, generated images, the sweep) and milestone 1's data in
`/kaggle/working/data/`. Nothing is written to `/kaggle/input/`, which is read-only. The setup cell
searches all of `/kaggle/input` for the Dataset, however deeply it is nested, so a path like
`/kaggle/input/datasets/<owner>/<slug>/processed/` is found automatically.

Off Kaggle, paths stay relative to the working directory (`./data/`, `./outputs/`).

## Running on Kaggle

1. **New Notebook → File → Import Notebook**, and pick the `.ipynb` you want.
2. **Settings → Accelerator → GPU** (T4 or P100).
3. For any milestone 2 notebook, attach milestone 1's output as a Dataset — see below.
4. Run all.

The setup cell finds whichever attached Dataset contains `processed/pairs.parquet` and copies it
somewhere writable. If nothing is attached it stops and names what it did see.

### What to upload as a Dataset

Upload **`data/processed/` only** — about 390 MB. Not `data/val2017/` or `data/annotations/`
(1.6 GB between them); no milestone 2 notebook reads raw COCO.

| Inside `data/processed/` | Size | Needed |
|---|---|---|
| `images_512/` | 323 MB | yes — the real-photo CLIP reference the generated scores are read against |
| `pairs.parquet`, `pairs.csv`, `metadata.json` | 2 MB | yes |
| `embeddings/` | 66 MB | optional; the encoders notebook recomputes them |

To run **milestone 1** on Kaggle instead, do not upload COCO — attach one of the public "COCO 2017"
Datasets already hosted there.

### Internet toggle

Off by default, and enabling it needs phone verification.

- **On** — `from_pretrained` downloads what it needs. Simplest.
- **Off** — attach the Stable Diffusion 1.5 snapshot as a second Dataset and point `HF_HOME` at it.
  `milestone_2_comparison.ipynb` additionally needs aMUSEd and LDM-BERT, roughly 7 GB more.

### On a T4

`BATCH_SIZE` is 4, sized for an 8 GB laptop GPU. A T4 has 16 GB, so edit the settings cell:

```python
BATCH_SIZE = 8
```

which roughly halves the sweep.

## Running on Colab

Upload the notebook and pick a GPU runtime. `/content` is writable, so the setup cell does nothing
special — but Colab has no Datasets, so run `combined_milestone_1.ipynb` first in the same session
(it downloads ~1 GB of COCO) before any milestone 2 notebook.

## Running locally

```bash
uv sync
uv run jupyter lab
```

Artefacts land in `./data/` and `./outputs/` relative to wherever the kernel started.

## Hardware

Measured on an RTX 5060 Laptop GPU (8 GB, `sm_120`): peak **2.62 GB**, about **2.5 s** per 512 px
image at 20 steps, and the full sweep in roughly 12 minutes.

Blackwell cards (RTX 50-series) need CUDA 12.8 or newer; older PyTorch wheels fail with "no kernel
image available". To check:

```bash
python -c "import torch; print(torch.cuda.get_device_capability(0), torch.cuda.get_arch_list())"
```

The capability tuple must appear in the arch list — `(12, 0)` means `sm_120` has to be there.

## Documentation

- [docs/milestone_1.md](docs/milestone_1.md) — project setup and dataset preparation.
- [docs/milestone_1_artifacts.md](docs/milestone_1_artifacts.md) — what milestone 1 leaves on disk.
- [docs/milestone_2.md](docs/milestone_2.md) — conditional generation and tuning: the generation
  arms, the guidance and noise-schedule sweep, and what was excluded.

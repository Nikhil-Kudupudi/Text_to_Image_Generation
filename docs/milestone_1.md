# Milestone 1 – Project Setup & Dataset Preparation

**Timeline:** Week 1–2

## Goals & Tasks

### 1. Dataset Selection
- **Dataset:** COCO 2017 (Captions) — paired image–caption dataset.
- Use a curated subset of **1,000–5,000 image–caption pairs** for the baseline pipeline.

### 2. Data Cleaning & Preprocessing

**Image preprocessing**
- Resize all images to **512×512** to match the input resolution expected by pre-trained Stable Diffusion models.
- Normalize pixel values (scale to the range expected by the Diffusers pipeline, e.g. `[-1, 1]` or `[0, 1]`).
- Convert all images to a consistent format (RGB, 3 channels).

**Caption cleaning**
- Lowercase text and strip leading/trailing whitespace.
- Remove special characters, HTML artifacts, and extra punctuation.
- Filter out empty, duplicate, or overly short/long captions.
- Normalize whitespace and tokenization-breaking characters.

### 3. Text Embeddings
- Generate text embeddings from the cleaned image captions using:
  - **CLIP** (text encoder) — for text–image alignment / conditioning embeddings.
  - **BERT** — for comparison as an alternative Transformer-based embedding model.
- Store embeddings alongside the corresponding image–caption pairs for reuse in Milestone 2.

### 4. Environment Setup
- Python + PyTorch
- Hugging Face `diffusers`
- Hugging Face `transformers` (CLIP, BERT)

### 5. Baseline Notebook
- Build a baseline notebook implementing the full **text → embedding** pipeline:
  1. Load COCO 2017 image–caption pairs.
  2. Clean captions.
  3. Resize/normalize images to 512×512.
  4. Encode captions with CLIP and BERT.
  5. Sanity-check embeddings (shape, similarity checks).

## Deliverables
- [ ] 1-page proposal (dataset + model + roles)
- [ ] Sample 5 prompt → image test runs
- [ ] GitHub repo initialized

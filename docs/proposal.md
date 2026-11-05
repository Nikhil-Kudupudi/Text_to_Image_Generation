# Project Proposal: Text-to-Image Generation with Transformer Text Encoders and Diffusion Models

**Course:** IE 7615 Deep Learning for AI · Northeastern University
**Team:** Nikhil Kudupudi · Swetha Jalluri · Hemanth · Jaya Raghu Ram

## Goal

Build and evaluate a text-to-image pipeline that turns a natural-language caption into a 512×512 image.
A pre-trained Transformer text encoder (CLIP) produces the embedding, and a latent diffusion model
(Stable Diffusion v1.5) generates the image from it. We study how the text representation and the
generation settings affect how well the images match their prompts, how realistic they look, and how fast they are produced.

## Dataset

**MS COCO 2017 (Captions), validation split:** 5,000 everyday-scene photos, each with ~5 human-written
captions (25,014 in total), covering 80 object categories. It is freely available, the standard benchmark
for text–image retrieval and generation, and small enough to process on a laptop.

From it we curate **4,000 image–caption pairs**:

* Captions are cleaned (Unicode/HTML repair, lowercasing, punctuation and whitespace normalization) and filtered (over 25 words, over CLIP's 77-token limit, duplicates).
* Images are validated (unreadable, short side under 256 px, aspect ratio over 2:1), converted to RGB and center-cropped to 512×512.
* Each image gets one primary caption, and the data is split 80/10/10 by image.

## Models

| Component | Model | Role |
|---|---|---|
| Text encoder | **CLIP ViT-L/14** text Transformer (123M params) | Turns each caption into the `[77 × 768]` embedding that conditions generation |
| Comparison encoder | **BERT-base** uncased (110M params) | Language-only baseline, used to show what CLIP's joint text–image training adds |
| Generator | **Stable Diffusion v1.5**: UNet (860M) + VAE (84M) + scheduler | Removes noise from a latent step by step, guided by the text embedding through cross-attention, then decodes it to an image |
| Evaluator | CLIP ViT-L/14 image tower | Measures text–image alignment (CLIP score, retrieval Recall@K) |

**Pipeline:** caption → CLIP tokenizer → CLIP text encoder → `prompt_embeds` → SD v1.5 UNet (classifier-free guidance) → VAE decoder → image.

## Evaluation

* **Text embeddings:** text↔image retrieval Recall@K, and how well same-image captions are separated from different-image captions (ROC-AUC). CLIP is compared with BERT on both.
* **Generated images:** CLIP score (prompt adherence), plus FID and Inception Score (realism and diversity) against real COCO images.
* **Efficiency:** seconds per image for each setting.

## Plan

| Milestone | Work |
|---|---|
| **1 · Setup & data** (weeks 1–2) | Environment (PyTorch, Diffusers, Transformers), dataset curation, CLIP and BERT embedding pipeline with sanity checks, 5 baseline prompt → image runs |
| **2 · Optimization** | Tune guidance scale, inference steps and scheduler; try negative prompts; compare quality against speed |
| **3 · Evaluation** | FID, Inception Score and CLIP score on a larger generated set; analysis of failure cases |
| **Final** | Interactive demo, report and presentation |

## Roles

Each member builds the full pipeline on their own branch. The team then reviews the branches together and
merges the strongest work for each milestone. Each member also leads one area:

| Member | Lead area |
|---|---|
| **Nikhil Kudupudi** | Repository, environment and dependency management; integration of the final branch |
| **Jaya Raghu Ram** | Data curation and preprocessing; text-embedding pipeline (CLIP / BERT) |
| **Swetha Jalluri** | Image generation and parameter experiments (Milestone 2) |
| **Hemanth** | Evaluation metrics (FID, IS, CLIP score) and the demo (Milestone 3) |

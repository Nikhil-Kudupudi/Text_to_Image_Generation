# Milestone 2 – Conditional Generation & Tuning

**Timeline:** Week 3–4

## What the brief asks

> Integrate text encoder (CLIP/BERT) with diffusion model (Stable Diffusion / DDPM) · Run baseline
> conditional generation · Tune classifier-free guidance + noise schedule · Record first set of
> generated images

**Optional extensions:** autoregressive text encoders (GPT-based embeddings) · Transformer-only vs
diffusion-based generation · style control through additional conditioning inputs.

## The decision that shapes everything

**The core milestone needs no weight training.** "Tune" in bullet 3 means turning knobs, not running
gradient descent, and the project brief's objectives line says "implement **or** fine-tune". Every core
bullet is satisfied at inference time.

This matters because our compute is a free Kaggle T4 (16 GB, 9 h sessions, ~30 h/week). The full sweep
below costs well under an hour. Fine-tuning is kept as an optional extension, not a dependency.

## The arms

### Generation arms

| # | Encoder + Model | Type | What we tune | Download |
|---|---|---|---|---|
| **1** | CLIP ViT-L/14 + **SD 1.5** | U-Net diffusion, 512px | all samplers · CFG · noise schedule · negative prompt | 4 GB |
| **2** | **BERT** + LDM (`LDMTextToImagePipeline`) | U-Net diffusion, 256px | DDIM / PNDM / LMS · CFG · steps | ~5 GB |
| **3** | CLIP ViT-L/14 + **aMUSEd** | masked transformer, **not diffusion** | steps · CFG · temperature | ~2 GB |

Arm 1 is the baseline and carries the whole sweep. Arms 2 and 3 are pretrained comparisons, run once
each on the same prompts.

### Encoder arms — metrics only, no images

CLIP ViT-L/14 · BERT · **GPT-2**

Compared with milestone 1's `sanity_checks.sibling_gap()`. Nothing new to write — encode the same 6,000
captions with a third encoder and read off a third row.

## Goals & Tasks

### 1. Integrate the text encoder with the diffusion model

The integration point is `prompt_embeds`. Normally SD hides it — you pass `prompt="a dog"` and the
pipeline runs CLIP internally. Integrating explicitly means doing that half ourselves:

```python
embeds, _ = clip_embeddings.encode_sequence(captions, sd_tok, sd_text)   # milestone 1 code
neg, _    = clip_embeddings.encode_sequence([""] * len(captions), sd_tok, sd_text)
image = pipe(prompt_embeds=embeds, negative_prompt_embeds=neg, ...).images[0]
```

No `prompt=` anywhere. Our encoder, their UNet, wired by hand.

**Verification:** the output should match what `prompt="..."` produces. Expect *near*-identical rather
than pixel-identical — milestone 1 encodes in fp32 and the pipeline runs fp16.

This also builds and tests the exact code path the optional BERT adapter would need later.

### 2. Run baseline conditional generation

The control every tuned config is measured against. Milestone 1 already produced it: 5 prompts,
30 steps, CFG 7.5, PNDM, CLIP(txt,gen) mean **0.3192** against the real photos' **0.3184**.

Re-run it on the fixed prompt set below so the baseline and the sweep share a protocol.

### 3. Tune classifier-free guidance + noise schedule

**Protocol — two rules that make the sweep valid**

1. **Pre-generate the latents and pass them in.** Fixing the seed is not enough: ancestral and SDE
   samplers draw extra noise mid-loop and different samplers consume the RNG differently, so two
   configs with the same seed start from different places.
2. **Use a CPU generator.** `torch.Generator(device="cuda")` and `device="cpu"` are different RNG
   streams, so CUDA-seeded runs do not reproduce on another machine. Milestone 1 used a CUDA generator —
   fix that here.

```python
g = torch.Generator(device="cpu").manual_seed(SEED)
latents = torch.randn((1, 4, 64, 64), generator=g)      # 512x512 -> 64x64 latent
```

**Samplers**

| Sampler | Steps | Note |
|---|---|---|
| PNDM | 50 | SD 1.5 default — the baseline |
| DDIM | 50 | deterministic at `eta=0` |
| LMS | 30 | multistep — fits a polynomial through the last few steps. Needs `scipy` |
| Euler | 30 | |
| Euler-a | 30 | ancestral — adds noise each step, never converges |
| DPMSolver++ | 20 | best quality per step |
| UniPC | 20 | same class |

**DDPM is excluded from the sweep** — it needs ~1000 steps, which is 100 of the sweep's 129 minutes for
the worst result. Run it **once on 2 prompts** as an illustration of "1000 steps vs 20 steps, same
picture". That is the actual story, and it costs ~4 minutes.

**Heun is excluded** as redundant with Euler, not for cost — at 30 steps it is 60 model calls, about the
same as PNDM's 50.

**Guidance:** sweep `guidance_scale` 1–15. Sweet spot is 5–9; above 12 it oversaturates, which
`guidance_rescale=0.7` corrects.

**Noise schedule** — scheduler config, not call arguments:

| Knob | Options | Effect |
|---|---|---|
| `beta_schedule` | `scaled_linear` (SD 1.5), `linear`, `squaredcos_cap_v2` | shape of the noise ramp |
| `timestep_spacing` | `leading` (SD legacy), `trailing`, `linspace` | which timesteps get visited |
| `rescale_betas_zero_snr` | True / False | fixes "cannot generate a truly dark image" |
| `use_karras_sigmas` | True / False | smoother spacing, helps at low step counts |

Swap a sampler without losing SD 1.5's trained settings:

```python
pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config, timestep_spacing="trailing")
```

**Metric:** CLIP score — `sanity_checks.clip_scores()` from milestone 1, unchanged.

### 4. Record the first set of generated images

Fixed prompt set: 10 cleaned captions from the curated subset, 8–18 words, drawn with `SEED`. Every
config generates the same 10, from the same latents.

Outputs: image grid per config, results table, the baseline-vs-best comparison.

### 5. *Optional* — autoregressive text encoders

Encode the 6,000 captions with **GPT-2**, run milestone 1's metrics, add a row to the encoder table. No
generation, no new model, minutes of GPU.

Note for the write-up: CLIP's text tower is **also causally masked** (verified in `transformers`), so
what separates CLIP from GPT-2 is the training objective — contrastive image-text matching versus
next-token prediction — not the masking.

### 6. *Optional* — Transformer-only vs diffusion-based generation

**aMUSEd (arm 3) vs SD 1.5 (arm 1).** Both use the same CLIP ViT-L/14, so the only variable is how the
image is made:

- SD 1.5 — start from noise, denoise ~30 times. Continuous latents.
- aMUSEd — chop the image into discrete tiles, mask them all, fill in blanks over ~12 rounds. BERT's
  masked-prediction trick applied to pictures. No noise, no noise schedule, no samplers.

This is the cleanest experiment in the plan: one variable changes.

### 7. *Optional* — style control

| Option | Training | Note |
|---|---|---|
| **IP-Adapter** | none | condition on a reference image. `ip_adapter_image` is already a parameter of the pipeline |
| Negative prompt | none | steer away from photorealism |
| Textual inversion | minutes | learn a `<style>` token from 5–20 images |
| Style LoRA | hours | |

### 8. *Optional* — fine-tuning

All fine-tuning happens on **arm 1**. It is the only arm with the tooling, and it is the baseline.

| Goal | What trains | Frozen | Cost |
|---|---|---|---|
| Make **our** BERT or GPT-2 drive SD 1.5 | a ~1.2M-parameter **adapter** (768 → 77×768) | BERT, SD 1.5, everything | minutes–hours |
| Conventional fine-tuning | **LoRA** on SD 1.5 cross-attention | the rest of SD | hours |

The adapter is trained by distillation: CLIP produces the target, BERT the input, loss is MSE. No UNet,
no VAE, no diffusion in the training loop — which is why it is cheap.

```python
loss = F.mse_loss(adapter(bert_seq(captions)), clip_seq(captions))
```

CLIP is the teacher only; at inference it is gone. MSE-to-CLIP is a **ceiling, not a goal** — the
adapter can approach CLIP, never beat it. How closely it gets is the finding.

## Requirement coverage

| Brief requirement | Covered by | Training? |
|---|---|---|
| Integrate text encoder with diffusion model | Arm 1, task 1 | no |
| Run baseline conditional generation | Arm 1, task 2 | no |
| Tune CFG + noise schedule | Arm 1, task 3 | no |
| Record first images | Arm 1, task 4 | no |
| *Opt.* autoregressive text encoders | GPT-2 encoder metrics, task 5 | no |
| *Opt.* Transformer-only vs diffusion | Arm 3 vs Arm 1, task 6 | no |
| *Opt.* style control | IP-Adapter, task 7 | no |
| BERT coverage | Arm 2 (free), optionally the adapter | no / yes |

## What we excluded, and why

| Excluded | Reason |
|---|---|
| **PixArt-α** (DiT) | its T5-XXL encoder is ~9 GB and changes the encoder *and* the backbone at once — the result would be confounded. "Transformer-only vs diffusion" is already answered by aMUSEd |
| **SD 2.1, SDXL** | OpenCLIP is still CLIP; adds an arm without adding an axis |
| **SD 3 / Flux** | 18.8 GB+ in fp16, gated |
| **DDPM as a sweep arm** | ~1000 steps. Kept as a single 2-prompt illustration |
| **Heun** | redundant with Euler |
| **Janus-Pro-1B** (true autoregressive *generation*) | fits a T4, but it is in `transformers` not `diffusers`, needs separate integration, and at 1.5B will not compete on image quality. The brief asks for autoregressive *encoders*, which GPT-2 covers |

## Compute budget

Scaled from milestone 1's measured 4.3 s/image (30 steps, batch 1) to a T4 at batch 8 ≈ **0.12 s per step
per image**. Sweep of 10 prompts × 5 CFG values = 50 images per sampler:

| | Time |
|---|---|
| Seven samplers × 50 images | **~23 min** |
| DDPM illustration, 2 prompts | ~4 min |
| Arms 2 and 3, once each | ~10 min |
| Encoder metrics (CLIP/BERT/GPT-2) | ~5 min |
| **Total** | **well under 1 hour** |

FID is the only expensive thing — 5,000 images is ~3.3 h per config with DPMSolver++. Use CLIP score for
the sweep, FID only on two or three finalists.

**Memory:** peak ~5 GB VRAM if each pipeline is freed before the next loads (`del pipe;
torch.cuda.empty_cache()`). Total downloads ~14 GB — attach the weights as a **Kaggle Dataset** rather
than re-downloading each session, since a session with the internet toggle off cannot call
`from_pretrained` at all.

## Notebooks

Each imports the same `src/modules`, writes to `data/processed/` and `outputs/`, and stays well inside a
9 h session.

| Notebook | Contents |
|---|---|
| `milestone_2_encoders.ipynb` | CLIP / BERT / GPT-2 metrics — no generation |
| `milestone_2_sd15.ipynb` | integration, baseline, CFG + sampler + schedule sweep |
| `milestone_2_comparison.ipynb` | LDM-BERT and aMUSEd on the same prompts |
| `milestone_2_adapter.ipynb` *(optional)* | train the BERT→CLIP adapter |

New config values to add to `src/config.py`: the CFG and step grids, the sampler list, the fixed prompt
count, and the latent seed.

## Deliverables

- [ ] Explicit `prompt_embeds` integration, verified against `prompt=`
- [ ] Baseline conditional generation on the fixed 10-prompt set
- [ ] CFG sweep (1–15) with CLIP score per setting
- [ ] Sampler comparison across seven samplers, fixed latents
- [ ] Noise-schedule comparison (`timestep_spacing`, `rescale_betas_zero_snr`, Karras sigmas)
- [ ] DDPM illustration — 1000 steps vs 20
- [ ] First set of generated images recorded, with the results table
- [ ] *Optional* GPT-2 row in the encoder comparison
- [ ] *Optional* aMUSEd vs SD 1.5 — transformer-only vs diffusion
- [ ] *Optional* LDM-BERT arm
- [ ] *Optional* style control via IP-Adapter
- [ ] *Optional* BERT→CLIP adapter

## Open questions for the team

1. Is the optional work shared out, or does milestone 2 stop at the four core bullets?
2. FID in milestone 2, or hold it for milestone 3 where evaluation is the explicit ask?
3. If the adapter is attempted, is distillation enough, or do we want the diffusion-loss version (hours
   rather than minutes)?

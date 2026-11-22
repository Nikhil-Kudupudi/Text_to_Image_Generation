"""The five configurations rendered in milestone 3 (m3_generation_log.csv), as `Preset` in app/src/types.ts."""

SD_REPO = "stable-diffusion-v1-5/stable-diffusion-v1-5"

PRESETS = {p["id"]: p for p in [
    {"id": "sd_baseline", "label": "SD 1.5 baseline", "model": SD_REPO,
     "sampler": "pndm", "steps": 50, "guidance": 7.5, "resolution": 512, "clip_layer": 1},
    {"id": "sd_tuned", "label": "SD 1.5 tuned", "model": SD_REPO,
     "sampler": "euler_a", "steps": 30, "guidance": 7.5, "resolution": 512, "clip_layer": 1},
    {"id": "sd_tuned_clipskip2", "label": "SD 1.5 tuned, CLIP skip 2", "model": SD_REPO,
     "sampler": "euler_a", "steps": 30, "guidance": 7.5, "resolution": 512, "clip_layer": 2},
    {"id": "ldm_bert", "label": "LDM-BERT", "model": "CompVis/ldm-text2im-large-256",
     "sampler": "ddim", "steps": 50, "guidance": 7.5, "resolution": 256, "clip_layer": None},
    {"id": "amused", "label": "aMUSEd 256", "model": "amused/amused-256",
     "sampler": "masked unmasking", "steps": 12, "guidance": 7.5, "resolution": 256, "clip_layer": None},
]}

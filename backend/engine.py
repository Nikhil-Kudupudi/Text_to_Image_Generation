"""Diffusion inference with the same settings as the milestone 3 render notebooks."""
import gc
import threading

import torch
import torch.nn.functional as F
from diffusers import (AmusedPipeline, EulerAncestralDiscreteScheduler, LDMTextToImagePipeline,
                       PNDMScheduler, StableDiffusionPipeline)
from transformers import CLIPImageProcessor, CLIPModel, CLIPTextModel, CLIPTokenizer

from backend.presets import PRESETS

SD_REPOS = ["stable-diffusion-v1-5/stable-diffusion-v1-5",
            "sd-legacy/stable-diffusion-v1-5",
            "CompVis/stable-diffusion-v1-4"]
CLIP_SD_MODEL = "openai/clip-vit-large-patch14"
CLIP_JUDGE_MODEL = "openai/clip-vit-base-patch32"
CLIP_MAX_TOKENS = 77
TIMESTEP_SPACING = "leading"
SCHEDULERS = {"pndm": PNDMScheduler, "euler_a": EulerAncestralDiscreteScheduler}


def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def family(preset_id: str) -> str:
    return "sd" if preset_id.startswith("sd_") else preset_id


def pooled(out):
    return out.pooler_output if hasattr(out, "pooler_output") else out


class Engine:
    def __init__(self):
        self.device = pick_device()
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.gpu = torch.cuda.get_device_name(0) if self.device == "cuda" else None
        self.lock = threading.Lock()
        self.loaded = None
        self._family = None
        self._pipe = None
        self._text = None          # (tokenizer, fp32 CLIP-L text encoder) for the SD presets
        self._base_scheduler = None
        self._judge = None

    @property
    def busy(self) -> bool:
        return self.lock.locked()

    # ---- loading ----

    def _free(self):
        self._pipe = self._text = self._base_scheduler = None
        self._family = self.loaded = None
        gc.collect()
        if self.device == "cuda":
            torch.cuda.empty_cache()

    def load(self, preset_id: str) -> None:
        if preset_id not in PRESETS:
            raise ValueError(f"unknown preset {preset_id!r}")
        if family(preset_id) != self._family:
            self._free()
            getattr(self, f"_load_{family(preset_id)}")()
            self._family = family(preset_id)
        if self._family == "sd":
            self._pipe.scheduler = SCHEDULERS[PRESETS[preset_id]["sampler"]].from_config(
                self._base_scheduler, timestep_spacing=TIMESTEP_SPACING)
        self.loaded = preset_id

    def _load_sd(self):
        errors = {}
        for repo in SD_REPOS:
            try:
                pipe = StableDiffusionPipeline.from_pretrained(
                    repo, torch_dtype=self.dtype, safety_checker=None, requires_safety_checker=False)
                break
            except Exception as exc:
                errors[repo] = f"{type(exc).__name__}: {exc}"
        else:
            raise RuntimeError("no Stable Diffusion repo could be loaded: " + repr(errors))
        pipe = pipe.to(self.device)
        pipe.set_progress_bar_config(disable=True)
        pipe.vae.enable_slicing()
        self._pipe, self._base_scheduler = pipe, dict(pipe.scheduler.config)
        tokenizer = CLIPTokenizer.from_pretrained(CLIP_SD_MODEL)
        encoder = CLIPTextModel.from_pretrained(CLIP_SD_MODEL).to(self.device, torch.float32).eval()
        self._text = (tokenizer, encoder)

    def _load_ldm_bert(self):
        self._pipe = LDMTextToImagePipeline.from_pretrained(
            PRESETS["ldm_bert"]["model"], torch_dtype=self.dtype).to(self.device)
        self._pipe.set_progress_bar_config(disable=True)

    def _load_amused(self):
        self._pipe = AmusedPipeline.from_pretrained(
            PRESETS["amused"]["model"], torch_dtype=self.dtype).to(self.device)
        self._pipe.set_progress_bar_config(disable=True)

    # ---- rendering ----

    @torch.no_grad()
    def _encode(self, text: str, layer: int) -> torch.Tensor:
        tokenizer, encoder = self._text
        tokens = tokenizer([text], padding="max_length", max_length=CLIP_MAX_TOKENS,
                           truncation=True, return_tensors="pt").to(self.device)
        hidden = encoder(input_ids=tokens["input_ids"], output_hidden_states=True)
        if layer == 1:
            return hidden.last_hidden_state
        # transformers 4 nests the layer norm under .text_model; transformers 5 does not.
        return getattr(encoder, "text_model", encoder).final_layer_norm(hidden.hidden_states[-2])

    def _start_noise(self, generator, channels, size):
        # One CPU generator draws the starting latent, then drives the sampler from where it left off.
        return torch.randn((1, channels, size // 8, size // 8), generator=generator)

    @torch.no_grad()
    def render(self, prompt, preset, guidance, steps, seed):
        self.load(preset)
        p, pipe = PRESETS[preset], self._pipe
        generator = torch.Generator(device="cpu").manual_seed(int(seed))
        size = p["resolution"]
        if self._family == "sd":
            layer = p["clip_layer"]
            latents = self._start_noise(generator, pipe.unet.config.in_channels, size)
            out = pipe(prompt_embeds=self._encode(prompt, layer).to(self.device, self.dtype),
                       negative_prompt_embeds=self._encode("", layer).to(self.device, self.dtype),
                       latents=latents.to(self.device, self.dtype), generator=generator,
                       num_inference_steps=steps, guidance_scale=guidance, height=size, width=size)
        elif self._family == "ldm_bert":
            latents = self._start_noise(generator, pipe.unet.config.in_channels, size)
            out = pipe(prompt=[prompt], height=size, width=size, num_inference_steps=steps,
                       guidance_scale=guidance, latents=latents.to(self.device, self.dtype),
                       generator=generator)
        else:
            out = pipe(prompt=[prompt], num_inference_steps=steps, guidance_scale=guidance,
                       generator=generator)
        return out.images[0]

    # ---- CLIP judge (same model and scoring as the notebooks) ----

    @torch.no_grad()
    def clip_score(self, prompt, image):
        try:
            if self._judge is None:
                self._judge = (CLIPTokenizer.from_pretrained(CLIP_JUDGE_MODEL),
                               CLIPImageProcessor.from_pretrained(CLIP_JUDGE_MODEL),
                               CLIPModel.from_pretrained(CLIP_JUDGE_MODEL).to(self.device, torch.float32).eval())
            tokenizer, processor, model = self._judge
            px = processor(images=[image.convert("RGB")], return_tensors="pt").to(self.device)
            toks = tokenizer([prompt], padding="max_length", max_length=CLIP_MAX_TOKENS,
                             truncation=True, return_tensors="pt").to(self.device)
            img = F.normalize(pooled(model.get_image_features(**px)).float(), dim=-1)
            txt = F.normalize(pooled(model.get_text_features(**toks)).float(), dim=-1)
            return float((img * txt).sum())
        except Exception:
            return None

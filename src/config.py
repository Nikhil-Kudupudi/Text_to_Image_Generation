"""Every tunable value and every path for the milestone-1 pipeline.

Nothing in this file does any work. It is the one place to change the scale of a
run, the models, the caption filters or where artefacts land -- edit a value
here, restart the kernel, re-run the notebook, and nothing else needs touching.

Paths can also be overridden with environment variables, which is how this runs
on Kaggle without editing the file:

    T2I_PROJECT_ROOT   repo root            (default: the parent of src/)
    T2I_DATA_DIR       dataset + artefacts  (default: <root>/data)
    T2I_OUTPUT_DIR     plots, tables, PNGs  (default: <root>/outputs)
"""

import os
from pathlib import Path

import torch

# ---- Paths -------------------------------------------------------------
# Derived from this file's own location, so it does not matter where the kernel
# was started from -- src/config.py -> parents[1] is the repo root.
PROJECT_ROOT = Path(os.environ.get("T2I_PROJECT_ROOT") or Path(__file__).resolve().parents[1])

DATA_DIR = Path(os.environ.get("T2I_DATA_DIR") or PROJECT_ROOT / "data")
ANN_FILE = DATA_DIR / "annotations" / "captions_val2017.json"
IMAGES_DIR = DATA_DIR / "val2017"

PROCESSED_DIR = DATA_DIR / "processed"
IMAGES_512_DIR = PROCESSED_DIR / "images_512"      # 512x512 RGB JPEG cache
EMB_DIR = PROCESSED_DIR / "embeddings"             # the .npy arrays
MANIFEST_PARQUET = PROCESSED_DIR / "pairs.parquet"
MANIFEST_CSV = PROCESSED_DIR / "pairs.csv"
METADATA_FILE = PROCESSED_DIR / "metadata.json"

OUTPUT_DIR = Path(os.environ.get("T2I_OUTPUT_DIR") or PROJECT_ROOT / "outputs")
GENERATIONS_DIR = OUTPUT_DIR / "generations"       # generated PNGs
PLOTS_DIR = OUTPUT_DIR / "plots"                   # every figure, as PNG
TABLES_DIR = OUTPUT_DIR / "tables"                 # every summary table, as JSON

SWEEP_DIR = OUTPUT_DIR / "sweep"                   # one sub-directory per swept config

ALL_DIRS = (PROCESSED_DIR, IMAGES_512_DIR, EMB_DIR, GENERATIONS_DIR, PLOTS_DIR, TABLES_DIR,
            SWEEP_DIR)


def ensure_dirs():
    """Create every output directory. Called once near the top of the notebook."""
    for d in ALL_DIRS:
        d.mkdir(parents=True, exist_ok=True)


# ---- Subset ------------------------------------------------------------
N_IMAGES = 3000             # distinct images kept
CAPTIONS_PER_IMAGE = 2      # captions kept per image -> 3000 x 2 = 6000 pairs
IMAGE_SIZE = 512            # Stable Diffusion v1.x native resolution
SEED = 42                   # single source of randomness for the whole pipeline

# ---- Caption filters ---------------------------------------------------
MIN_WORDS, MAX_WORDS = 3, 60
MIN_CHARS, MAX_CHARS = 10, 250

# ---- Models ------------------------------------------------------------
CLIP_JOINT_MODEL = "openai/clip-vit-base-patch32"    # text + vision towers -> shared 512-d space
CLIP_SD_MODEL = "openai/clip-vit-large-patch14"      # the text encoder SD v1.5 is conditioned on
BERT_MODEL = "google-bert/bert-base-uncased"         # text-only Transformer, for comparison
GPT2_MODEL = "openai-community/gpt2"                 # autoregressive encoder, milestone 2's optional arm
SD_REPO_CANDIDATES = [                               # tried in order; the original runwayml repo is gone
    "stable-diffusion-v1-5/stable-diffusion-v1-5",
    "sd-legacy/stable-diffusion-v1-5",
    "CompVis/stable-diffusion-v1-4",
]

CLIP_MAX_TOKENS = 77   # fixed by CLIP's positional embedding table
BERT_MAX_TOKENS = 64   # COCO captions are short; 64 covers them with room to spare
GPT2_MAX_TOKENS = 64   # matched to BERT so the encoder comparison varies only the model
BATCH_SIZE = 64

# ---- Generation (section 11; the knobs milestone 2 sweeps) -------------
N_STEPS = 30           # denoising steps
GUIDANCE = 7.5         # classifier-free guidance scale
N_PROMPTS = 5          # test prompts drawn from the curated subset
PROMPT_MIN_WORDS = 8   # prompts long enough to describe a scene, not one object
PROMPT_MAX_WORDS = 18

# ---- Precision ---------------------------------------------------------
# Text encoders in float32: they are small, and float32 keeps the stored embeddings
# free of rounding so cosine similarities are exact. Stable Diffusion in float16 on
# GPU: the UNet is the expensive part and fp16 roughly halves VRAM and step time.
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
ENCODER_DTYPE = torch.float32
SD_DTYPE = torch.float16 if DEVICE.type == "cuda" else torch.float32

# ---- Toggles -----------------------------------------------------------
# The 77x768 sequence tensors are ~710 MB at 6,000 captions. The SD text encoder is
# deterministic in eval mode, so re-running it reproduces them bit-for-bit in well
# under a minute -- cheaper to recompute than to store.
SAVE_SEQ_EMBEDDINGS = False
RUN_SD_GENERATION = True    # section 11 needs ~4 GB of Stable Diffusion weights on first run
N_ALIGN_IMAGES = 500        # images put through CLIP's vision tower for the retrieval check
REUSE_EXISTING = True       # reuse cached embeddings when they match this run's subset
FORCE_RECOMPUTE = False     # set True to ignore every cache and redo all work


# ---- Milestone 2: the sweep ---------------------------------------------
N_FIXED_PROMPTS = 10   # every config generates this same set, from the same latents
LATENT_SEED = SEED     # latents are built once, on CPU, and passed into every run

CFG_GRID = (1.0, 4.0, 7.5, 11.0, 15.0)   # spec sweeps 1-15; 7.5 is the SD 1.5 default
GUIDANCE_RESCALE = 0.7                   # corrects the oversaturation CFG > 12 causes

# Sampler -> step count. The counts differ on purpose: DPMSolver++ and UniPC reach at
# 20 steps what PNDM needs 50 for, so an equal-step comparison would measure nothing
# but the step count.
SAMPLERS = {
    "pndm": 50,      # SD 1.5 default -- the baseline
    "ddim": 50,      # deterministic at eta=0
    "lms": 30,       # multistep; needs scipy
    "euler": 30,
    "euler_a": 30,   # ancestral -- adds noise each step, never converges
    "dpmpp": 20,
    "unipc": 20,
}

# Noise-schedule axes. Swept as a product against one fixed sampler, so the only
# variable is the schedule.
# SD 1.5's shipped scheduler config omits timestep_spacing, so each scheduler class would
# fall back to its own default -- PNDM and DDIM to "leading", the rest to "linspace". The
# guidance and sampler grids pin it so that axis stays still while the schedule grid sweeps it.
BASE_TIMESTEP_SPACING = "leading"   # SD legacy, what v1.5 was trained under

TIMESTEP_SPACINGS = ("leading", "trailing", "linspace")
ZERO_SNR_OPTIONS = (False, True)
KARRAS_OPTIONS = (False, True)
SCHEDULE_SAMPLER = "dpmpp"

DDPM_STEPS = 1000      # the illustration, not a sweep arm
DDPM_N_PROMPTS = 2

# Batch 4, not the 8 an unshared 16 GB T4 allows: this targets an 8 GB RTX 5060 Laptop
# GPU that is also driving the display. SD 1.5 in fp16 is ~2.5 GB of weights and roughly
# 0.6 GB of activations per 512x512 image.
GEN_BATCH_SIZE = 4

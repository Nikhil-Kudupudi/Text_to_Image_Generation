"""Live generation API for the Generate page. Run from the repo root:

    uv run uvicorn backend.app:app --port 8000
"""
import json
import os
import random
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from backend.presets import PRESETS

REPO = Path(__file__).resolve().parent.parent
ID_RE = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")
HISTORY_MAX = 50

PresetId = Literal["sd_baseline", "sd_tuned", "sd_tuned_clipskip2", "ldm_bert", "amused"]


class Preset(BaseModel):
    id: PresetId
    label: str
    model: str
    sampler: str
    steps: int
    guidance: float
    resolution: int
    clip_layer: Optional[Literal[1, 2]]


class HealthResponse(BaseModel):
    ok: bool
    device: Literal["cuda", "mps", "cpu"]
    gpu: Optional[str]
    loaded: Optional[str]
    busy: bool


class GenerateRequest(BaseModel):
    prompt: str = Field(max_length=2000)
    preset: PresetId
    guidance: Optional[float] = Field(None, ge=0, le=20)
    steps: Optional[int] = Field(None, ge=1, le=100)
    seed: Optional[int] = Field(None, ge=0, le=2**32 - 1)

    @field_validator("prompt")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("prompt must not be empty")
        return v


class GenerateResponse(BaseModel):
    id: str
    image: str
    prompt: str
    preset: PresetId
    guidance: float
    steps: int
    seed: int
    seconds: float
    clip: Optional[float]
    created: str


app = FastAPI(title="Text-to-image live generation")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        from backend.engine import Engine
        _engine = Engine()
    return _engine


def live_dir() -> Path:
    d = Path(os.environ.get("LIVE_DIR") or REPO / "outputs" / "live")
    d.mkdir(parents=True, exist_ok=True)
    return d


def new_id() -> str:
    return f"{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(3)}"


@app.get("/api/health", response_model=HealthResponse)
def health(engine=Depends(get_engine)):
    return HealthResponse(ok=True, device=engine.device, gpu=engine.gpu, loaded=engine.loaded, busy=engine.busy)


@app.get("/api/presets", response_model=list[Preset])
def presets():
    return list(PRESETS.values())


@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, engine=Depends(get_engine)):
    preset = PRESETS[req.preset]
    guidance = preset["guidance"] if req.guidance is None else req.guidance
    steps = preset["steps"] if req.steps is None else req.steps
    seed = random.randint(0, 2**31 - 1) if req.seed is None else req.seed

    if not engine.lock.acquire(blocking=False):
        raise HTTPException(409, detail="A generation is already running; try again when it finishes.")
    try:
        engine.load(req.preset)
        started = time.perf_counter()
        image = engine.render(req.prompt, req.preset, guidance, steps, seed)
        seconds = round(time.perf_counter() - started, 2)
        clip = engine.clip_score(req.prompt, image)

        out = live_dir()
        image_id = new_id()
        image.convert("RGB").save(out / f"{image_id}.png", format="PNG")
        result = GenerateResponse(
            id=image_id, image=f"/api/images/{image_id}.png", prompt=req.prompt, preset=req.preset,
            guidance=guidance, steps=steps, seed=seed, seconds=seconds,
            clip=None if clip is None else round(clip, 4),
            created=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        with open(out / "history.jsonl", "a", encoding="utf-8") as f:
            f.write(result.model_dump_json() + "\n")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, detail=f"Generation failed: {type(exc).__name__}: {exc}")
    finally:
        engine.lock.release()


@app.get("/api/history", response_model=list[dict])
def history():
    path = live_dir() / "history.jsonl"
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows[::-1][:HISTORY_MAX]


@app.get("/api/images/{name}")
def image(name: str):
    stem, dot, ext = name.rpartition(".")
    path = live_dir() / name
    if ext != "png" or not ID_RE.match(stem) or not path.is_file():
        raise HTTPException(404, detail="Image not found")
    return FileResponse(path, media_type="image/png")

import json
import threading

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app import app, get_engine

EXPECTED_PRESETS = {
    "sd_baseline": ("pndm", 50, 7.5, 512, 1),
    "sd_tuned": ("euler_a", 30, 7.5, 512, 1),
    "sd_tuned_clipskip2": ("euler_a", 30, 7.5, 512, 2),
    "ldm_bert": ("ddim", 50, 7.5, 256, None),
    "amused": ("masked unmasking", 12, 7.5, 256, None),
}


class FakeEngine:
    device = "cpu"
    gpu = None

    def __init__(self):
        self.lock = threading.Lock()
        self.loaded = None
        self.calls = []

    @property
    def busy(self):
        return self.lock.locked()

    def load(self, preset_id):
        self.loaded = preset_id

    def render(self, prompt, preset, guidance, steps, seed):
        self.calls.append((prompt, preset, guidance, steps, seed))
        return Image.new("RGB", (8, 8), (200, 30, 30))

    def clip_score(self, prompt, image):
        return 0.3125


@pytest.fixture
def engine():
    return FakeEngine()


@pytest.fixture
def client(engine, tmp_path, monkeypatch):
    monkeypatch.setenv("LIVE_DIR", str(tmp_path))
    app.dependency_overrides[get_engine] = lambda: engine
    yield TestClient(app)
    app.dependency_overrides.clear()


def generate(client, **body):
    return client.post("/api/generate", json={"prompt": "a red bicycle", "preset": "sd_tuned", **body})


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "device": "cpu", "gpu": None, "loaded": None, "busy": False}


def test_presets_match_spec(client):
    r = client.get("/api/presets")
    assert r.status_code == 200
    presets = r.json()
    assert [p["id"] for p in presets] == list(EXPECTED_PRESETS)
    for p in presets:
        assert set(p) == {"id", "label", "model", "sampler", "steps", "guidance", "resolution", "clip_layer"}
        assert (p["sampler"], p["steps"], p["guidance"], p["resolution"], p["clip_layer"]) == EXPECTED_PRESETS[p["id"]]
    models = {p["id"]: p["model"] for p in presets}
    assert models["ldm_bert"] == "CompVis/ldm-text2im-large-256"
    assert models["amused"] == "amused/amused-256"


def test_generate_contract_and_files(client, engine, tmp_path):
    r = generate(client, seed=42)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"id", "image", "prompt", "preset", "guidance", "steps", "seed", "seconds", "clip", "created"}
    assert body["image"] == f"/api/images/{body['id']}.png"
    assert (body["prompt"], body["preset"], body["guidance"], body["steps"], body["seed"]) == (
        "a red bicycle", "sd_tuned", 7.5, 30, 42)
    assert body["clip"] == 0.3125
    assert body["seconds"] >= 0
    assert engine.calls == [("a red bicycle", "sd_tuned", 7.5, 30, 42)]
    assert (tmp_path / f"{body['id']}.png").is_file()
    lines = (tmp_path / "history.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1 and json.loads(lines[0]) == body


def test_generate_overrides_and_random_seed(client, engine):
    body = generate(client, preset="amused", guidance=4, steps=8).json()
    assert (body["guidance"], body["steps"]) == (4, 8)
    assert isinstance(body["seed"], int) and body["seed"] >= 0


@pytest.mark.parametrize("body", [
    {"prompt": ""},
    {"prompt": "   "},
    {"preset": "dall_e"},
    {"guidance": 25},
    {"guidance": -1},
    {"steps": 0},
    {"steps": 101},
    {"seed": -5},
])
def test_generate_validation(client, body):
    r = generate(client, **body)
    assert r.status_code == 422
    assert "detail" in r.json()


def test_generate_while_busy(client, engine):
    engine.lock.acquire()
    try:
        assert client.get("/api/health").json()["busy"] is True
        r = generate(client)
        assert r.status_code == 409
        assert isinstance(r.json()["detail"], str)
    finally:
        engine.lock.release()
    assert generate(client).status_code == 200


def test_image_served(client):
    body = generate(client).json()
    r = client.get(body["image"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.parametrize("path", [
    "/api/images/..%2F..%2Fpyproject.toml",
    "/api/images/..%2Fhistory.jsonl",
    "/api/images/history.jsonl",
    "/api/images/20261122-153012-ab12cd.png",
    "/api/images/20261122-153012-AB12CD.png",
])
def test_image_rejects_bad_or_missing_ids(client, path):
    assert client.get(path).status_code == 404


def test_history_newest_first_max_50(client, tmp_path):
    rows = [{"id": f"20261122-1200{i:02d}-abcdef", "n": i} for i in range(60)]
    (tmp_path / "history.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    newest = generate(client).json()
    history = client.get("/api/history").json()
    assert len(history) == 50
    assert history[0] == newest
    assert history[1]["n"] == 59
    assert history[-1]["n"] == 11


def test_history_empty(client):
    assert client.get("/api/history").json() == []

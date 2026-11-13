from types import SimpleNamespace

import pytest
from PIL import Image

import config as cfg
from modules import arms


class _NamedPipe:
    """Declares exactly what it accepts, like AmusedPipeline."""

    def __init__(self):
        self.calls = []

    def __call__(self, prompt=None, num_inference_steps=None, guidance_scale=None, generator=None):
        self.calls.append({"prompt": prompt, "num_inference_steps": num_inference_steps,
                           "guidance_scale": guidance_scale, "generator": generator})
        return SimpleNamespace(images=[Image.new("RGB", (8, 8)) for _ in prompt])


class _KwargsPipe:
    """Declares **kwargs and silently ignores what it does not know, like LDMTextToImagePipeline."""

    def __init__(self):
        self.calls = []

    def __call__(self, prompt=None, num_inference_steps=None, **kwargs):
        self.calls.append({"prompt": prompt, "num_inference_steps": num_inference_steps, **kwargs})
        return SimpleNamespace(images=[Image.new("RGB", (8, 8)) for _ in prompt])


def test_registry_names_both_comparison_arms_at_256():
    assert set(arms.ARMS) == {"amused", "ldm_bert"}
    assert all(spec["size"] == 256 for spec in arms.ARMS.values())


def test_every_arm_declares_a_repo_and_a_pipeline_class():
    for spec in arms.ARMS.values():
        assert spec["repo"]
        assert callable(spec["pipeline"])


def test_unsupported_kwargs_are_dropped_instead_of_raising():
    """SD's guidance_rescale has no meaning for a masked transformer."""
    pipe = _NamedPipe()
    images = arms.run_arm(pipe, ["a", "b"], num_inference_steps=12, guidance_rescale=0.7)
    assert len(images) == 2
    assert pipe.calls[0]["num_inference_steps"] == 12


def test_a_pipeline_declaring_var_kwargs_still_only_gets_named_parameters():
    pipe = _KwargsPipe()
    arms.run_arm(pipe, ["a"], num_inference_steps=12, guidance_rescale=0.7)
    assert "guidance_rescale" not in pipe.calls[0]


def test_the_prompts_reach_the_pipeline_unchanged():
    pipe = _NamedPipe()
    arms.run_arm(pipe, ["a dog", "a cat"], batch_size=8)
    assert pipe.calls[0]["prompt"] == ["a dog", "a cat"]


def test_run_arm_batches_so_ten_512px_prompts_do_not_land_in_one_call():
    """SD at 512 with CFG is an effective UNet batch of 2n; 10 at once will not fit 8 GB."""
    pipe = _NamedPipe()
    images = arms.run_arm(pipe, [f"p{i}" for i in range(10)], batch_size=4)
    assert len(images) == 10
    assert [len(call["prompt"]) for call in pipe.calls] == [4, 4, 2]


def test_run_arm_defaults_to_the_configured_batch_size():
    pipe = _NamedPipe()
    arms.run_arm(pipe, [f"p{i}" for i in range(cfg.GEN_BATCH_SIZE + 1)])
    assert len(pipe.calls) == 2


def test_batching_keeps_the_prompt_order():
    pipe = _NamedPipe()
    arms.run_arm(pipe, [f"p{i}" for i in range(7)], batch_size=3)
    assert [p for call in pipe.calls for p in call["prompt"]] == [f"p{i}" for i in range(7)]


def test_an_unknown_arm_name_fails_loudly():
    with pytest.raises(KeyError):
        arms.load_arm("not_an_arm")

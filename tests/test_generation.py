from types import SimpleNamespace

import torch

from modules import generation

BASE = {"beta_schedule": "scaled_linear", "num_train_timesteps": 1000}
UNSAFE = set('/\\:*?"<>|')


class _Pipe:
    """Records every call, so a test can check what the UNet was actually handed."""

    device = torch.device("cpu")
    dtype = torch.float32

    def __init__(self):
        self.scheduler = SimpleNamespace(config=dict(BASE))
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(images=["img"] * len(kwargs["prompt_embeds"]))


def _ramp(n, *tail):
    """Tensor whose row i is filled with i, so slicing order is visible."""
    return torch.arange(n, dtype=torch.float32).view(n, *([1] * len(tail))).expand(n, *tail)


def test_label_is_filesystem_safe_and_distinguishes_configs():
    a = generation.GenConfig("dpmpp", 20, 7.5)
    b = generation.GenConfig("dpmpp", 20, 11.0)
    assert a.label != b.label
    assert not set(a.label) & UNSAFE


def test_karras_appears_in_the_label():
    c = generation.GenConfig("dpmpp", 20, 7.5, scheduler_kwargs=(("use_karras_sigmas", True),))
    assert "karras" in c.label


def test_a_false_flag_is_left_out_of_the_label():
    c = generation.GenConfig("dpmpp", 20, 7.5, scheduler_kwargs=(("use_karras_sigmas", False),))
    assert "karras" not in c.label


def test_a_string_scheduler_option_appears_by_value():
    c = generation.GenConfig("dpmpp", 20, 7.5, scheduler_kwargs=(("timestep_spacing", "trailing"),))
    assert "trailing" in c.label


def test_guidance_rescale_shows_only_when_set():
    assert "r0.7" in generation.GenConfig("dpmpp", 20, 15.0, guidance_rescale=0.7).label
    assert "r0" not in generation.GenConfig("dpmpp", 20, 15.0).label


def test_batches_cover_every_index_exactly_once():
    assert generation.batches(10, 4) == [slice(0, 4), slice(4, 8), slice(8, 10)]
    assert generation.batches(4, 4) == [slice(0, 4)]
    assert generation.batches(0, 4) == []


def test_generate_returns_one_image_per_prompt():
    pipe = _Pipe()
    images = generation.generate(
        pipe, _ramp(10, 77, 768), _ramp(10, 77, 768), _ramp(10, 4, 64, 64),
        generation.GenConfig("ddim", 20, 7.5), base_config=BASE, batch_size=4)
    assert len(images) == 10
    assert len(pipe.calls) == 3


def test_each_prompt_keeps_its_own_latent_across_batch_boundaries():
    pipe = _Pipe()
    generation.generate(
        pipe, _ramp(10, 77, 768), _ramp(10, 77, 768), _ramp(10, 4, 64, 64),
        generation.GenConfig("ddim", 20, 7.5), base_config=BASE, batch_size=4)
    latents = torch.cat([c["latents"][:, 0, 0, 0] for c in pipe.calls])
    embeds = torch.cat([c["prompt_embeds"][:, 0, 0] for c in pipe.calls])
    assert latents.tolist() == list(range(10))
    assert embeds.tolist() == list(range(10))


def test_each_prompt_gets_its_own_seeded_cpu_generator():
    """Euler-a and DDPM draw noise mid-loop; without this they use the global RNG.

    Pre-generated latents pin only the start. One generator per prompt means a prompt's
    mid-loop noise does not depend on which batch it landed in.
    """
    pipe = _Pipe()
    generation.generate(
        pipe, _ramp(10, 77, 768), _ramp(10, 77, 768), _ramp(10, 4, 64, 64),
        generation.GenConfig("euler_a", 30, 7.5), base_config=BASE, batch_size=4)
    gens = [g for call in pipe.calls for g in call["generator"]]
    assert len(gens) == 10
    assert all(g.device.type == "cpu" for g in gens)
    assert len({g.initial_seed() for g in gens}) == 10


def test_the_generator_seeds_do_not_depend_on_the_batch_size():
    def seeds(batch_size):
        pipe = _Pipe()
        generation.generate(
            pipe, _ramp(10, 77, 768), _ramp(10, 77, 768), _ramp(10, 4, 64, 64),
            generation.GenConfig("euler_a", 30, 7.5), base_config=BASE, batch_size=batch_size)
        return [g.initial_seed() for call in pipe.calls for g in call["generator"]]

    assert seeds(4) == seeds(10) == seeds(3)


def test_two_runs_of_the_same_config_use_the_same_seeds():
    def seeds():
        pipe = _Pipe()
        generation.generate(
            pipe, _ramp(4, 77, 768), _ramp(4, 77, 768), _ramp(4, 4, 64, 64),
            generation.GenConfig("euler_a", 30, 7.5), base_config=BASE)
        return [g.initial_seed() for call in pipe.calls for g in call["generator"]]

    assert seeds() == seeds()


def test_the_pipeline_is_never_given_a_raw_prompt():
    pipe = _Pipe()
    generation.generate(
        pipe, _ramp(4, 77, 768), _ramp(4, 77, 768), _ramp(4, 4, 64, 64),
        generation.GenConfig("ddim", 20, 7.5), base_config=BASE)
    assert all("prompt" not in call for call in pipe.calls)
    assert all("negative_prompt" not in call for call in pipe.calls)


def test_the_config_s_knobs_reach_the_pipeline():
    pipe = _Pipe()
    generation.generate(
        pipe, _ramp(2, 77, 768), _ramp(2, 77, 768), _ramp(2, 4, 64, 64),
        generation.GenConfig("ddim", 33, 11.0, guidance_rescale=0.7), base_config=BASE)
    call = pipe.calls[0]
    assert call["num_inference_steps"] == 33
    assert call["guidance_scale"] == 11.0
    assert call["guidance_rescale"] == 0.7


def test_generate_swaps_the_scheduler_to_the_config_s_sampler():
    pipe = _Pipe()
    generation.generate(
        pipe, _ramp(2, 77, 768), _ramp(2, 77, 768), _ramp(2, 4, 64, 64),
        generation.GenConfig("euler", 30, 7.5), base_config=BASE)
    assert type(pipe.scheduler).__name__ == "EulerDiscreteScheduler"

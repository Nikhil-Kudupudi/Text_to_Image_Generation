import torch

from modules import latents


def test_shape_tracks_resolution():
    assert latents.make_latents(3, height=512, width=512).shape == (3, 4, 64, 64)
    assert latents.make_latents(2, height=256, width=256).shape == (2, 4, 32, 32)


def test_non_square_resolution_keeps_both_axes():
    assert latents.make_latents(1, height=512, width=768).shape == (1, 4, 64, 96)


def test_same_seed_reproduces_exactly():
    assert torch.equal(latents.make_latents(4, seed=42), latents.make_latents(4, seed=42))


def test_different_seed_differs():
    assert not torch.equal(latents.make_latents(4, seed=42), latents.make_latents(4, seed=43))


def test_generator_is_cpu_so_runs_reproduce_across_machines():
    assert latents.make_latents(4, seed=42).device.type == "cpu"


def test_a_prefix_of_a_larger_draw_is_not_assumed_stable():
    """Row i belongs to prompt i, so n must not change which noise prompt 0 gets."""
    four = latents.make_latents(4, seed=42)
    ten = latents.make_latents(10, seed=42)
    assert torch.equal(four[0], ten[0])

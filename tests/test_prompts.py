import pandas as pd
import pytest

from modules import prompts


def _manifest(n):
    """A manifest with word counts cycling 3..25, so the 8-18 band is a real subset."""
    rows = []
    for i in range(n):
        n_words = 3 + (i % 23)
        rows.append({
            "pair_idx": i,
            "image_id": 1000 + i,
            "caption": " ".join(f"w{i}x{j}" for j in range(n_words)),
            "n_words": n_words,
            "image_512_path": f"data/processed/images_512/{i}.jpg",
        })
    return pd.DataFrame(rows)


def test_selection_is_deterministic_and_respects_word_bounds():
    m = _manifest(60)
    a = prompts.fixed_prompts(m, n=10, min_words=8, max_words=18, seed=42)
    b = prompts.fixed_prompts(m, n=10, min_words=8, max_words=18, seed=42)
    assert len(a) == 10
    assert a["caption"].tolist() == b["caption"].tolist()
    assert a["n_words"].between(8, 18).all()


def test_a_different_seed_selects_a_different_set():
    m = _manifest(60)
    a = prompts.fixed_prompts(m, n=10, seed=42)
    b = prompts.fixed_prompts(m, n=10, seed=7)
    assert a["caption"].tolist() != b["caption"].tolist()


def test_rows_come_back_in_pair_idx_order_with_a_reset_index():
    m = _manifest(60)
    a = prompts.fixed_prompts(m, n=10, seed=42)
    assert a["pair_idx"].tolist() == sorted(a["pair_idx"].tolist())
    assert a.index.tolist() == list(range(10))


def test_too_few_eligible_captions_raises():
    m = _manifest(60)
    with pytest.raises(ValueError, match="only 0"):
        prompts.fixed_prompts(m, n=10, min_words=40, max_words=50)

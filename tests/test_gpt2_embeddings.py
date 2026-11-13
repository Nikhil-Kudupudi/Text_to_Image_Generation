import torch

from modules import gpt2_embeddings


def _hidden(batch, length, dim=3):
    """Hidden states where position (b, t) is filled with a distinct value."""
    return torch.arange(batch * length * dim, dtype=torch.float32).view(batch, length, dim)


def test_last_token_pool_picks_the_final_real_token_not_the_last_position():
    """GPT-2 pads on the right, so position -1 is usually padding, not the sentence."""
    hidden = _hidden(2, 4)
    mask = torch.tensor([[1, 1, 0, 0], [1, 1, 1, 1]])
    pooled = gpt2_embeddings.last_token_pool(hidden, mask)
    assert torch.equal(pooled[0], hidden[0, 1])
    assert torch.equal(pooled[1], hidden[1, 3])


def test_last_token_pool_is_the_last_position_when_nothing_is_padded():
    hidden = _hidden(1, 5)
    pooled = gpt2_embeddings.last_token_pool(hidden, torch.ones(1, 5, dtype=torch.long))
    assert torch.equal(pooled[0], hidden[0, 4])


def test_a_fully_padded_row_does_not_index_out_of_range():
    hidden = _hidden(1, 4)
    pooled = gpt2_embeddings.last_token_pool(hidden, torch.zeros(1, 4, dtype=torch.long))
    assert pooled.shape == (1, 3)


def test_mean_pool_ignores_padding():
    hidden = torch.tensor([[[2.0, 2.0], [4.0, 4.0], [99.0, 99.0]]])
    mask = torch.tensor([[1, 1, 0]])
    assert torch.allclose(gpt2_embeddings.mean_pool(hidden, mask), torch.tensor([[3.0, 3.0]]))


def test_pooling_returns_one_vector_per_sequence():
    hidden = _hidden(5, 7, dim=768)
    mask = torch.ones(5, 7, dtype=torch.long)
    assert gpt2_embeddings.last_token_pool(hidden, mask).shape == (5, 768)
    assert gpt2_embeddings.mean_pool(hidden, mask).shape == (5, 768)

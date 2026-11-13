import torch

import config as cfg
from modules import conditioning


class _Batch(dict):
    def to(self, device):
        return self


class _Tok:
    """Records how it was called, and encodes each caption's length into its ids.

    Length-derived ids keep the stub deterministic and text-dependent, so a test can
    tell a positive embedding from a negative one.
    """

    def __init__(self):
        self.calls = []

    def __call__(self, texts, padding=None, max_length=None, truncation=None, return_tensors=None):
        self.calls.append({"padding": padding, "max_length": max_length, "truncation": truncation})
        ids = torch.tensor([[len(t) % 97] * max_length for t in texts], dtype=torch.long)
        return _Batch(input_ids=ids, attention_mask=torch.ones_like(ids))


class _Out:
    def __init__(self, hidden):
        self.last_hidden_state = hidden


class _Enc:
    dtype = torch.float32

    def __call__(self, input_ids=None, attention_mask=None):
        return _Out(input_ids.unsqueeze(-1).expand(-1, -1, 768).float())


def test_shape_is_the_sd_conditioning_shape():
    out = conditioning.encode_prompts(["a dog", "a cat"], _Tok(), _Enc())
    assert out.shape == (2, cfg.CLIP_MAX_TOKENS, 768)


def test_overlong_prompts_are_truncated_at_the_clip_limit():
    tok = _Tok()
    out = conditioning.encode_prompts([" ".join(["word"] * 400)], tok, _Enc())
    assert out.shape == (1, cfg.CLIP_MAX_TOKENS, 768)
    assert tok.calls[0]["truncation"] is True
    assert tok.calls[0]["max_length"] == cfg.CLIP_MAX_TOKENS
    assert tok.calls[0]["padding"] == "max_length"


def test_negative_is_broadcast_to_every_prompt():
    pos, neg = conditioning.conditioning_pair(["aa", "bbb", "cccc"], _Tok(), _Enc())
    assert pos.shape == neg.shape == (3, cfg.CLIP_MAX_TOKENS, 768)
    assert not torch.equal(pos, neg)


def test_every_row_of_the_negative_is_the_same_embedding():
    _, neg = conditioning.conditioning_pair(["aa", "bbb", "cccc"], _Tok(), _Enc())
    assert torch.equal(neg[0], neg[1]) and torch.equal(neg[1], neg[2])


def test_a_per_prompt_negative_list_is_used_as_given():
    pos, neg = conditioning.conditioning_pair(
        ["aa", "bbb"], _Tok(), _Enc(), negative=["x", "yyyyy"])
    assert not torch.equal(neg[0], neg[1])


def test_max_abs_difference_is_zero_for_identical_tensors():
    t = torch.randn(2, 77, 768)
    assert conditioning.max_abs_difference(t, t.clone()) == 0.0


def test_max_abs_difference_reports_the_largest_gap():
    a = torch.zeros(1, 4, 8)
    b = torch.zeros(1, 4, 8)
    b[0, 2, 3] = 0.25
    assert conditioning.max_abs_difference(a, b) == 0.25

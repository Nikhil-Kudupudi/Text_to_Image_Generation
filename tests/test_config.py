import config as cfg


def test_cfg_grid_spans_the_swept_range():
    assert min(cfg.CFG_GRID) >= 1.0
    assert max(cfg.CFG_GRID) <= 15.0
    assert 7.5 in cfg.CFG_GRID
    assert len(cfg.CFG_GRID) == 5


def test_sampler_registry_matches_the_spec():
    assert set(cfg.SAMPLERS) == {"pndm", "ddim", "lms", "euler", "euler_a", "dpmpp", "unipc"}
    assert cfg.SAMPLERS["pndm"] == 50
    assert cfg.SAMPLERS["ddim"] == 50
    assert cfg.SAMPLERS["dpmpp"] == 20
    assert cfg.SAMPLERS["unipc"] == 20


def test_fixed_prompt_and_latent_settings():
    assert cfg.N_FIXED_PROMPTS == 10
    assert cfg.LATENT_SEED == cfg.SEED
    assert cfg.GEN_BATCH_SIZE == 4


def test_sweep_directory_is_created_with_the_others():
    assert cfg.SWEEP_DIR in cfg.ALL_DIRS


def test_gpt2_is_measured_on_the_same_footing_as_bert():
    assert cfg.GPT2_MODEL
    assert cfg.GPT2_MAX_TOKENS == cfg.BERT_MAX_TOKENS

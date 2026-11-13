"""Reusable pipeline stages for the text-to-image project.

Each module is independent of the others, so one can be swapped or dropped
without disturbing the rest:

    data_preprocessing  caption cleaning, subset construction, image preprocessing
    clip_embeddings     CLIP text and image encoders
    bert_embeddings     BERT text encoder
    gpt2_embeddings     GPT-2 text encoder -- the autoregressive comparison
    storage             .npy arrays, the manifest, metadata, round-trip checks
    sanity_checks       shape/health, retrieval, sibling agreement, neighbours

Milestone 2 adds the generation side, in dependency order:

    prompts             the fixed prompt set every swept config renders
    latents             the fixed starting noise, drawn on a CPU generator
    sd_pipeline         loading SD 1.5, swapping samplers, freeing VRAM
    conditioning        prompt_embeds computed by hand, not by the pipeline
    generation          one swept config, and the call that renders it
    recording           image grids and the artefacts the write-up uses
    sweep               the grids, the run loop, the results table
    arms                aMUSEd and LDM-BERT, the comparison pipelines

Adding another text encoder means adding a file next to `bert_embeddings.py`
and one call in the notebook. Nothing else changes.
"""

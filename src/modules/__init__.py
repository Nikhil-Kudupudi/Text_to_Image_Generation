"""Reusable pipeline stages for the text-to-image project.

Each module is independent of the others, so one can be swapped or dropped
without disturbing the rest:

    data_preprocessing  caption cleaning, subset construction, image preprocessing
    clip_embeddings     CLIP text and image encoders
    bert_embeddings     BERT text encoder
    storage             .npy arrays, the manifest, metadata, round-trip checks
    sanity_checks       shape/health, retrieval, sibling agreement, neighbours

Adding another text encoder means adding a file next to `bert_embeddings.py`
and one call in the notebook. Nothing else changes.
"""

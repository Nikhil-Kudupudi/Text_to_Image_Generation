# Text_to_Image_Generation
This project works on training a model which can generate image from text, using diffusion models

## Setup

Dependencies are managed with [uv](https://docs.astral.sh/uv/):

```bash
uv sync
```

PyTorch is pinned to the **CUDA 12.8** build (`pytorch-cu128` index) because the dev GPU is an
RTX 50-series (Blackwell, `sm_120`), which the default PyPI `torch` wheel does not support.

### Windows: Smart App Control

On this machine, Windows Smart App Control blocks several unsigned native extension modules
(`.pyd`) — notably pandas and scikit-learn — when they live on the `D:` drive, and it blocks
`jupyter.exe` outright. The virtual environment therefore lives on `C:` and the project's
`.venv` is an NTFS **junction** pointing at it:

```
D:\git_repos\Text_to_Image_Generation\.venv  ->  C:\Users\nikhi\.venvs\t2i
```

`uv run`, VS Code and Jupyter all work normally through the junction. If `uv sync` ever
recreates `.venv` as a real directory and pandas starts failing with
`ImportError: DLL load failed ... An Application Control policy has blocked this file`,
recreate the junction:

```powershell
Remove-Item -Recurse -Force D:\git_repos\Text_to_Image_Generation\.venv; New-Item -ItemType Junction -Path D:\git_repos\Text_to_Image_Generation\.venv -Target C:\Users\nikhi\.venvs\t2i
```

Run notebooks through the project interpreter rather than the `jupyter` CLI, e.g. the VS Code
notebook editor with the `.venv` kernel selected.

## Milestones

| # | Notebook | Status |
|---|----------|--------|
| 1 | [`src/notebooks/milestone_1.ipynb`](src/notebooks/milestone_1.ipynb) — dataset prep, cleaning, CLIP/BERT embeddings | complete |

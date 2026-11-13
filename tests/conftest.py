"""Put `src/` on `sys.path` so tests import exactly as the notebooks do.

The modules use flat imports (`import config as cfg`) because that is what a
Kaggle notebook can do without installing the project. Tests inherit the same
layout rather than forcing the package into an installable shape.
"""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

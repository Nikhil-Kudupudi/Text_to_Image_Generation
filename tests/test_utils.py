import config as cfg
import utils


def test_rel_returns_a_path_relative_to_the_project_root():
    assert utils.rel(cfg.PROJECT_ROOT / "outputs" / "x.png") == "outputs/x.png"


def test_rel_does_not_raise_for_a_path_outside_the_project_root(tmp_path):
    """Its docstring promises a fallback, but relpath raises across Windows drives."""
    out = utils.rel(tmp_path / "x.png")
    assert isinstance(out, str)
    assert out.endswith("x.png")

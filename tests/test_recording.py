from PIL import Image

from modules import recording


def _img(w=32, h=32, colour=(120, 120, 120)):
    return Image.new("RGB", (w, h), colour)


def test_grid_geometry_for_an_exact_fit():
    assert recording.image_grid([_img(64, 64)] * 6, rows=2, cols=3, pad=0).size == (192, 128)


def test_a_short_last_row_still_fits():
    assert recording.image_grid([_img()] * 5, rows=2, cols=3, pad=0).size == (96, 64)


def test_grid_infers_a_square_ish_layout_when_not_given_one():
    assert recording.image_grid([_img()] * 7, pad=0).size == (96, 96)


def test_padding_is_added_between_and_around_the_tiles():
    assert recording.image_grid([_img()] * 4, rows=2, cols=2, pad=4).size == (76, 76)


def test_one_image_is_a_valid_grid():
    assert recording.image_grid([_img(48, 16)], pad=0).size == (48, 16)


def test_an_empty_list_raises_rather_than_making_a_zero_size_canvas():
    try:
        recording.image_grid([], pad=0)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_save_run_writes_every_image_and_a_grid(tmp_path):
    paths = recording.save_run([_img()] * 3, ["a", "b", "c"], "demo", out_dir=tmp_path)
    assert len(list((tmp_path / "demo").glob("*.png"))) == 4
    assert len(paths) == 4
    assert (tmp_path / "demo" / "grid.png").is_file()


def test_save_run_slugifies_labels_that_came_from_captions(tmp_path):
    recording.save_run([_img()], ["a dog: sitting / lying?"], "demo", out_dir=tmp_path)
    written = [p.name for p in (tmp_path / "demo").glob("*.png") if p.name != "grid.png"]
    assert len(written) == 1
    assert not set(written[0]) & set('/\\:*?"<>|')


def test_comparison_grid_adds_a_label_band_per_row():
    plain = recording.image_grid([_img()] * 2, rows=1, cols=2, pad=0)
    labelled = recording.comparison_grid({"baseline": [_img()] * 2, "best": [_img()] * 2}, pad=0)
    assert labelled.size[0] == plain.size[0]
    assert labelled.size[1] > 2 * plain.size[1]

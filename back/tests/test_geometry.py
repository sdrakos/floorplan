import math
from back.geometry import polygon_area_px2, px2_to_m2, simplify_polygon


def test_area_of_square():
    sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert polygon_area_px2(sq) == 100.0


def test_area_is_orientation_independent():
    cw = [(0, 0), (0, 10), (10, 10), (10, 0)]
    assert polygon_area_px2(cw) == 100.0


def test_area_degenerate_is_zero():
    assert polygon_area_px2([(0, 0), (1, 1)]) == 0.0


def test_px2_to_m2():
    assert math.isclose(px2_to_m2(2500.0, 50.0), 1.0)


def test_px2_to_m2_zero_scale_returns_none():
    assert px2_to_m2(2500.0, 0) is None
    assert px2_to_m2(2500.0, None) is None


def test_simplify_reduces_vertices_keeps_area():
    dense = [(0, 0), (5, 0), (10, 0), (10, 5), (10, 10), (5, 10), (0, 10), (0, 5)]
    simp = simplify_polygon(dense, epsilon_ratio=0.02)
    assert len(simp) < len(dense)
    assert math.isclose(polygon_area_px2(simp), 100.0, rel_tol=0.05)

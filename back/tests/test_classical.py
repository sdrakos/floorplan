import os
import pytest
from PIL import Image
from back.detector.classical import ClassicalDetector
from back.geometry import polygon_area_px2

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAMPLES = ["2-Bedroom-Home-Plan-With-Dimensions.png", "φλοορ2.jpg"]


def test_model_loaded_is_true_without_weights():
    assert ClassicalDetector().model_loaded is True


@pytest.mark.parametrize("fname", SAMPLES)
def test_detects_multiple_rooms_with_positive_area(fname):
    img = Image.open(os.path.join(ROOT, fname))
    rooms = ClassicalDetector().detect(img)
    assert len(rooms) >= 2, f"expected several rooms in {fname}, got {len(rooms)}"
    for r in rooms:
        assert polygon_area_px2(r.points) > 0
        assert r.type == "room_internal"

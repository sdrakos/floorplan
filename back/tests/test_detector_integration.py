import os
import pytest
from PIL import Image
from back.detector.cubicasa import CubiCasaDetector, _WEIGHTS
from back.geometry import polygon_area_px2

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAMPLES = ["2-Bedroom-Home-Plan-With-Dimensions.png", "φλοορ2.jpg"]

pytestmark = pytest.mark.skipif(not os.path.exists(_WEIGHTS), reason="weights not downloaded")


@pytest.mark.parametrize("fname", SAMPLES)
def test_detects_rooms_with_positive_area(fname):
    img = Image.open(os.path.join(ROOT, fname))
    rooms = CubiCasaDetector().detect(img)
    assert len(rooms) >= 1, f"no rooms detected in {fname}"
    for r in rooms:
        assert polygon_area_px2(r.points) > 0
        assert r.type.startswith("room_") or r.type in {"balcony", "parking"}

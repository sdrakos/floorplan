import os
os.environ["FLOORPLAN_DB_LOG"] = "0"  # don't write to Supabase during tests

import io
from PIL import Image
from fastapi.testclient import TestClient
from back.app import app
from back.dependencies import get_detector
from back.detector.base import RoomDetector, DetectedRoom


class StubDetector(RoomDetector):
    @property
    def model_loaded(self):
        return True

    def detect(self, image):
        return [DetectedRoom(label="Kitchen", points=[(0, 0), (100, 0), (100, 100), (0, 100)])]


app.dependency_overrides[get_detector] = lambda: StubDetector()
client = TestClient(app)


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (200, 200), "white").save(buf, format="PNG")
    buf.seek(0)
    return buf


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_detect_returns_rooms_px_only():
    r = client.post("/detect", files={"file": ("p.png", _png_bytes(), "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert body["rooms"][0]["type"] == "room_kitchen"
    assert body["rooms"][0]["areaPx2"] == 10000.0
    assert body["rooms"][0]["areaM2"] is None


def test_detect_with_scale_returns_m2():
    r = client.post("/detect",
                    data={"pixels_per_meter": "50"},
                    files={"file": ("p.png", _png_bytes(), "image/png")})
    assert r.status_code == 200
    assert abs(r.json()["rooms"][0]["areaM2"] - 4.0) < 1e-6


def test_detect_rejects_non_image():
    r = client.post("/detect", files={"file": ("x.txt", io.BytesIO(b"nope"), "text/plain")})
    assert r.status_code == 400

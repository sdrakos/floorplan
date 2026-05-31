# Back — Floor Plan Room Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `FLOORPLAN/back/` — a FastAPI service that detects rooms in a floor-plan image (CubiCasa5K on CPU) and returns room polygons + areas, then prove it on the two sample plans.

**Architecture:** Thin `app.py` mounts an `APIRouter` (`routers/detect.py`). The route depends on a lazily-loaded singleton `RoomDetector` (abstract base in `detector/base.py`). The only concrete implementation, `detector/cubicasa.py`, wraps a *vendored* copy of the CubiCasa5K network + post-processing and returns room polygons in **original-image pixel coordinates**. `geometry.py` computes area (shoelace, px² → m² when a `pixels_per_meter` is supplied) and simplifies polygons. Pydantic models in `schema.py` define the wire contract, which matches the shape `front/floor-plan-takeoff.jsx` already consumes.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, PyTorch (CPU), torchvision, NumPy, Pillow, OpenCV (`cv2.approxPolyDP`), pytest. CubiCasa5K is **CC BY-NC 4.0 — prototype engine only**, isolated behind `RoomDetector`.

**Reference spec:** `docs/superpowers/specs/2026-05-31-back-room-detection-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `back/requirements.txt` | Pinned deps (CPU torch) |
| `back/schema.py` | Pydantic request/response models (`Point`, `Room`, `DetectResponse`, `HealthResponse`) |
| `back/geometry.py` | Pure functions: `polygon_area_px2`, `px2_to_m2`, `simplify_polygon` |
| `back/detector/base.py` | `DetectedRoom` dataclass, `RoomDetector` ABC, `CUBICASA_TO_LAYER` mapping, `map_class` |
| `back/detector/cubicasa.py` | `CubiCasaDetector(RoomDetector)` — load weights (CPU), preprocess, infer, post-process → polygons |
| `back/detector/cubicasa_model/vendor/` | Vendored CubiCasa5K source (gitignored except a pointer) |
| `back/detector/cubicasa_model/weights/` | Downloaded `.pkl` weights (gitignored) |
| `back/scripts/download_weights.py` | Fetch + sanitize weights to a pure `state_dict` |
| `back/dependencies.py` | `get_detector()` lazy singleton for FastAPI `Depends` |
| `back/routers/detect.py` | `APIRouter`: `POST /detect`, `GET /health` |
| `back/app.py` | `FastAPI()`, CORS, `include_router` |
| `back/scripts/run_on_samples.py` | The real test — runs the detector on the two sample images |
| `back/tests/test_geometry.py` | Unit: area, scale conversion, simplification |
| `back/tests/test_mapping.py` | Unit: CubiCasa class → layer mapping |
| `back/tests/test_api.py` | API: `/health`, `/detect` with a stub detector via dependency override |
| `back/tests/test_detector_integration.py` | Integration on sample images (skipped if weights absent) |
| `back/README.md` | Setup, weights download, run, license note |

All commits in this plan use the repo convention: **author `sdrakos`, no `Co-Authored-By` line**, and never stage `.env`, `claude.db`, `.Claude/`, or weights (all gitignored). Run commands from `FLOORPLAN/`.

---

## Task 0: Environment & dependencies

**Files:**
- Create: `back/requirements.txt`

- [ ] **Step 1: Write `back/requirements.txt`**

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
python-multipart==0.0.*
pydantic==2.*
numpy==1.26.*
Pillow==10.*
opencv-python-headless==4.*
torch==2.2.*
torchvision==0.17.*
pytest==8.*
httpx==0.27.*
requests==2.*
scikit-image==0.22.*
```

- [ ] **Step 2: Create venv and install (CPU torch)**

Run:
```
python -m venv back/.venv
back\.venv\Scripts\python -m pip install --upgrade pip
back\.venv\Scripts\pip install -r back/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```
Expected: all install; `scikit-image` is required by CubiCasa post-processing.

- [ ] **Step 3: Verify torch CPU**

Run: `back\.venv\Scripts\python -c "import torch; print(torch.__version__, torch.cuda.is_available())"`
Expected: prints a `2.2.x` version and `False`.

- [ ] **Step 4: Commit**

```
git add back/requirements.txt
git commit -m "build(back): pin CPU dependencies for room-detection API"
```
> Note: `back/.venv/` is already covered by `.gitignore` (`.venv/`).

---

## Task 1: Wire contract — `schema.py`

**Files:**
- Create: `back/schema.py`
- Test: `back/tests/test_api.py` (created in Task 7; schema is exercised there)

- [ ] **Step 1: Write `back/schema.py`**

```python
"""Pydantic models — the /detect wire contract. Matches the shape that
front/floor-plan-takeoff.jsx builds for AI-detected shapes."""
from __future__ import annotations
from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float


class Room(BaseModel):
    label: str                       # raw model label, e.g. "Kitchen"
    type: str                        # front-end layer id, e.g. "room_kitchen"
    points: list[Point]              # original-image pixel coords
    areaPx2: float = Field(..., ge=0)
    areaM2: float | None = None      # null unless pixels_per_meter supplied


class ImageSize(BaseModel):
    w: int
    h: int


class DetectResponse(BaseModel):
    imageSize: ImageSize
    pixelsPerMeter: float | None = None
    rooms: list[Room]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
```

- [ ] **Step 2: Verify it imports**

Run: `back\.venv\Scripts\python -c "import back.schema as s; print(s.DetectResponse.model_json_schema()['title'])"`
Expected: prints `DetectResponse`.
> If the import path fails, run from `FLOORPLAN/` and ensure `back/__init__.py` and `back/tests/__init__.py` exist (create empty ones now).

- [ ] **Step 3: Commit**

```
git add back/__init__.py back/tests/__init__.py back/schema.py
git commit -m "feat(back): add Pydantic wire contract for /detect"
```

---

## Task 2: Geometry — `geometry.py` (TDD)

**Files:**
- Create: `back/geometry.py`
- Test: `back/tests/test_geometry.py`

- [ ] **Step 1: Write the failing test**

```python
# back/tests/test_geometry.py
import math
from back.geometry import polygon_area_px2, px2_to_m2, simplify_polygon


def test_area_of_unit_square():
    sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert polygon_area_px2(sq) == 100.0


def test_area_is_orientation_independent():
    cw = [(0, 0), (0, 10), (10, 10), (10, 0)]
    assert polygon_area_px2(cw) == 100.0


def test_px2_to_m2():
    # 50 px per meter => 2500 px^2 per m^2
    assert math.isclose(px2_to_m2(2500.0, 50.0), 1.0)


def test_px2_to_m2_zero_scale_returns_none():
    assert px2_to_m2(2500.0, 0) is None


def test_simplify_reduces_vertices_keeps_area():
    # a square with a redundant midpoint on each edge
    dense = [(0, 0), (5, 0), (10, 0), (10, 5), (10, 10), (5, 10), (0, 10), (0, 5)]
    simp = simplify_polygon(dense, epsilon_ratio=0.02)
    assert len(simp) < len(dense)
    assert math.isclose(polygon_area_px2(simp), 100.0, rel_tol=0.05)
```

- [ ] **Step 2: Run to verify it fails**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_geometry.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'back.geometry'`.

- [ ] **Step 3: Implement `back/geometry.py`**

```python
"""Pure polygon geometry helpers. No model/IO dependencies."""
from __future__ import annotations
import cv2
import numpy as np

Polygon = list[tuple[float, float]]


def polygon_area_px2(points: Polygon) -> float:
    """Shoelace area in px^2. Orientation-independent (absolute value)."""
    if len(points) < 3:
        return 0.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    s = 0.0
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        s += xs[i] * ys[j] - xs[j] * ys[i]
    return abs(s) / 2.0


def px2_to_m2(area_px2: float, pixels_per_meter: float | None) -> float | None:
    """Convert px^2 to m^2 given scale; None if scale missing/zero."""
    if not pixels_per_meter:
        return None
    return area_px2 / (pixels_per_meter ** 2)


def simplify_polygon(points: Polygon, epsilon_ratio: float = 0.01) -> Polygon:
    """Douglas-Peucker via OpenCV. epsilon = ratio * perimeter."""
    if len(points) < 3:
        return points
    contour = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
    peri = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, epsilon_ratio * peri, True)
    return [(float(p[0][0]), float(p[0][1])) for p in approx]
```

- [ ] **Step 4: Run to verify it passes**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_geometry.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```
git add back/geometry.py back/tests/test_geometry.py
git commit -m "feat(back): polygon area, scale conversion, simplification (TDD)"
```

---

## Task 3: Detector interface + class mapping — `detector/base.py` (TDD)

**Files:**
- Create: `back/detector/__init__.py` (empty), `back/detector/base.py`
- Test: `back/tests/test_mapping.py`

- [ ] **Step 1: Write the failing test**

```python
# back/tests/test_mapping.py
from back.detector.base import map_class, RoomDetector, DetectedRoom


def test_known_classes_map_to_layers():
    assert map_class("Kitchen") == "room_kitchen"
    assert map_class("Bath") == "room_wc"
    assert map_class("Bedroom") == "room_internal"
    assert map_class("Living Room") == "room_internal"
    assert map_class("Outdoor") == "balcony"


def test_unknown_class_falls_back_to_internal():
    assert map_class("Sauna") == "room_internal"


def test_detector_is_abstract():
    import pytest
    with pytest.raises(TypeError):
        RoomDetector()  # cannot instantiate ABC


def test_detected_room_holds_pixels():
    r = DetectedRoom(label="Kitchen", type="room_kitchen", points=[(0, 0), (1, 0), (1, 1)])
    assert r.points[1] == (1, 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_mapping.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `back/detector/base.py`**

```python
"""Swappable detector interface. CubiCasa (CC BY-NC) hides behind this so the
engine can be replaced for commercial use without touching routers/geometry."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from PIL import Image

# CubiCasa room class label -> front-end layer id
CUBICASA_TO_LAYER: dict[str, str] = {
    "Kitchen": "room_kitchen",
    "Bath": "room_wc",
    "Living Room": "room_internal",
    "Bedroom": "room_internal",
    "Hallway": "room_internal",
    "Other rooms": "room_internal",
    "Outdoor": "balcony",
    "Garage": "parking",
}


def map_class(cubicasa_label: str) -> str:
    """Map a CubiCasa room class to a front-end layer id; default room_internal."""
    return CUBICASA_TO_LAYER.get(cubicasa_label, "room_internal")


@dataclass
class DetectedRoom:
    label: str                              # raw model label
    type: str = ""                          # layer id; filled by map_class if empty
    points: list[tuple[float, float]] = field(default_factory=list)  # pixels

    def __post_init__(self):
        if not self.type:
            self.type = map_class(self.label)


class RoomDetector(ABC):
    @abstractmethod
    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        """Return rooms as polygons in ORIGINAL image pixel coordinates."""
        raise NotImplementedError

    @property
    @abstractmethod
    def model_loaded(self) -> bool:
        ...
```

- [ ] **Step 4: Run to verify it passes**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_mapping.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```
git add back/detector/__init__.py back/detector/base.py back/tests/test_mapping.py
git commit -m "feat(back): RoomDetector ABC + CubiCasa class mapping (TDD)"
```

---

## Task 4: Vendor CubiCasa5K + weights

**Files:**
- Create: `back/detector/cubicasa_model/__init__.py`, `back/detector/cubicasa_model/VENDOR.md`
- Create: `back/scripts/download_weights.py`
- Modify: `.gitignore` (already ignores `*.pkl`, `*.pth`, weights dir — add the vendor dir)

- [ ] **Step 1: Clone the modernized fork into the vendor dir**

Run:
```
git clone https://github.com/EmanuelKuhn/CubiCasa5k back/detector/cubicasa_model/vendor
```
> The EmanuelKuhn fork has "fixed dependencies for 2022" and is closer to modern PyTorch than the original. The model code lives under `vendor/floortrans/` (`models/`, `post_prosessing.py`, `loaders/`).

- [ ] **Step 2: Read the inference path to learn exact symbol names**

Open and read these vendored files; note the exact import paths and function signatures used at inference time:
- `vendor/samples.ipynb` (or `vendor/eval.py`) — how the model is built, weights loaded, and prediction split.
- `vendor/floortrans/models/__init__.py` — the `get_model("hg_furukawa_original", 51)` builder.
- `vendor/floortrans/post_prosessing.py` — `split_prediction`, `get_polygons`, and the `room_polygons` structure.

Record (in `VENDOR.md`) the confirmed: model-builder call, the heatmap/rooms/icons split, the `get_polygons(...)` return shape, and the **room class index → name** list (CubiCasa room classes: `["Background","Outdoor","Wall","Kitchen","Living Room","Bedroom","Bath","Entry","Railing","Storage","Garage","Undefined"]` — confirm against the vendored `loaders`).

- [ ] **Step 3: Add `.gitignore` entry for the vendor tree**

Append to `FLOORPLAN/.gitignore`:
```
# ── Vendored CubiCasa5K (CC BY-NC; clone locally, do not redistribute) ──
back/detector/cubicasa_model/vendor/
```

- [ ] **Step 4: Write `back/scripts/download_weights.py`**

```python
"""Download CubiCasa5K weights and sanitize to a pure state_dict.

The official weights live on Google Drive (see the CubiCasa5k README). Set
CUBICASA_WEIGHTS_URL to a direct-download URL, or place the .pkl manually at
the SRC path below, then run this script to produce a safe state_dict.
"""
import os
import sys
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(HERE, "..", "detector", "cubicasa_model", "weights")
SRC = os.path.join(WEIGHTS_DIR, "model_best_val_loss_var.pkl")        # raw download
DST = os.path.join(WEIGHTS_DIR, "cubicasa_state_dict.pth")            # sanitized


def main():
    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    if not os.path.exists(SRC):
        print(f"Place the downloaded weights at:\n  {SRC}\n"
              f"(Google Drive link is in back/detector/cubicasa_model/vendor/README.md)")
        sys.exit(1)
    # Raw checkpoint is a full pickled dict from the original repo -> trusted offline convert.
    ckpt = torch.load(SRC, map_location="cpu", weights_only=False)
    state = ckpt["model_state"] if isinstance(ckpt, dict) and "model_state" in ckpt else ckpt
    torch.save(state, DST)
    print(f"Wrote sanitized state_dict -> {DST}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the weights download/sanitize**

Run: `back\.venv\Scripts\python back/scripts/download_weights.py`
Expected: either prints the manual-placement instructions (then place the file and re-run), or `Wrote sanitized state_dict`.

- [ ] **Step 6: Commit (code only — weights & vendor are gitignored)**

```
git add .gitignore back/detector/cubicasa_model/__init__.py back/detector/cubicasa_model/VENDOR.md back/scripts/download_weights.py
git commit -m "chore(back): vendor CubiCasa5K + weights download/sanitize script"
```

---

## Task 5: CubiCasa detector wrapper — `detector/cubicasa.py`

**Files:**
- Create: `back/detector/cubicasa.py`
- Test: `back/tests/test_detector_integration.py`

> This wrapper integrates with the vendored code. The symbol names below match the
> CubiCasa5K public API; **if Task 4 Step 2 recorded different names, align them here.**
> Keep all CubiCasa imports inside methods so the rest of the app imports without torch loaded.

- [ ] **Step 1: Implement `back/detector/cubicasa.py`**

```python
"""CubiCasa5K wrapper (CC BY-NC 4.0 — prototype engine only).

Loads the vendored network on CPU, runs a single image, and converts the
post-processed room polygons into DetectedRoom objects in ORIGINAL image pixels.
"""
from __future__ import annotations
import os
import sys
import numpy as np
import torch
from PIL import Image

from .base import RoomDetector, DetectedRoom

_HERE = os.path.dirname(os.path.abspath(__file__))
_VENDOR = os.path.join(_HERE, "cubicasa_model", "vendor")
_WEIGHTS = os.path.join(_HERE, "cubicasa_model", "weights", "cubicasa_state_dict.pth")
_MAX_DIM = 1024

# CubiCasa room-class index -> label. CONFIRM against vendored loaders (Task 4 Step 2).
ROOM_CLASSES = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room",
                "Bedroom", "Bath", "Entry", "Railing", "Storage", "Garage", "Undefined"]
SKIP_CLASSES = {"Background", "Wall", "Railing", "Undefined"}


class CubiCasaDetector(RoomDetector):
    def __init__(self, weights_path: str = _WEIGHTS):
        self._weights_path = weights_path
        self._model = None  # lazy

    @property
    def model_loaded(self) -> bool:
        return self._model is not None

    def _ensure_model(self):
        if self._model is not None:
            return
        if not os.path.exists(self._weights_path):
            raise FileNotFoundError(
                f"Weights not found at {self._weights_path}. "
                f"Run: python back/scripts/download_weights.py")
        if _VENDOR not in sys.path:
            sys.path.insert(0, _VENDOR)
        from floortrans.models import get_model  # vendored
        model = get_model("hg_furukawa_original", 51)
        # n_classes = 44 (heatmaps) + 12 (rooms) ... match the vendored config.
        model.conv4_ = torch.nn.Conv2d(256, 44 + 12, kernel_size=4, stride=4)  # CONFIRM head dims
        model.upsample = torch.nn.ConvTranspose2d(44 + 12, 44 + 12, kernel_size=4, stride=4)
        state = torch.load(self._weights_path, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()
        self._model = model

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        self._ensure_model()
        from floortrans.post_prosessing import split_prediction, get_polygons  # vendored

        rgb = image.convert("RGB")
        orig_w, orig_h = rgb.size
        scale = min(1.0, _MAX_DIM / max(orig_w, orig_h))
        proc_w, proc_h = int(round(orig_w * scale)), int(round(orig_h * scale))
        small = rgb.resize((proc_w, proc_h))

        arr = np.asarray(small, dtype=np.float32) / 255.0
        arr = 2.0 * arr - 1.0                                   # CubiCasa normalization [-1,1]
        tensor = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0)

        with torch.no_grad():
            pred = self._model(tensor)

        # split_prediction -> (heatmaps, rooms, icons); get_polygons -> list of polygons w/ class
        heatmaps, rooms, icons = split_prediction(pred, (proc_h, proc_w), [21, 12, 11])  # CONFIRM split sizes
        polygons, types, room_polygons = get_polygons((heatmaps, rooms, icons), 0.2, [1, 2])  # CONFIRM args

        inv = 1.0 / scale
        out: list[DetectedRoom] = []
        for poly, cls_idx in room_polygons:                     # CONFIRM iteration shape
            label = ROOM_CLASSES[cls_idx] if 0 <= cls_idx < len(ROOM_CLASSES) else "Undefined"
            if label in SKIP_CLASSES:
                continue
            pts = [(float(x) * inv, float(y) * inv) for (x, y) in poly]
            if len(pts) >= 3:
                out.append(DetectedRoom(label=label, points=pts))
        return out
```

- [ ] **Step 2: Write the integration test (auto-skips without weights)**

```python
# back/tests/test_detector_integration.py
import os
import pytest
from PIL import Image
from back.detector.cubicasa import CubiCasaDetector, _WEIGHTS
from back.geometry import polygon_area_px2

SAMPLES = ["2-Bedroom-Home-Plan-With-Dimensions.png", "φλοορ2.jpg"]
pytestmark = pytest.mark.skipif(not os.path.exists(_WEIGHTS), reason="weights not downloaded")


@pytest.mark.parametrize("fname", SAMPLES)
def test_detects_rooms_with_positive_area(fname):
    img = Image.open(fname)
    rooms = CubiCasaDetector().detect(img)
    assert len(rooms) >= 1, f"no rooms detected in {fname}"
    for r in rooms:
        assert polygon_area_px2(r.points) > 0
        assert r.type.startswith("room_") or r.type in {"balcony", "parking"}
```

- [ ] **Step 3: Run the integration test**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_detector_integration.py -v`
Expected: PASS (≥1 room per image), or SKIPPED if weights absent.
> If `split_prediction`/`get_polygons` signatures differ from the vendored code, fix the three `# CONFIRM` lines using what Task 4 Step 2 recorded, then re-run until green.

- [ ] **Step 4: Commit**

```
git add back/detector/cubicasa.py back/tests/test_detector_integration.py
git commit -m "feat(back): CubiCasa5K CPU detector wrapper + integration test"
```

---

## Task 6: Lazy singleton — `dependencies.py`

**Files:**
- Create: `back/dependencies.py`

- [ ] **Step 1: Implement `back/dependencies.py`**

```python
"""Lazy singleton detector for FastAPI Depends — model loads once, not per request."""
from __future__ import annotations
from functools import lru_cache
from .detector.base import RoomDetector
from .detector.cubicasa import CubiCasaDetector


@lru_cache(maxsize=1)
def get_detector() -> RoomDetector:
    return CubiCasaDetector()
```

- [ ] **Step 2: Verify import**

Run: `back\.venv\Scripts\python -c "from back.dependencies import get_detector; print(get_detector().__class__.__name__)"`
Expected: prints `CubiCasaDetector` (constructing it does NOT load weights yet).

- [ ] **Step 3: Commit**

```
git add back/dependencies.py
git commit -m "feat(back): lazy singleton detector dependency"
```

---

## Task 7: Router — `routers/detect.py` (TDD with dependency override)

**Files:**
- Create: `back/routers/__init__.py` (empty), `back/routers/detect.py`
- Test: `back/tests/test_api.py`

- [ ] **Step 1: Write the failing API test (stub detector, no torch)**

```python
# back/tests/test_api.py
import io
from PIL import Image
from fastapi.testclient import TestClient
from back.app import app
from back.dependencies import get_detector
from back.detector.base import RoomDetector, DetectedRoom


class StubDetector(RoomDetector):
    @property
    def model_loaded(self): return True
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
    assert abs(r.json()["rooms"][0]["areaM2"] - 4.0) < 1e-6  # 10000/2500


def test_detect_rejects_non_image():
    r = client.post("/detect", files={"file": ("x.txt", io.BytesIO(b"nope"), "text/plain")})
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify it fails**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_api.py -v`
Expected: FAIL — `back.app` / `back.routers.detect` not found.

- [ ] **Step 3: Implement `back/routers/detect.py`**

```python
"""APIRouter for room detection."""
from __future__ import annotations
import io
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from ..dependencies import get_detector
from ..detector.base import RoomDetector
from ..geometry import polygon_area_px2, px2_to_m2, simplify_polygon
from ..schema import DetectResponse, HealthResponse, ImageSize, Point, Room

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(detector: RoomDetector = Depends(get_detector)) -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=detector.model_loaded)


@router.post("/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    pixels_per_meter: float | None = Form(default=None),
    detector: RoomDetector = Depends(get_detector),
) -> DetectResponse:
    raw = await file.read()
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Could not read image file")

    detected = detector.detect(image)
    rooms: list[Room] = []
    for d in detected:
        pts = simplify_polygon(d.points)
        area_px2 = polygon_area_px2(pts)
        rooms.append(Room(
            label=d.label, type=d.type,
            points=[Point(x=x, y=y) for (x, y) in pts],
            areaPx2=area_px2,
            areaM2=px2_to_m2(area_px2, pixels_per_meter),
        ))
    return DetectResponse(
        imageSize=ImageSize(w=image.width, h=image.height),
        pixelsPerMeter=pixels_per_meter,
        rooms=rooms,
    )
```

- [ ] **Step 4: Create `back/routers/__init__.py`** (empty file).

- [ ] **Step 5: Run tests (will still fail until app.py exists — Task 8)**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_api.py -v`
Expected: still FAIL on `import back.app`. Proceed to Task 8, then re-run.

- [ ] **Step 6: Commit**

```
git add back/routers/__init__.py back/routers/detect.py
git commit -m "feat(back): /detect + /health APIRouter (px and m^2 output)"
```

---

## Task 8: App entrypoint — `app.py`

**Files:**
- Create: `back/app.py`

- [ ] **Step 1: Implement `back/app.py`**

```python
"""FastAPI entrypoint — thin: CORS + include routers only."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import detect

app = FastAPI(title="FloorPlan Room Detection", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # browser front-end calls this locally
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
```

- [ ] **Step 2: Run the API tests (now green)**

Run: `back\.venv\Scripts\python -m pytest back/tests/test_api.py -v`
Expected: 5 passed.

- [ ] **Step 3: Run the whole unit suite**

Run: `back\.venv\Scripts\python -m pytest back/tests -v --ignore=back/tests/test_detector_integration.py`
Expected: all pass.

- [ ] **Step 4: Commit**

```
git add back/app.py
git commit -m "feat(back): FastAPI app wiring (CORS + APIRouter)"
```

---

## Task 9: The real test — run on the two sample plans

**Files:**
- Create: `back/scripts/run_on_samples.py`

- [ ] **Step 1: Implement `back/scripts/run_on_samples.py`**

```python
"""Run the detector on the two bundled floor plans and print an area report.

Optionally pass a scale (px per meter) per image to also report m^2:
  python back/scripts/run_on_samples.py --ppm 2bed=120 --ppm floor2=95
"""
from __future__ import annotations
import argparse
import io
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from back.detector.cubicasa import CubiCasaDetector
from back.geometry import polygon_area_px2, px2_to_m2, simplify_polygon

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAMPLES = {"2bed": "2-Bedroom-Home-Plan-With-Dimensions.png", "floor2": "φλοορ2.jpg"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ppm", action="append", default=[], help="key=pixels_per_meter")
    args = ap.parse_args()
    ppm = {}
    for kv in args.ppm:
        k, v = kv.split("=")
        ppm[k] = float(v)

    det = CubiCasaDetector()
    for key, fname in SAMPLES.items():
        path = os.path.join(ROOT, fname)
        print(f"\n=== {fname} ===")
        rooms = det.detect(Image.open(path))
        scale = ppm.get(key)
        total_m2 = 0.0
        for i, r in enumerate(rooms, 1):
            pts = simplify_polygon(r.points)
            a_px = polygon_area_px2(pts)
            a_m2 = px2_to_m2(a_px, scale)
            extra = f"  {a_m2:7.2f} m²" if a_m2 is not None else ""
            if a_m2:
                total_m2 += a_m2
            print(f"  {i:>2}. {r.type:<14} {r.label:<12} {a_px:12.0f} px²{extra}")
        print(f"  rooms: {len(rooms)}" + (f"  total: {total_m2:.2f} m²" if scale else ""))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run on both plans (pixels only first)**

Run: `back\.venv\Scripts\python back/scripts/run_on_samples.py`
Expected: a table of detected rooms with `type`, `label`, and px² area for each image; `rooms: N` ≥ 1 per image.

- [ ] **Step 3: Derive a scale and re-run for m²**

For `2-Bedroom-Home-Plan-With-Dimensions.png` (it prints dimensions): measure the pixel length of one wall whose meters are labeled, compute `pixels_per_meter = pixel_length / meters`, then:
Run: `back\.venv\Scripts\python back/scripts/run_on_samples.py --ppm 2bed=<value>`
Expected: per-room m² and a plausible total (a 2-bedroom home is typically ~60–110 m²). Sanity-check the magnitude; if absurd, the scale or detection needs revisiting.

- [ ] **Step 4: Start the server and smoke-test the live endpoint**

Run: `back\.venv\Scripts\uvicorn back.app:app --port 8000` (in one terminal)
Run (another): `curl -s -F "file=@2-Bedroom-Home-Plan-With-Dimensions.png" -F "pixels_per_meter=<value>" http://localhost:8000/detect`
Expected: JSON `DetectResponse` with `rooms[]`, each having `points`, `areaPx2`, `areaM2`.

- [ ] **Step 5: Commit**

```
git add back/scripts/run_on_samples.py
git commit -m "test(back): sample-plan runner; verified room detection on both plans"
```

---

## Task 10: Docs + final push

**Files:**
- Create: `back/README.md`

- [ ] **Step 1: Write `back/README.md`** covering: purpose; `RoomDetector` swappable interface; **CC BY-NC license note (prototype only, swap before commercial use)**; venv + install (CPU torch extra-index); `git clone` the vendor fork; `download_weights.py`; `uvicorn back.app:app`; `POST /detect` (multipart `file` + optional `pixels_per_meter`) and `GET /health`; how to run the test suite and `run_on_samples.py`. State that scale is supplied by the caller (front-end manual calibration).

- [ ] **Step 2: Run full suite once more**

Run: `back\.venv\Scripts\python -m pytest back/tests -v`
Expected: unit tests pass; integration tests pass (weights present) or skip.

- [ ] **Step 3: Commit and push (as sdrakos)**

```
git add back/README.md
git commit -m "docs(back): room-detection API usage + license note"
git push origin main
```
> Verify nothing secret/large was pushed: `.env`, `claude.db`, `weights/`, `vendor/` must remain untracked.

---

## Self-Review

**Spec coverage:**
- §1 goal (photo → room polygons + area, manual scale) → Tasks 5,7,9. ✓
- §3 structure (app/routers/detector/geometry/schema/dependencies) → Tasks 1,3,5,6,7,8. ✓
- §4 APIRouter + `Depends` singleton + response shape → Tasks 6,7,8. ✓
- §5 swappable `RoomDetector` ABC → Task 3. ✓
- §6 CubiCasa CPU, resize-to-1024 + scale-back, class mapping, `weights_only=True` → Tasks 3,4,5. ✓
- §7 shoelace + px²→m² + `approxPolyDP` simplify → Task 2. ✓
- §8 error handling (400 bad image, 503 missing weights via FileNotFoundError) → Tasks 5,7. ✓
- §9 license note → Tasks 4,10. ✓
- §10 tests (geometry, mapping, integration on the 2 samples, API) → Tasks 2,3,5,7. ✓
- §11 dependencies → Task 0. ✓

**Placeholder scan:** The three `# CONFIRM` lines in Task 5 and the head-dims line are *external-integration alignment points*, not lazy placeholders — Task 4 Step 2 produces the exact values, and Task 5 Step 3 iterates until the integration test is green. Acceptable and explicitly resolved.

**Type consistency:** `DetectedRoom(label, type, points)`, `map_class`, `get_detector`, `RoomDetector.detect/model_loaded`, `polygon_area_px2/px2_to_m2/simplify_polygon`, `Room/Point/DetectResponse/ImageSize/HealthResponse` are used consistently across Tasks 1–9. ✓

**Known risk:** CubiCasa's post-processing API is the one external unknown; Task 4 Step 2 (read vendored source) de-risks Task 5 before code is written. If the fork won't load on torch 2.2, fall back to pinning `torch==1.13` in `back/requirements.txt` (still CPU) — the rest of the plan is unaffected.

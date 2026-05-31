# Back — Floor Plan Room Detection API (FastAPI + CubiCasa5K)

**Date:** 2026-05-31
**Status:** Approved design, pending implementation plan
**Location:** `FLOORPLAN/back/`

## 1. Goal

From a floor-plan **photo/image**, detect each room as a **polygon** with a category, and
compute its **area**. Real-world scale (pixels → meters) is supplied **manually** by the existing
front-end (`floor-plan-takeoff.jsx`), which already lets the user calibrate by drawing a line over a
known dimension. Therefore the back works natively in **pixels** and converts to m² only when a
`pixels_per_meter` value is provided.

### Non-goals
- Automatic scale inference (OCR of dimensions, reference-object sizing) — explicitly out of scope.
- Front-end integration of the detect button — tracked as an optional follow-up step, not core.
- Commercial deployment of CubiCasa5K (see §9).

## 2. Data Flow

```
image ──POST /detect──▶ CubiCasaDetector (CPU) ──▶ post-process ──▶ room polygons (px)
                                                                          │
                              (+ optional pixels_per_meter) ──▶ areas px² and m²
```

## 3. Directory Structure

```
back/
├── app.py                 # FastAPI(): CORS, app.include_router(...)  — NO routes here
├── routers/
│   ├── __init__.py
│   └── detect.py          # APIRouter — POST /detect, GET /health
├── detector/
│   ├── __init__.py
│   ├── base.py            # RoomDetector (ABC) — the swappable interface
│   ├── cubicasa.py        # CubiCasaDetector — first implementation
│   └── cubicasa_model/    # ported CubiCasa5K net + post-processing
│       └── weights/       # model weights — gitignored (large file + NC license)
├── geometry.py            # shoelace area, polygon simplification, px²→m²
├── schema.py              # Pydantic request/response models
├── dependencies.py        # lazy-loaded singleton detector (FastAPI Depends)
├── tests/
│   ├── test_geometry.py
│   ├── test_mapping.py
│   └── test_api.py
├── requirements.txt
└── README.md              # setup + weights download instructions
```

## 4. API Design (APIRouter)

`app.py` is thin: create `FastAPI()`, add CORS middleware (browser calls it from the front-end),
and `app.include_router(detect.router)`. All endpoints live in `routers/detect.py` as an `APIRouter`.

### Endpoints

**`GET /health`** → `{ "status": "ok", "model_loaded": bool }`

**`POST /detect`** (multipart/form-data)
- `file`: image (PNG/JPG)
- `pixels_per_meter`: optional float
- Detector is injected via `Depends(get_detector)` so the model loads **once** (lazy singleton in
  `dependencies.py`), not per request.

Response (`schema.py`):
```json
{
  "imageSize": { "w": 1024, "h": 768 },
  "pixelsPerMeter": 50.0,
  "rooms": [
    {
      "label": "Kitchen",
      "type": "room_kitchen",
      "points": [{ "x": 100, "y": 200 }, ...],
      "areaPx2": 40000.0,
      "areaM2": 16.0
    }
  ]
}
```
`areaM2` is `null` when `pixels_per_meter` is not supplied. `points`, `imageSize` are in **original
image pixel coordinates** (polygons scaled back after the internal resize, see §6).

## 5. Swappable Detector Interface (the key abstraction)

```python
# detector/base.py
class DetectedRoom(NamedTuple):     # or Pydantic
    label: str                       # raw model label, e.g. "Kitchen"
    type: str                        # front-end layer id, e.g. "room_kitchen"
    points: list[tuple[float, float]]  # pixels, original image coords

class RoomDetector(ABC):
    @abstractmethod
    def detect(self, image: "PIL.Image.Image") -> list[DetectedRoom]: ...
```

The entire CubiCasa engine hides behind this. Swapping engines later (e.g. due to the license, §9)
changes **only** `cubicasa.py` and the `get_detector()` wiring — routers, geometry, schema, and the
output contract are untouched.

## 6. CubiCasa5K Engine

- Source: `github.com/CubiCasa/CubiCasa5k` (CC BY-NC 4.0). Port the network definition and
  `post_prosessing` (junction → wall/room polygon extraction) into `detector/cubicasa_model/`,
  adapted to run on **modern PyTorch / CPU** (`torch.load(..., map_location="cpu")`,
  `model.eval()`, `torch.no_grad()`).
- **Security:** weights come from a third-party Google Drive link, and `torch.load` defaults to
  `weights_only=False` (arbitrary code execution via unpickling). Load with `weights_only=True`. If
  the CubiCasa checkpoint fails under that flag (it bundles non-tensor objects), convert it once in a
  trusted, offline step to a pure `state_dict` and commit/distribute that sanitized file instead —
  never `weights_only=False` on the raw download.
- Input is resized so the max dimension is ~1024 px (mirrors the front-end). The resize factor is
  recorded and **all output polygons are scaled back** to original image coordinates.
- Weights downloaded via a documented script into `cubicasa_model/weights/` (gitignored).

### Class mapping (CubiCasa room class → front-end layer id)

| CubiCasa class | layer `type` |
|---|---|
| Kitchen | `room_kitchen` |
| Bath | `room_wc` |
| Living Room / Bedroom / Hallway / Other rooms | `room_internal` |
| Outdoor | `balcony` |

Mapping lives in one place (a dict in `cubicasa.py`) and is unit-tested. Unmapped classes fall back
to `room_internal`. Non-room classes (Wall, Background, Railing) are dropped from the `rooms` output.

The output shape (`{ type, points:[{x,y}], label }`) deliberately matches the shape
`floor-plan-takeoff.jsx` already builds for AI-detected shapes, so the response drops into the
existing UI data model without changes.

## 7. Geometry (`geometry.py`)

- **Area:** shoelace formula → px². `area_m2 = area_px2 / pixels_per_meter**2`.
- **Simplification:** Douglas-Peucker via OpenCV `cv2.approxPolyDP` so vertices are clean and
  editable in the UI rather than a dense pixel-traced contour.
- Pure functions, no model/IO dependency — independently testable.

## 8. Error Handling

| Condition | Response |
|---|---|
| 0 rooms detected | `200` with empty `rooms` list |
| Unreadable / non-image file | `400` with message |
| Weights file missing | `503` with download instructions |
| Oversized image | auto-resize (no error) |

## 9. License Constraint

CubiCasa5K is **CC BY-NC 4.0 — non-commercial only**. The FLOORPLAN front-end is a commercial
construction-quoting tool, so CubiCasa is adopted as a **prototype engine for now**, behind the
`RoomDetector` interface, with the explicit expectation that it is swapped for a
commercially-licensed engine before any commercial use. This is the reason §5's abstraction is
mandatory, not optional. `README.md` states this constraint prominently.

## 10. Testing

- **Unit — geometry:** shoelace area of a known square equals side²; px²→m² conversion with a known
  `pixels_per_meter`; simplification reduces vertex count while preserving area within tolerance.
- **Unit — mapping:** each CubiCasa class maps to the expected layer id; unknown → `room_internal`.
- **Integration — detector:** run on the two bundled sample images
  (`2-Bedroom-Home-Plan-With-Dimensions.png`, `φλοορ2.jpg`) → returns ≥1 room, all areas positive
  and within a sane magnitude. Skipped automatically if weights are absent.
- **API:** `fastapi.testclient.TestClient` POST `/detect` with a sample image → `200`, response
  validates against the Pydantic schema; `GET /health` → `200`.

## 11. Dependencies (`requirements.txt`)

`fastapi`, `uvicorn`, `python-multipart` (file upload), `torch`, `torchvision`, `numpy`, `Pillow`
(image IO), `opencv-python` (`approxPolyDP`), `pydantic`. Pinned to current stable versions;
CPU-only torch wheel.

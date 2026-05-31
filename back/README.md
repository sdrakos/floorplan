# FloorPlan Room Detection API (`back/`)

FastAPI service that detects rooms in a floor-plan image and returns each room as a
polygon with its area. Engine: **CubiCasa5K** on CPU.

> **License:** CubiCasa5K is **CC BY-NC 4.0 — non-commercial only**. It is used here as a
> **prototype engine** behind the swappable `RoomDetector` interface (`detector/base.py`).
> Swap it for a commercially-licensed engine before any commercial use — only `detector/cubicasa.py`
> and `dependencies.get_detector()` change.

## Scale → area

The service works in **pixels**. Real-world area (m²) is computed only when the caller passes
`pixels_per_meter` — that scale comes from the front-end's manual calibration
(`front/floor-plan-takeoff.jsx`, draw a line over a known dimension). Without it, only `areaPx2` is returned.

## Setup (Windows, Python 3.13)

```bat
python -m venv back\.venv
back\.venv\Scripts\pip install -r back\requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

REM Vendor the model code (CC BY-NC; not redistributed in this repo) + apply compat patches
git clone --depth 1 https://github.com/EmanuelKuhn/CubiCasa5k back\detector\cubicasa_model\vendor
back\.venv\Scripts\python back\scripts\patch_vendor.py

REM Download trained weights (Google Drive) and sanitize to a pure state_dict
back\.venv\Scripts\python back\scripts\download_weights.py
```

`patch_vendor.py` is idempotent and adapts the 2019-era code to the modern stack
(scipy ≥1.14 removed `scipy.ndimage.measurements`; `scipy.stats.mode` keepdims; absolute weights path).

## Run

```bat
back\.venv\Scripts\uvicorn back.app:app --port 8000
```

- `GET /health` → `{"status":"ok","model_loaded":bool}`
- `POST /detect` (multipart): `file` (image) + optional `pixels_per_meter` (float)
  → `{ imageSize, pixelsPerMeter, rooms:[{label,type,points,areaPx2,areaM2}] }`

`points` are in original-image pixel coordinates; `type` is a front-end layer id
(`room_kitchen`, `room_wc`, `room_internal`, `balcony`, `parking`).

## Test

```bat
back\.venv\Scripts\python -m pytest back\tests -v
back\.venv\Scripts\python back\scripts\run_on_samples.py                 REM px² only
back\.venv\Scripts\python back\scripts\run_on_samples.py --ppm 2bed=80   REM with a scale → m²
```

Integration tests run on the two bundled plans and auto-skip if weights are absent.

## Layout

```
app.py            FastAPI: CORS + include_router (thin)
routers/detect.py APIRouter: POST /detect, GET /health
dependencies.py   lazy singleton detector (Depends)
schema.py         Pydantic wire contract
geometry.py       shoelace area, px²→m², simplify (pure)
detector/base.py  RoomDetector ABC + class→layer mapping  ← the swap point
detector/cubicasa.py   CubiCasa CPU wrapper
detector/cubicasa_model/vendor/    vendored model (gitignored)
detector/cubicasa_model/weights/   weights (gitignored)
scripts/          patch_vendor, download_weights, run_on_samples, spike_infer
```

Gitignored (never committed): `.venv/`, `vendor/`, `weights/`, `*.pkl`, `*.pth`.

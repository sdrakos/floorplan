"""CubiCasa5K wrapper (CC BY-NC 4.0 — prototype engine only).

Loads the vendored network on CPU, runs a single image, and converts the
post-processed room polygons into DetectedRoom objects in ORIGINAL image pixels.
Confirmed against the fork's "Run net on custom image" notebook.
"""
from __future__ import annotations
import os
import sys
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from .base import RoomDetector, DetectedRoom, SKIP_CLASSES

_HERE = os.path.dirname(os.path.abspath(__file__))
_VENDOR = os.path.join(_HERE, "cubicasa_model", "vendor")
_WEIGHTS_DIR = os.path.join(_HERE, "cubicasa_model", "weights")
_WEIGHTS = os.path.join(_WEIGHTS_DIR, "cubicasa_state_dict.pth")          # sanitized (preferred)
_RAW_WEIGHTS = os.path.join(_WEIGHTS_DIR, "model_best_val_loss_var.pkl")  # raw fallback
_MAX_DIM = 1024
_N_CLASSES = 44
_SPLIT = [21, 12, 11]

# Index -> label, per the vendored model.
ROOM_CLASSES = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room",
                "Bed Room", "Bath", "Entry", "Railing", "Storage", "Garage", "Undefined"]


def _largest_polygon(geom):
    """A room may come back as Polygon, MultiPolygon, or GeometryCollection.
    Return the largest Polygon component, or None if there is none."""
    gt = geom.geom_type
    if gt == "Polygon":
        return geom
    if gt in ("MultiPolygon", "GeometryCollection"):
        polys = [g for g in geom.geoms if g.geom_type == "Polygon"]
        return max(polys, key=lambda p: p.area) if polys else None
    return None


class CubiCasaDetector(RoomDetector):
    def __init__(self, weights_path: str = _WEIGHTS):
        self._weights_path = weights_path
        self._model = None  # lazy

    @property
    def model_loaded(self) -> bool:
        return self._model is not None

    def _load_state(self):
        """Prefer the sanitized state_dict (safe, weights_only=True). Fall back to
        the raw research .pkl (trusted local file) if the sanitized one is absent."""
        if os.path.exists(self._weights_path):
            return torch.load(self._weights_path, map_location="cpu", weights_only=True)
        if os.path.exists(_RAW_WEIGHTS):
            ckpt = torch.load(_RAW_WEIGHTS, map_location="cpu", weights_only=False)  # trusted local
            return ckpt["model_state"] if isinstance(ckpt, dict) and "model_state" in ckpt else ckpt
        raise FileNotFoundError(
            f"Weights not found. Run: back/.venv/Scripts/python back/scripts/download_weights.py")

    def _ensure_model(self):
        if self._model is not None:
            return
        if _VENDOR not in sys.path:
            sys.path.insert(0, _VENDOR)
        from floortrans.models import get_model  # vendored

        model = get_model("hg_furukawa_original", 51)
        model.conv4_ = torch.nn.Conv2d(256, _N_CLASSES, bias=True, kernel_size=1)
        model.upsample = torch.nn.ConvTranspose2d(_N_CLASSES, _N_CLASSES, kernel_size=4, stride=4)
        model.load_state_dict(self._load_state())
        model.eval()
        self._model = model

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        self._ensure_model()
        from floortrans.post_prosessing import split_prediction, get_polygons  # vendored

        rgb = image.convert("RGB")
        ow, oh = rgb.size
        scale = min(1.0, _MAX_DIM / max(ow, oh))
        pw, ph = int(round(ow * scale)), int(round(oh * scale))
        small = rgb.resize((pw, ph))

        arr = np.asarray(small, dtype=np.float32)[:, :, :3]
        arr = np.moveaxis(arr, -1, 0)[np.newaxis]
        tensor = torch.tensor(arr) / 255.0 * 2 - 1.0

        with torch.no_grad():
            pred = self._model(tensor)
            pred = F.interpolate(pred, size=(ph, pw), mode="bilinear", align_corners=True)

        heatmaps, rooms, icons = split_prediction(pred, (ph, pw), _SPLIT)
        _, _, room_polygons, room_types = get_polygons((heatmaps, rooms, icons), 0.2, [1, 2])

        inv = 1.0 / scale
        out: list[DetectedRoom] = []
        for geom, rt in zip(room_polygons, room_types):
            cls = rt.get("class")
            label = ROOM_CLASSES[cls] if isinstance(cls, int) and 0 <= cls < len(ROOM_CLASSES) else "Undefined"
            if label in SKIP_CLASSES:
                continue
            poly = _largest_polygon(geom)
            if poly is None:
                continue
            pts = [(float(x) * inv, float(y) * inv) for (x, y) in poly.exterior.coords]
            if len(pts) >= 3:
                out.append(DetectedRoom(label=label, points=pts))
        return out

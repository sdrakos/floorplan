"""SAM2-based room detector (Meta Segment Anything 2, via ultralytics — Apache-2.0).

EXPERIMENTAL / NOT RECOMMENDED as-is: base SAM2 in everything-mode segments
*objects* (furniture, fixtures) rather than rooms on floor plans — confirmed on
the sample plans. Reaching FloorSAM-level room accuracy (IoU~90%) requires
fine-tuning SAM on floor-plan data (a training task). Kept here as a research
baseline / starting point for fine-tuning.

"Segment everything", keep interior masks of sensible area, turn each into a polygon.
"""
from __future__ import annotations
import cv2
import numpy as np
from PIL import Image

from .base import RoomDetector, DetectedRoom

_MAX_DIM = 1024
_MODELS = ["sam2.1_b.pt", "sam2_b.pt", "sam_b.pt"]   # tried in order (auto-download)


class SamDetector(RoomDetector):
    def __init__(self, min_area_frac: float = 0.005, max_area_frac: float = 0.55):
        self.min_area_frac = min_area_frac
        self.max_area_frac = max_area_frac
        self._model = None

    @property
    def model_loaded(self) -> bool:
        return self._model is not None

    def _ensure_model(self):
        if self._model is not None:
            return
        from ultralytics import SAM
        last = None
        for name in _MODELS:
            try:
                self._model = SAM(name)
                return
            except Exception as e:  # try next checkpoint name
                last = e
        raise RuntimeError(f"Could not load a SAM2 model ({last})")

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        self._ensure_model()
        rgb = image.convert("RGB")
        ow, oh = rgb.size
        scale = min(1.0, _MAX_DIM / max(ow, oh))
        pw, ph = int(round(ow * scale)), int(round(oh * scale))
        arr = np.asarray(rgb.resize((pw, ph)))

        results = self._model(arr, verbose=False)
        if not results or results[0].masks is None:
            return []
        masks = results[0].masks.data.cpu().numpy()  # (N, h, w) in [0,1]

        img_area = pw * ph
        inv = 1.0 / scale
        out: list[DetectedRoom] = []
        for m in masks:
            mask = (m > 0.5).astype(np.uint8) * 255
            if mask.shape[:2] != (ph, pw):
                mask = cv2.resize(mask, (pw, ph), interpolation=cv2.INTER_NEAREST)
            a = int((mask > 0).sum())
            if a < self.min_area_frac * img_area or a > self.max_area_frac * img_area:
                continue
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cnts:
                continue
            cnt = max(cnts, key=cv2.contourArea)
            x, y, cw, ch = cv2.boundingRect(cnt)
            if x <= 1 or y <= 1 or x + cw >= pw - 1 or y + ch >= ph - 1:
                continue  # touches border -> exterior / full-plan
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.01 * peri, True)
            pts = [(float(p[0][0]) * inv, float(p[0][1]) * inv) for p in approx]
            if len(pts) >= 3:
                out.append(DetectedRoom(label="Room", type="room_internal", points=pts))
        return out

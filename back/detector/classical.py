"""Classical-CV room detector for clean architectural line drawings.

No ML, no license constraints. Pipeline:
  1. binarize -> wall mask (dark lines)
  2. dilate walls to SEAL doorway gaps, so rooms become separated "cores"
  3. connected components of the sealed free-space = room markers
     (drop the exterior component that touches the image border, and tiny specks)
  4. watershed over the ORIGINAL free space so each core grows back to the real
     walls -> accurate room extent / area
  5. contour per room -> polygon

Returns generic rooms (label "Room", type room_internal) — geometry/area only,
no room-type naming. Tune via constructor params if walls are thin/thick.
"""
from __future__ import annotations
import cv2
import numpy as np
from PIL import Image

from .base import RoomDetector, DetectedRoom


class ClassicalDetector(RoomDetector):
    def __init__(
        self,
        seal_frac: float = 1 / 90,     # doorway-seal dilation as a fraction of max(H,W)
        min_area_frac: float = 0.004,  # ignore rooms smaller than this fraction of the image
        max_area_frac: float = 0.60,   # ignore blobs larger than this (exterior leftovers)
        text_close_frac: float = 1 / 300,
    ):
        self.seal_frac = seal_frac
        self.min_area_frac = min_area_frac
        self.max_area_frac = max_area_frac
        self.text_close_frac = text_close_frac

    @property
    def model_loaded(self) -> bool:
        return True  # no weights to load

    @staticmethod
    def _kernel(size: int):
        size = max(1, size | 1)  # odd, >=1
        return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        gray = np.array(image.convert("L"))
        h, w = gray.shape
        dim = max(h, w)
        img_area = h * w

        # 1. walls = dark pixels (Otsu, inverted so walls are white/255)
        _, walls = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # 2. seal doorway gaps by thickening walls
        seal = max(3, int(dim * self.seal_frac))
        walls_sealed = cv2.dilate(walls, self._kernel(seal))

        # free space (original, doorways open) and sealed cores (rooms separated)
        free = cv2.bitwise_not(walls)
        # fill small dark marks (text/furniture/dimension ticks) so they don't fragment cores
        tc = max(1, int(dim * self.text_close_frac))
        free = cv2.morphologyEx(free, cv2.MORPH_CLOSE, self._kernel(tc))
        cores = cv2.bitwise_and(free, cv2.bitwise_not(walls_sealed))

        # 3. markers from cores; drop exterior (border-touching) and tiny specks
        n, labels, stats, _ = cv2.connectedComponentsWithStats(cores, connectivity=8)
        markers = np.zeros((h, w), np.int32)
        next_id = 1
        kept = {}
        for lbl in range(1, n):
            x, y, cw, ch, area = stats[lbl]
            touches_border = x <= 1 or y <= 1 or x + cw >= w - 1 or y + ch >= h - 1
            if touches_border or area < self.min_area_frac * img_area * 0.25:
                continue
            markers[labels == lbl] = next_id
            kept[next_id] = lbl
            next_id += 1
        if next_id == 1:
            return []

        # mark a background seed (exterior + walls) so watershed has something to flood from
        markers[walls_sealed > 0] = next_id  # background label
        bg_label = next_id

        # 4. watershed grows each core back to the real walls
        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        cv2.watershed(rgb, markers)

        # 5. contour per room label
        out: list[DetectedRoom] = []
        for rid in range(1, bg_label):
            mask = np.uint8(markers == rid) * 255
            if mask.sum() == 0:
                continue
            area = int((markers == rid).sum())
            if area < self.min_area_frac * img_area or area > self.max_area_frac * img_area:
                continue
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cnts:
                continue
            cnt = max(cnts, key=cv2.contourArea)
            rx, ry, rw, rh = cv2.boundingRect(cnt)
            # drop spurious slivers: very thin strips, or low fill ratio (exterior margins)
            if min(rw, rh) < 0.04 * dim:
                continue
            if cv2.contourArea(cnt) < 0.20 * (rw * rh):
                continue
            pts = [(float(p[0][0]), float(p[0][1])) for p in cnt]
            if len(pts) >= 3:
                out.append(DetectedRoom(label="Room", type="room_internal", points=pts))
        return out

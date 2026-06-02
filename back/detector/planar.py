"""Planar-graph room detector for clean architectural drawings.

Models the WALLS explicitly, then extracts the faces of the wall network as rooms
(the accurate, deterministic approach from the floor-plan vectorization literature,
in raster form). No ML, no license constraints.

Pipeline:
  1. binarize -> dark mask
  2. keep only WALL-like structures via morphological line-opening (long horizontal
     + vertical runs). This drops furniture, text, dimension numbers/ticks — the
     noise that fragmented earlier flood-fill attempts.
  3. dilate the wall lines to connect junctions and seal door openings -> a closed
     wall network.
  4. faces = connected components of the free space (complement of the walls);
     drop the exterior (border-touching) and specks.
  5. grow each face back by the seal radius so its area reaches the wall centerlines,
     then contour -> polygon.
"""
from __future__ import annotations
import cv2
import numpy as np
from PIL import Image

from .base import RoomDetector, DetectedRoom


class WallGraphDetector(RoomDetector):
    def __init__(
        self,
        thick_frac: float = 1 / 280,    # wall half-thickness: thinner dark marks (furniture/text) are removed
        seal_frac: float = 1 / 140,     # dilation to connect junctions / seal doorways
        min_area_frac: float = 0.012,   # ignore faces smaller than this fraction (specks/fixtures)
        max_area_frac: float = 0.72,    # ignore faces bigger than this (leftover exterior)
    ):
        self.thick_frac = thick_frac
        self.seal_frac = seal_frac
        self.min_area_frac = min_area_frac
        self.max_area_frac = max_area_frac

    @property
    def model_loaded(self) -> bool:
        return True  # no weights

    @staticmethod
    def _rect(w: int, h: int):
        return cv2.getStructuringElement(cv2.MORPH_RECT, (max(1, w), max(1, h)))

    @staticmethod
    def _ellipse(s: int):
        s = max(1, s | 1)
        return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (s, s))

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        gray = np.array(image.convert("L"))
        h, w = gray.shape
        dim = max(h, w)
        img_area = h * w

        # 1. dark mask (walls + furniture + text)
        _, dark = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # 2. walls in these plans are drawn as thin double lines — CLOSE merges each
        #    pair into a solid wall so they form a connected barrier network.
        close_k = max(5, int(dim / 45))
        walls = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, self._ellipse(close_k))

        # keep only the large connected wall network (drop isolated furniture/text blobs)
        nb, lab, st, _ = cv2.connectedComponentsWithStats(walls, connectivity=8)
        keep = np.zeros_like(walls)
        for i in range(1, nb):
            if st[i, cv2.CC_STAT_AREA] >= 0.01 * img_area:
                keep[lab == i] = 255
        walls = keep

        # 3. seal remaining doorway gaps -> closed wall network
        seal = max(3, int(dim * self.seal_frac))
        walls = cv2.dilate(walls, self._ellipse(seal))

        # 4. faces = connected components of the free space
        free = cv2.bitwise_not(walls)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(free, connectivity=8)

        out: list[DetectedRoom] = []
        for lbl in range(1, n):
            x, y, cw, ch, a = stats[lbl]
            if x <= 1 or y <= 1 or x + cw >= w - 1 or y + ch >= h - 1:
                continue  # exterior
            if a < self.min_area_frac * img_area or a > self.max_area_frac * img_area:
                continue
            # 5. grow back to wall centerlines so the area is not undercounted
            mask = np.uint8(labels == lbl) * 255
            mask = cv2.dilate(mask, self._ellipse(seal))
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not cnts:
                continue
            cnt = max(cnts, key=cv2.contourArea)
            rx, ry, rw, rh = cv2.boundingRect(cnt)
            if min(rw, rh) < 0.03 * dim:           # drop thin slivers
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.01 * peri, True)
            pts = [(float(p[0][0]), float(p[0][1])) for p in approx]
            if len(pts) >= 3:
                out.append(DetectedRoom(label="Room", type="room_internal", points=pts))
        return out

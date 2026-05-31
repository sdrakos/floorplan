"""Pure polygon geometry helpers. No model/IO dependencies."""
from __future__ import annotations
import cv2
import numpy as np

Polygon = list[tuple[float, float]]


def polygon_area_px2(points: Polygon) -> float:
    """Shoelace area in px^2. Orientation-independent (absolute value)."""
    if len(points) < 3:
        return 0.0
    n = len(points)
    s = 0.0
    for i in range(n):
        j = (i + 1) % n
        s += points[i][0] * points[j][1] - points[j][0] * points[i][1]
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

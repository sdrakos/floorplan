"""Run the detector on the two bundled floor plans and print an area report.

Optionally pass a scale (px per meter) per image to also report m^2:
  back/.venv/Scripts/python back/scripts/run_on_samples.py --ppm 2bed=120 --ppm floor2=95
"""
from __future__ import annotations
import argparse
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from back.detector.cubicasa import CubiCasaDetector
from back.geometry import polygon_area_px2, px2_to_m2, simplify_polygon
from PIL import Image

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
        scale = ppm.get(key)
        print(f"\n=== {fname} ===")
        rooms = det.detect(Image.open(path))
        total_m2 = 0.0
        for i, r in enumerate(rooms, 1):
            pts = simplify_polygon(r.points)
            a_px = polygon_area_px2(pts)
            a_m2 = px2_to_m2(a_px, scale)
            extra = f"  {a_m2:8.2f} m2" if a_m2 is not None else ""
            if a_m2:
                total_m2 += a_m2
            print(f"  {i:>2}. {r.type:<14} {r.label:<12} {a_px:12.0f} px2{extra}")
        print(f"  rooms: {len(rooms)}" + (f"   total: {total_m2:.2f} m2" if scale else ""))


if __name__ == "__main__":
    main()

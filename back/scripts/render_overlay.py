"""Render room overlays for the two sample plans (or any image path).

  back/.venv/Scripts/python back/scripts/render_overlay.py [--ppm 80] [image_path ...]

Writes <name>.overlay.png next to each input.
"""
from __future__ import annotations
import argparse
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from PIL import Image
from back.detector.cubicasa import CubiCasaDetector
from back.overlay import render_overlay

DEFAULT_SAMPLES = ["2-Bedroom-Home-Plan-With-Dimensions.png", "φλοορ2.jpg"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ppm", type=float, default=None, help="pixels per meter (for m²)")
    ap.add_argument("images", nargs="*", help="image paths (default: the two samples)")
    args = ap.parse_args()

    images = args.images or [os.path.join(ROOT, s) for s in DEFAULT_SAMPLES]
    det = CubiCasaDetector()
    for path in images:
        img = Image.open(path)
        rooms = det.detect(img)
        out = render_overlay(img, rooms, args.ppm)
        dst = os.path.splitext(path)[0] + ".overlay.png"
        out.save(dst)
        print(f"{os.path.basename(path)}: {len(rooms)} rooms -> {dst}")


if __name__ == "__main__":
    main()

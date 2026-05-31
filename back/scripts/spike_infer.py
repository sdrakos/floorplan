"""Spike: end-to-end CubiCasa inference on one sample image (no TTA), to confirm
the vendored pipeline runs on this stack before we build the real wrapper.

Run: back/.venv/Scripts/python back/scripts/spike_infer.py
"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VENDOR = os.path.join(ROOT, "back", "detector", "cubicasa_model", "vendor")
WEIGHTS = os.path.join(ROOT, "back", "detector", "cubicasa_model", "weights", "model_best_val_loss_var.pkl")
SAMPLE = os.path.join(ROOT, "2-Bedroom-Home-Plan-With-Dimensions.png")
MAX_DIM = 1024

sys.path.insert(0, VENDOR)

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from shapely.geometry import Polygon

from floortrans.models import get_model
from floortrans.post_prosessing import split_prediction, get_polygons

ROOM_CLASSES = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room",
                "Bed Room", "Bath", "Entry", "Railing", "Storage", "Garage", "Undefined"]


def load_model():
    model = get_model("hg_furukawa_original", 51)
    n_classes = 44
    model.conv4_ = torch.nn.Conv2d(256, n_classes, bias=True, kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(n_classes, n_classes, kernel_size=4, stride=4)
    ckpt = torch.load(WEIGHTS, map_location="cpu", weights_only=False)
    state = ckpt["model_state"] if isinstance(ckpt, dict) and "model_state" in ckpt else ckpt
    model.load_state_dict(state)
    model.eval()
    return model


def main():
    print(f"weights: {WEIGHTS} ({os.path.getsize(WEIGHTS)//1_000_000} MB)")
    model = load_model()
    print("model loaded OK")

    img = Image.open(SAMPLE).convert("RGB")
    ow, oh = img.size
    scale = min(1.0, MAX_DIM / max(ow, oh))
    pw, ph = int(round(ow * scale)), int(round(oh * scale))
    small = img.resize((pw, ph))
    print(f"image {ow}x{oh} -> {pw}x{ph} (scale {scale:.3f})")

    arr = np.asarray(small, dtype=np.float32)[:, :, :3]
    arr = np.moveaxis(arr, -1, 0)[np.newaxis]
    tensor = torch.tensor(arr) / 255.0 * 2 - 1.0

    with torch.no_grad():
        pred = model(tensor)
        pred = F.interpolate(pred, size=(ph, pw), mode="bilinear", align_corners=True)

    heatmaps, rooms, icons = split_prediction(pred, (ph, pw), [21, 12, 11])
    polygons, types, room_polygons, room_types = get_polygons((heatmaps, rooms, icons), 0.2, [1, 2])

    def largest_polygon(geom):
        if geom.geom_type == "Polygon":
            return geom
        if geom.geom_type in ("MultiPolygon", "GeometryCollection"):
            polys = [g for g in geom.geoms if g.geom_type == "Polygon"]
            return max(polys, key=lambda p: p.area) if polys else None
        return None

    print(f"\n{len(room_polygons)} room polygons:")
    inv = 1.0 / scale
    for poly, rt in zip(room_polygons, room_types):
        cls = rt.get("class")
        label = ROOM_CLASSES[cls] if isinstance(cls, int) and 0 <= cls < len(ROOM_CLASSES) else cls
        p = largest_polygon(poly)
        if p is None:
            print(f"  {label:<12} (no polygon geom: {poly.geom_type})")
            continue
        area_px2 = float(p.area) * inv * inv
        print(f"  {label:<12} area={area_px2:12.0f} px^2  verts={len(p.exterior.coords)}")


if __name__ == "__main__":
    main()

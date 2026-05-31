"""Render detected rooms as a translucent overlay on the floor-plan image.
Shared by scripts/render_overlay.py and the /detect/overlay endpoint."""
from __future__ import annotations
from PIL import Image, ImageDraw, ImageFont

from .geometry import polygon_area_px2, px2_to_m2, simplify_polygon

# Layer id -> RGB (matches front/floor-plan-takeoff.jsx DEFAULT_LAYERS).
LAYER_COLORS: dict[str, tuple[int, int, int]] = {
    "room_internal": (74, 144, 217),
    "room_wc": (230, 126, 34),
    "room_kitchen": (39, 174, 96),
    "balcony": (142, 68, 173),
    "parking": (149, 165, 166),
}
_DEFAULT = (231, 76, 60)
_FILL_ALPHA = 90


def _font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _centroid(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def render_overlay(image: Image.Image, rooms, pixels_per_meter: float | None = None) -> Image.Image:
    """rooms: iterable of objects/dicts with .label/.type/.points (pixel coords)."""
    base = image.convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = _font(max(12, base.width // 60))

    for r in rooms:
        label = r["label"] if isinstance(r, dict) else r.label
        rtype = r["type"] if isinstance(r, dict) else r.type
        raw = r["points"] if isinstance(r, dict) else r.points
        pts = [(p["x"], p["y"]) if isinstance(p, dict) else (p[0], p[1]) for p in raw]
        pts = simplify_polygon(pts)
        if len(pts) < 3:
            continue
        color = LAYER_COLORS.get(rtype, _DEFAULT)
        draw.polygon(pts, fill=color + (_FILL_ALPHA,), outline=color + (255,), width=3)

        area_px2 = polygon_area_px2(pts)
        area_m2 = px2_to_m2(area_px2, pixels_per_meter)
        text = f"{label}\n{area_m2:.1f} m²" if area_m2 is not None else f"{label}\n{area_px2:.0f}px²"
        cx, cy = _centroid(pts)
        bbox = draw.multiline_textbbox((cx, cy), text, font=font, anchor="mm", align="center")
        draw.rectangle([bbox[0] - 4, bbox[1] - 2, bbox[2] + 4, bbox[3] + 2], fill=(255, 255, 255, 210))
        draw.multiline_text((cx, cy), text, fill=(20, 20, 20, 255), font=font, anchor="mm", align="center")

    return Image.alpha_composite(base, overlay).convert("RGB")

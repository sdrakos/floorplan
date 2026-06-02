"""Claude vision room detector — server-side proxy to the Anthropic API.

Runs in the backend (no browser CORS, API key stays server-side). Sends a
downscaled image and asks for room polygons, then scales coords back to the
original image. Key from back/.env (ANTHROPIC_API_KEY).
"""
from __future__ import annotations
import base64
import io
import json
import os
import re

import requests
from PIL import Image

from .base import RoomDetector, DetectedRoom

_MAX_DIM = 1024
_MODEL = "claude-sonnet-4-6"
_LAYERS = {"room_internal", "room_wc", "room_kitchen", "balcony", "parking"}
_PROMPT = (
    "Floor plan {w}x{h}px. Find the rooms. Return ONLY a JSON array, no markdown, "
    "no explanation:\n"
    '[{{"name":"Σαλόνι","type":"room_internal","points":[{{"x":100,"y":200}},'
    '{{"x":300,"y":200}},{{"x":300,"y":400}}]}}]\n'
    "Types: room_internal, room_wc, room_kitchen, balcony, parking. "
    "Use pixel coords of THIS image."
)


class ClaudeDetector(RoomDetector):
    def __init__(self):
        from .. import db
        db.load_env()
        self._key = os.environ.get("ANTHROPIC_API_KEY")

    @property
    def model_loaded(self) -> bool:
        return bool(self._key)

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        if not self._key:
            raise RuntimeError("ANTHROPIC_API_KEY missing in back/.env")
        rgb = image.convert("RGB")
        ow, oh = rgb.size
        scale = min(1.0, _MAX_DIM / max(ow, oh))
        pw, ph = int(round(ow * scale)), int(round(oh * scale))
        small = rgb.resize((pw, ph))
        buf = io.BytesIO()
        small.save(buf, format="JPEG", quality=70)
        b64 = base64.b64encode(buf.getvalue()).decode()

        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": self._key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={
                "model": _MODEL, "max_tokens": 4000,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": _PROMPT.format(w=pw, h=ph)},
                ]}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        text = "".join(b.get("text", "") for b in resp.json().get("content", []) if b.get("type") == "text")

        rooms = None
        clean = re.sub(r"```json\s*|```\s*", "", text).strip()
        try:
            rooms = json.loads(clean)
        except Exception:
            m = re.search(r"\[[\s\S]*\]", clean)
            if m:
                try:
                    rooms = json.loads(m.group(0))
                except Exception:
                    rooms = None
        if not isinstance(rooms, list):
            return []

        inv = 1.0 / scale
        out: list[DetectedRoom] = []
        for r in rooms:
            pts = r.get("points") or []
            if len(pts) < 3:
                continue
            layer = r.get("type") if r.get("type") in _LAYERS else "room_internal"
            out.append(DetectedRoom(
                label=r.get("name") or "Χώρος", type=layer,
                points=[(float(p["x"]) * inv, float(p["y"]) * inv) for p in pts if "x" in p and "y" in p],
            ))
        return [r for r in out if len(r.points) >= 3]

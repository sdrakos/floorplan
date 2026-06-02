"""Gemini vision room detector — server-side proxy to the Google Gemini API.

Same idea as the Claude detector: downscale, ask for room polygons, scale back.
Key from back/.env (GEMINI_API_KEY).
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
_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
_LAYERS = {"room_internal", "room_wc", "room_kitchen", "balcony", "parking"}
_PROMPT = (
    "Floor plan {w}x{h}px. Find the rooms. Return ONLY a JSON array, no markdown:\n"
    '[{{"name":"Saloni","type":"room_internal","points":[{{"x":100,"y":200}},'
    '{{"x":300,"y":200}},{{"x":300,"y":400}}]}}]\n'
    "Types: room_internal, room_wc, room_kitchen, balcony, parking. "
    "Use pixel coords of THIS image."
)


class GeminiDetector(RoomDetector):
    def __init__(self):
        from .. import db
        db.load_env()
        self._key = os.environ.get("GEMINI_API_KEY")

    @property
    def model_loaded(self) -> bool:
        return bool(self._key)

    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        if not self._key:
            raise RuntimeError("GEMINI_API_KEY missing in back/.env")
        rgb = image.convert("RGB")
        ow, oh = rgb.size
        scale = min(1.0, _MAX_DIM / max(ow, oh))
        pw, ph = int(round(ow * scale)), int(round(oh * scale))
        buf = io.BytesIO()
        rgb.resize((pw, ph)).save(buf, format="JPEG", quality=70)
        b64 = base64.b64encode(buf.getvalue()).decode()
        body = {"contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
            {"text": _PROMPT.format(w=pw, h=ph)},
        ]}]}

        text, last = "", None
        for model in _MODELS:
            try:
                r = requests.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    params={"key": self._key}, json=body, timeout=90)
                if r.status_code == 404:
                    last = f"404 {model}"
                    continue
                r.raise_for_status()
                cands = r.json().get("candidates", [])
                if cands:
                    text = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))
                break
            except Exception as e:
                last = e
                continue
        if not text:
            raise RuntimeError(f"Gemini call failed ({last})")

        clean = re.sub(r"```json\s*|```\s*", "", text).strip()
        rooms = None
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
        for rm in rooms:
            pts = rm.get("points") or []
            if len(pts) < 3:
                continue
            layer = rm.get("type") if rm.get("type") in _LAYERS else "room_internal"
            coords = [(float(p["x"]) * inv, float(p["y"]) * inv) for p in pts if "x" in p and "y" in p]
            if len(coords) >= 3:
                out.append(DetectedRoom(label=rm.get("name") or "Χώρος", type=layer, points=coords))
        return out

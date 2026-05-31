"""Lazy singleton detector for FastAPI Depends — model loads once, not per request."""
from __future__ import annotations
from functools import lru_cache
from .detector.base import RoomDetector
from .detector.cubicasa import CubiCasaDetector


@lru_cache(maxsize=1)
def get_detector() -> RoomDetector:
    return CubiCasaDetector()

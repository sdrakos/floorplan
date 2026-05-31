"""Detector singletons for FastAPI. Each engine loads once (lazy)."""
from __future__ import annotations
from functools import lru_cache
from .detector.base import RoomDetector
from .detector.cubicasa import CubiCasaDetector
from .detector.classical import ClassicalDetector


@lru_cache(maxsize=1)
def get_detector() -> RoomDetector:
    """Default detector (CubiCasa). Used as the FastAPI Depends target."""
    return CubiCasaDetector()


@lru_cache(maxsize=1)
def _classical() -> RoomDetector:
    return ClassicalDetector()


def get_detector_for(engine: str | None) -> RoomDetector:
    """Select an engine by name; falls back to the default (CubiCasa)."""
    if engine == "classical":
        return _classical()
    return get_detector()

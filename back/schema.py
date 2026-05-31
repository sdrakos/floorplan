"""Pydantic models — the /detect wire contract. Matches the shape that
front/floor-plan-takeoff.jsx builds for AI-detected shapes."""
from __future__ import annotations
from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float


class Room(BaseModel):
    label: str                       # raw model label, e.g. "Kitchen"
    type: str                        # front-end layer id, e.g. "room_kitchen"
    points: list[Point]              # original-image pixel coords
    areaPx2: float = Field(..., ge=0)
    areaM2: float | None = None      # null unless pixels_per_meter supplied


class ImageSize(BaseModel):
    w: int
    h: int


class DetectResponse(BaseModel):
    imageSize: ImageSize
    pixelsPerMeter: float | None = None
    rooms: list[Room]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool

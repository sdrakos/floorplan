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


# ── projects / shapes ────────────────────────────────────────────────────────

class ProjectIn(BaseModel):
    name: str
    calibration: dict = Field(default_factory=dict)  # {pixelsPerMeter, wallHeight, calLine, calMeters, ...}
    image_path: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    calibration: dict | None = None
    image_path: str | None = None


class ShapeIn(BaseModel):
    kind: str = "polygon"            # polygon | line
    layer: str = "room_internal"
    label: str | None = None
    points: list[dict]              # [{x, y}, ...]
    area_px2: float | None = None
    area_m2: float | None = None


class ShapesReplace(BaseModel):
    shapes: list[ShapeIn]


# ── offers / τεύχη ────────────────────────────────────────────────────────────

class OfferIn(BaseModel):
    name: str
    client: str | None = None
    project_name: str | None = None
    offer_date: str | None = None   # ISO date


class OfferPatch(BaseModel):
    name: str | None = None
    client: str | None = None
    project_name: str | None = None
    offer_date: str | None = None


class OfferItemIn(BaseModel):
    description: str = ""
    quantity: float = 0
    unit: str = "pcs"
    unit_price: float = 0


class OfferSectionIn(BaseModel):
    name: str = ""
    note: str | None = None
    items: list[OfferItemIn] = Field(default_factory=list)


class OfferContentReplace(BaseModel):
    sections: list[OfferSectionIn]


class OfferFromProject(BaseModel):
    name: str = "Προσφορά"
    project_id: str | None = None
    sections: list[OfferSectionIn] = Field(default_factory=list)

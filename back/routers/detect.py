"""APIRouter for room detection."""
from __future__ import annotations
import io
import os
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError

from ..dependencies import get_detector, get_detector_for
from ..detector.base import RoomDetector
from ..geometry import polygon_area_px2, px2_to_m2, simplify_polygon
from ..overlay import render_overlay
from ..schema import DetectResponse, HealthResponse, ImageSize, Point, Room

router = APIRouter()

# Best-effort detection logging to Supabase. Disable with FLOORPLAN_DB_LOG=0 (e.g. in tests).
_DB_LOG = os.environ.get("FLOORPLAN_DB_LOG", "1") != "0"


def _log_detection(engine: str | None, room_count: int) -> None:
    if not _DB_LOG:
        return
    try:
        from ..db import log_detection
        log_detection(engine=engine or "cubicasa", room_count=room_count)
    except Exception:
        pass  # logging must never break detection


def _read_image(raw: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
        return image
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Could not read image file")


@router.get("/health", response_model=HealthResponse)
def health(detector: RoomDetector = Depends(get_detector)) -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=detector.model_loaded)


@router.post("/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    pixels_per_meter: float | None = Form(default=None),
    engine: str | None = Form(default=None),
    detector: RoomDetector = Depends(get_detector),
) -> DetectResponse:
    if engine:
        detector = get_detector_for(engine)
    image = _read_image(await file.read())
    detected = detector.detect(image)
    rooms: list[Room] = []
    for d in detected:
        pts = simplify_polygon(d.points)
        area_px2 = polygon_area_px2(pts)
        rooms.append(Room(
            label=d.label, type=d.type,
            points=[Point(x=x, y=y) for (x, y) in pts],
            areaPx2=area_px2,
            areaM2=px2_to_m2(area_px2, pixels_per_meter),
        ))
    _log_detection(engine, len(rooms))
    return DetectResponse(
        imageSize=ImageSize(w=image.width, h=image.height),
        pixelsPerMeter=pixels_per_meter,
        rooms=rooms,
    )


@router.post("/detect/overlay")
async def detect_overlay(
    file: UploadFile = File(...),
    pixels_per_meter: float | None = Form(default=None),
    engine: str | None = Form(default=None),
    detector: RoomDetector = Depends(get_detector),
) -> StreamingResponse:
    """Return the floor plan with detected rooms drawn on top (PNG)."""
    if engine:
        detector = get_detector_for(engine)
    image = _read_image(await file.read())
    rooms = detector.detect(image)
    _log_detection(engine, len(rooms))
    rendered = render_overlay(image, rooms, pixels_per_meter)
    buf = io.BytesIO()
    rendered.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

"""APIRouter for room detection."""
from __future__ import annotations
import io
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from ..dependencies import get_detector
from ..detector.base import RoomDetector
from ..geometry import polygon_area_px2, px2_to_m2, simplify_polygon
from ..schema import DetectResponse, HealthResponse, ImageSize, Point, Room

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(detector: RoomDetector = Depends(get_detector)) -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=detector.model_loaded)


@router.post("/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    pixels_per_meter: float | None = Form(default=None),
    detector: RoomDetector = Depends(get_detector),
) -> DetectResponse:
    raw = await file.read()
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Could not read image file")

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
    return DetectResponse(
        imageSize=ImageSize(w=image.width, h=image.height),
        pixelsPerMeter=pixels_per_meter,
        rooms=rooms,
    )

"""Swappable detector interface. CubiCasa (CC BY-NC) hides behind this so the
engine can be replaced for commercial use without touching routers/geometry."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from PIL import Image

# CubiCasa room class label -> front-end layer id.
# Class names per the vendored model: ["Background","Outdoor","Wall","Kitchen",
#   "Living Room","Bed Room","Bath","Entry","Railing","Storage","Garage","Undefined"]
CUBICASA_TO_LAYER: dict[str, str] = {
    "Kitchen": "room_kitchen",
    "Bath": "room_wc",
    "Living Room": "room_internal",
    "Bed Room": "room_internal",
    "Entry": "room_internal",
    "Storage": "room_internal",
    "Undefined": "room_internal",
    "Outdoor": "balcony",
    "Garage": "parking",
}

# Structural / non-room classes that never produce a room polygon.
SKIP_CLASSES = {"Background", "Wall", "Railing"}


def map_class(cubicasa_label: str) -> str:
    """Map a CubiCasa room class to a front-end layer id; default room_internal."""
    return CUBICASA_TO_LAYER.get(cubicasa_label, "room_internal")


@dataclass
class DetectedRoom:
    label: str                              # raw model label
    type: str = ""                          # layer id; filled by map_class if empty
    points: list[tuple[float, float]] = field(default_factory=list)  # pixels

    def __post_init__(self):
        if not self.type:
            self.type = map_class(self.label)


class RoomDetector(ABC):
    @abstractmethod
    def detect(self, image: Image.Image) -> list[DetectedRoom]:
        """Return rooms as polygons in ORIGINAL image pixel coordinates."""
        raise NotImplementedError

    @property
    @abstractmethod
    def model_loaded(self) -> bool:
        ...

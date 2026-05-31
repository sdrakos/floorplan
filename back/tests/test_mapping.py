import pytest
from back.detector.base import map_class, RoomDetector, DetectedRoom


def test_known_classes_map_to_layers():
    assert map_class("Kitchen") == "room_kitchen"
    assert map_class("Bath") == "room_wc"
    assert map_class("Bed Room") == "room_internal"
    assert map_class("Living Room") == "room_internal"
    assert map_class("Entry") == "room_internal"
    assert map_class("Outdoor") == "balcony"
    assert map_class("Garage") == "parking"


def test_unknown_class_falls_back_to_internal():
    assert map_class("Sauna") == "room_internal"


def test_detector_is_abstract():
    with pytest.raises(TypeError):
        RoomDetector()


def test_detected_room_autofills_type():
    r = DetectedRoom(label="Kitchen", points=[(0, 0), (1, 0), (1, 1)])
    assert r.type == "room_kitchen"
    assert r.points[1] == (1, 0)

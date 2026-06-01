"""Integration test for the projects/shapes data layer against local Supabase.
Auto-skips if the local stack is not reachable."""
import pytest
from back import db


def _db_up() -> bool:
    try:
        db.get_client().table("tenants").select("id").limit(1).execute()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_up(), reason="local Supabase not running")


def test_project_crud_and_shapes():
    p = db.create_project("pytest project", {"pixelsPerMeter": 80, "wallHeight": 2.8})
    pid = p["id"]
    try:
        assert p["name"] == "pytest project"
        assert p["calibration"]["pixelsPerMeter"] == 80

        res = db.replace_shapes(pid, [
            {"kind": "polygon", "layer": "room_kitchen", "label": "K",
             "points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}],
             "area_px2": 50.0, "area_m2": 0.0078},
            {"kind": "polygon", "layer": "room_internal", "label": "L",
             "points": [{"x": 0, "y": 0}, {"x": 20, "y": 0}, {"x": 20, "y": 20}]},
        ])
        assert len(res) == 2

        full = db.get_project(pid)
        assert len(full["shapes"]) == 2
        assert {s["layer"] for s in full["shapes"]} == {"room_kitchen", "room_internal"}

        db.update_project(pid, {"name": "renamed"})
        assert db.get_project(pid)["name"] == "renamed"

        # bulk replace shrinks to 1
        db.replace_shapes(pid, [{"layer": "balcony", "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]}])
        assert len(db.get_project(pid)["shapes"]) == 1
    finally:
        db.delete_project(pid)
        assert db.get_project(pid) is None

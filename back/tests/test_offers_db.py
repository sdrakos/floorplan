"""Integration test for the offers data layer against local Supabase.
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


def test_offer_crud_and_content():
    o = db.create_offer("pytest offer", client="ACME", project_name="Villa")
    oid = o["id"]
    try:
        assert o["name"] == "pytest offer" and o["client"] == "ACME"

        res = db.replace_offer_content(oid, [
            {"name": "1. Χωματουργικά", "note": "ν", "items": [
                {"description": "Εκσκαφή", "quantity": 12, "unit": "m³", "unit_price": 14},
                {"description": "Επίχωση", "quantity": 5, "unit": "m³", "unit_price": 8},
            ]},
            {"name": "2. Σκυρόδεμα", "items": [
                {"description": "C25/30", "quantity": 3, "unit": "m³", "unit_price": 62},
            ]},
        ])
        assert res["sections"] == 2 and res["items"] == 3

        full = db.get_offer(oid)
        assert len(full["sections"]) == 2
        assert full["sections"][0]["name"] == "1. Χωματουργικά"
        assert len(full["sections"][0]["items"]) == 2
        assert full["sections"][0]["items"][0]["description"] == "Εκσκαφή"

        db.update_offer(oid, {"client": "Beta"})
        assert db.get_offer(oid)["client"] == "Beta"

        # bulk replace shrinks to 1 section / 0 items
        db.replace_offer_content(oid, [{"name": "only", "items": []}])
        again = db.get_offer(oid)
        assert len(again["sections"]) == 1 and again["sections"][0]["items"] == []
    finally:
        db.delete_offer(oid)
        assert db.get_offer(oid) is None


def test_offer_from_quantities_roundtrip():
    sections = [
        {"name": "6. Πλακίδια", "items": [
            {"description": "Πλακίδια δαπέδου", "quantity": 40.0, "unit": "m²", "unit_price": 18},
        ]},
        {"name": "7. Χρωματισμοί", "items": [
            {"description": "Χρωματισμοί τοίχοι", "quantity": 120.0, "unit": "m²", "unit_price": 12},
            {"description": "Χρωματισμοί οροφές", "quantity": 40.0, "unit": "m²", "unit_price": 12},
        ]},
    ]
    offer = db.create_offer_from_quantities("Villa — auto", sections)
    oid = offer["id"]
    try:
        full = db.get_offer(oid)
        assert len(full["sections"]) == 2
        total = sum(i["quantity"] * i["unit_price"]
                    for s in full["sections"] for i in s["items"])
        assert total == 40 * 18 + 120 * 12 + 40 * 12   # 720 + 1440 + 480
    finally:
        db.delete_offer(oid)

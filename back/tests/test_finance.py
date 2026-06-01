import math
from back.finance import line_net_cents, offer_totals


def test_line_net_basic():
    assert line_net_cents(40, 18) == 72000          # 720.00 €


def test_line_net_with_discount():
    assert line_net_cents(100, 10, 10) == 90000      # 1000 − 10% = 900.00


def _offer(vat=24, disc=0, items=None, sections=None):
    secs = sections or [{"name": "S", "items": items or []}]
    return {"vat_rate": vat, "discount_pct": disc, "currency": "EUR", "sections": secs}


def test_totals_single_line_vat():
    t = offer_totals(_offer(items=[{"quantity": 40, "unit_price": 18}]))
    assert t["net"] == 720.0
    assert math.isclose(t["vat"], 172.8)             # 720 * 24%
    assert math.isclose(t["gross"], 892.8)


def test_totals_offer_discount():
    t = offer_totals(_offer(disc=10, items=[{"quantity": 100, "unit_price": 10}]))
    assert t["subtotal"] == 1000.0
    assert t["discount"] == 100.0
    assert t["net"] == 900.0
    assert math.isclose(t["vat"], 216.0)             # 900 * 24%
    assert math.isclose(t["gross"], 1116.0)


def test_totals_mixed_vat():
    t = offer_totals(_offer(vat=24, items=[
        {"quantity": 1, "unit_price": 100},                   # inherits 24% -> 24
        {"quantity": 1, "unit_price": 100, "vat_rate": 13},   # 13% -> 13
    ]))
    assert t["net"] == 200.0
    assert math.isclose(t["vat"], 37.0)              # 24 + 13


def test_totals_empty():
    t = offer_totals(_offer(items=[]))
    assert t["net"] == 0.0 and t["vat"] == 0.0 and t["gross"] == 0.0

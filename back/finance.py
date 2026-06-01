"""Pure offer financial math. Computes in integer cents to avoid float drift.

Model: each line has quantity, unit_price, optional discount_pct and vat_rate
(vat_rate defaults to the offer's). An offer-level discount_pct applies on the
subtotal; VAT is charged per line on its discounted net (offer discount spread
proportionally), so mixed VAT rates are handled correctly.
"""
from __future__ import annotations


def _cents(x: float) -> int:
    return int(round(float(x) * 100))


def line_net_cents(quantity, unit_price, discount_pct=0) -> int:
    gross = float(quantity or 0) * float(unit_price or 0)
    net = gross * (1 - float(discount_pct or 0) / 100)
    return _cents(net)


def offer_totals(offer: dict) -> dict:
    """Return a money breakdown for an offer dict (with nested sections/items)."""
    offer_vat = float(offer.get("vat_rate") or 0)
    offer_disc = float(offer.get("discount_pct") or 0)

    section_out: list[dict] = []
    lines: list[tuple[int, float]] = []   # (net_cents, vat_rate)
    subtotal = 0                          # cents, after per-line discounts
    for s in offer.get("sections", []) or []:
        sec_net = 0
        for it in s.get("items", []) or []:
            ln = line_net_cents(it.get("quantity"), it.get("unit_price"), it.get("discount_pct"))
            vr = it.get("vat_rate")
            lines.append((ln, float(vr) if vr is not None else offer_vat))
            sec_net += ln
        section_out.append({"name": s.get("name"), "net": round(sec_net) / 100})
        subtotal += sec_net

    discount = round(subtotal * offer_disc / 100)        # offer-level discount (cents)
    net = subtotal - discount
    factor = (net / subtotal) if subtotal else 1.0       # spread offer discount over lines
    vat = round(sum(ln * factor * (vr / 100) for ln, vr in lines))

    return {
        "currency": offer.get("currency", "EUR"),
        "vat_rate": offer_vat,
        "discount_pct": offer_disc,
        "subtotal": round(subtotal) / 100,
        "discount": round(discount) / 100,
        "net": round(net) / 100,
        "vat": vat / 100,
        "gross": (net + vat) / 100,
        "sections": section_out,
    }

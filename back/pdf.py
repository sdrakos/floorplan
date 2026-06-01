"""Branded offer PDF — fpdf2 (pure-Python, Windows-safe). Greek via Arial."""
from __future__ import annotations
import os
from fpdf import FPDF

from .finance import offer_totals

_REG = [r"C:\Windows\Fonts\arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
_BOLD = [r"C:\Windows\Fonts\arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
ACCENT = (139, 115, 85)
DARK = (58, 48, 40)


def _font_path(cands: list[str]) -> str | None:
    return next((p for p in cands if os.path.exists(p)), None)


def _money(x, currency: str = "EUR") -> str:
    s = f"{float(x or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")  # el-GR
    return f"{s} {'€' if currency == 'EUR' else currency}"


def _truncate(text: str, n: int) -> str:
    text = (text or "").replace("\n", " ")
    return text if len(text) <= n else text[: n - 1] + "…"


def offer_pdf_bytes(offer: dict) -> bytes:
    t = offer_totals(offer)
    company = offer.get("company") or {}
    cur = offer.get("currency", "EUR")

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, margin=18)
    pdf.add_page()
    reg, bold = _font_path(_REG), _font_path(_BOLD)
    pdf.add_font("u", "", reg)
    pdf.add_font("u", "B", bold or reg)

    def money(x):
        return _money(x, cur)

    # ── header ──
    pdf.set_font("u", "B", 22); pdf.set_text_color(*DARK)
    pdf.cell(0, 11, "ΠΡΟΣΦΟΡΑ", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("u", "", 10); pdf.set_text_color(90, 90, 90)
    num = offer.get("number") or str(offer.get("id", ""))[:8]
    pdf.cell(0, 6, f"Αρ. {num}    Ημ/νία: {offer.get('offer_date') or ''}", new_x="LMARGIN", new_y="NEXT")
    if company.get("name") or company.get("address"):
        pdf.ln(1)
        pdf.set_font("u", "B", 11); pdf.set_text_color(*ACCENT)
        pdf.cell(0, 6, company.get("name", ""), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("u", "", 9); pdf.set_text_color(90, 90, 90)
        for k in ("address", "web"):
            if company.get(k):
                pdf.cell(0, 5, company[k], new_x="LMARGIN", new_y="NEXT")

    pdf.ln(3); pdf.set_font("u", "B", 10); pdf.set_text_color(*DARK)
    pdf.cell(0, 6, f"Προς: {offer.get('client') or '—'}", new_x="LMARGIN", new_y="NEXT")
    if offer.get("project_name"):
        pdf.set_font("u", "", 9)
        pdf.cell(0, 5, f"Έργο: {offer['project_name']}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # ── sections + items ──
    col = (10, 96, 16, 14, 27, 27)  # # | desc | qty | unit | price | total = 190mm
    heads = ("#", "Περιγραφή", "Ποσ.", "Μον.", "Τιμή", "Σύνολο")
    for s in offer.get("sections", []) or []:
        pdf.set_font("u", "B", 11); pdf.set_text_color(*ACCENT)
        pdf.cell(0, 7, _truncate(s.get("name", ""), 70), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("u", "B", 8); pdf.set_text_color(120, 120, 120)
        for w, h in zip(col, heads):
            pdf.cell(w, 6, h, border="B", align="L" if h in ("#", "Περιγραφή") else "R")
        pdf.ln()
        pdf.set_font("u", "", 8); pdf.set_text_color(*DARK)
        for i, it in enumerate(s.get("items", []) or [], 1):
            qty = float(it.get("quantity") or 0)
            price = float(it.get("unit_price") or 0)
            line = qty * price * (1 - float(it.get("discount_pct") or 0) / 100)
            pdf.cell(col[0], 6, str(i))
            pdf.cell(col[1], 6, _truncate(it.get("description", ""), 58))
            pdf.cell(col[2], 6, f"{qty:g}", align="R")
            pdf.cell(col[3], 6, it.get("unit", "") or "", align="R")
            pdf.cell(col[4], 6, money(price), align="R")
            pdf.cell(col[5], 6, money(line), align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    # ── totals ──
    def trow(label, val, b=False, big=False):
        pdf.set_font("u", "B" if b else "", 13 if big else 9)
        pdf.set_text_color(*(ACCENT if big else DARK))
        pdf.cell(150, 7 if big else 6, label, align="R")
        pdf.cell(40, 7 if big else 6, money(val), align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    trow("Υποσύνολο", t["subtotal"])
    if t["discount"]:
        trow(f"Έκπτωση {t['discount_pct']:g}%", -t["discount"])
    trow("Καθαρή αξία", t["net"])
    trow(f"ΦΠΑ {t['vat_rate']:g}%", t["vat"])
    trow("ΣΥΝΟΛΟ", t["gross"], b=True, big=True)

    # ── terms / validity / signature ──
    if offer.get("terms"):
        pdf.ln(4); pdf.set_font("u", "B", 9); pdf.set_text_color(*DARK)
        pdf.cell(0, 5, "Όροι", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("u", "", 8); pdf.multi_cell(0, 5, offer["terms"])
    if offer.get("valid_until"):
        pdf.ln(1); pdf.set_font("u", "", 8); pdf.set_text_color(90, 90, 90)
        pdf.cell(0, 5, f"Ισχύς προσφοράς έως: {offer['valid_until']}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(14); pdf.set_font("u", "", 9); pdf.set_text_color(*DARK)
    pdf.cell(0, 5, "Υπογραφή / Σφραγίδα: ____________________________", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())

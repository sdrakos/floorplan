"""APIRouter for offers / τεύχη (Supabase-backed). Mirrors the teuchos-builder
data model: offer → sections → items. Server-side uses service_role."""
from __future__ import annotations
import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import db
from ..finance import offer_totals
from ..pdf import offer_pdf_bytes
from ..schema import OfferIn, OfferPatch, OfferContentReplace, OfferFromProject

router = APIRouter(prefix="/offers", tags=["offers"])


@router.get("")
def list_offers() -> list[dict]:
    return db.list_offers()


@router.post("/from-project")
def from_project(body: OfferFromProject) -> dict:
    """Create a priced offer from takeoff-derived quantities (Phase 1 link)."""
    offer = db.create_offer_from_quantities(
        body.name, [s.model_dump() for s in body.sections], body.project_id)
    return {"offer_id": offer["id"], "name": offer["name"]}


@router.post("")
def create_offer(body: OfferIn) -> dict:
    return db.create_offer(body.name, body.client, body.project_name, body.offer_date)


@router.get("/{offer_id}")
def get_offer(offer_id: str) -> dict:
    offer = db.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


@router.get("/{offer_id}/totals")
def totals(offer_id: str) -> dict:
    offer = db.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer_totals(offer)


@router.get("/{offer_id}/pdf")
def pdf(offer_id: str) -> StreamingResponse:
    offer = db.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    data = offer_pdf_bytes(offer)
    name = (offer.get("number") or offer_id[:8])
    return StreamingResponse(
        io.BytesIO(data), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="offer-{name}.pdf"'})


@router.put("/{offer_id}")
def update_offer(offer_id: str, body: OfferPatch) -> dict:
    updated = db.update_offer(offer_id, body.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    return updated


@router.delete("/{offer_id}", status_code=204)
def delete_offer(offer_id: str) -> None:
    db.delete_offer(offer_id)


@router.put("/{offer_id}/content")
def replace_content(offer_id: str, body: OfferContentReplace) -> dict:
    if db.get_offer(offer_id) is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    return db.replace_offer_content(offer_id, [s.model_dump() for s in body.sections])

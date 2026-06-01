"""APIRouter for the works & materials catalog (price book) + management."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException

from .. import db
from ..schema import CatalogItemIn, CatalogItemPatch

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("")
def list_catalog(category: str | None = None, q: str | None = None) -> list[dict]:
    return db.list_catalog(category=category, q=q)


@router.get("/categories")
def categories() -> list[str]:
    return db.catalog_categories()


@router.post("")
def create_item(body: CatalogItemIn) -> dict:
    return db.create_catalog_item(
        category=body.category, description=body.description, unit=body.unit,
        unit_price=body.unit_price, kind=body.kind, code=body.code)


@router.put("/{item_id}")
def update_item(item_id: str, body: CatalogItemPatch) -> dict:
    updated = db.update_catalog_item(item_id, body.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    return updated


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str) -> None:
    db.delete_catalog_item(item_id)

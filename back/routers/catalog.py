"""APIRouter for the works & materials catalog (price book)."""
from __future__ import annotations
from fastapi import APIRouter

from .. import db

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("")
def list_catalog(category: str | None = None, q: str | None = None) -> list[dict]:
    return db.list_catalog(category=category, q=q)


@router.get("/categories")
def categories() -> list[str]:
    return db.catalog_categories()

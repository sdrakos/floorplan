"""APIRouter for floor-plan projects + their shapes (Supabase-backed).

Server-side uses the service_role key (RLS bypassed in dev). Replaces the
front-end's window.storage persistence.
"""
from __future__ import annotations
from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import db
from ..schema import ProjectIn, ProjectPatch, ShapesReplace

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("")
def list_projects() -> list[dict]:
    return db.list_projects()


@router.post("")
def create_project(body: ProjectIn) -> dict:
    return db.create_project(body.name, body.calibration, body.image_path)


@router.get("/{project_id}")
def get_project(project_id: str) -> dict:
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
def update_project(project_id: str, body: ProjectPatch) -> dict:
    updated = db.update_project(project_id, body.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str) -> None:
    db.delete_project(project_id)


@router.put("/{project_id}/shapes")
def replace_shapes(project_id: str, body: ShapesReplace) -> dict:
    if db.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    rows = db.replace_shapes(project_id, [s.model_dump() for s in body.shapes])
    return {"project_id": project_id, "count": len(rows)}


@router.post("/{project_id}/image")
async def upload_image(project_id: str, file: UploadFile = File(...)) -> dict:
    if db.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    data = await file.read()
    path = db.upload_project_image(project_id, data, file.content_type or "image/png")
    return {"image_path": path, "url": db.project_image_signed_url(project_id)}


@router.get("/{project_id}/image-url")
def image_url(project_id: str) -> dict:
    url = db.project_image_signed_url(project_id)
    if not url:
        raise HTTPException(status_code=404, detail="No image for this project")
    return {"url": url}

"""Supabase data-access layer (supabase-py).

Local dev: the backend uses the **service_role** key, which bypasses RLS, so it
writes under the default dev tenant without auth wired yet. Reads config from
back/.env (or the process env):

  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_SERVICE_KEY=<local service_role key>   # from `supabase status`

When you move to cloud, only these two values change — code stays the same.
"""
from __future__ import annotations
import os
from functools import lru_cache

from supabase import Client, create_client

# Seeded by the init migration; the tenant the backend writes under in dev.
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"
PLANS_BUCKET = "plans"  # private bucket for floor-plan images
_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


def load_env(path: str = _ENV_PATH) -> None:
    """Minimal .env loader (no extra dependency). Existing env vars win."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


@lru_cache(maxsize=1)
def get_client() -> Client:
    load_env()
    url = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not key:
        raise RuntimeError(
            "Missing SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) in back/.env. "
            "Run `npx supabase status` and copy the service_role key."
        )
    return create_client(url, key)


# ── thin repository helpers (service_role → RLS bypassed in dev) ──────────────

def log_detection(engine: str, room_count: int, params: dict | None = None,
                  project_id: str | None = None, tenant_id: str = DEFAULT_TENANT_ID) -> dict:
    row = {"tenant_id": tenant_id, "engine": engine, "room_count": room_count,
           "params": params or {}, "project_id": project_id}
    return get_client().table("detections").insert(row).execute().data[0]


def upsert_conversation(session: str, tenant_id: str = DEFAULT_TENANT_ID, **fields) -> dict:
    row = {"tenant_id": tenant_id, "session": session, **fields}
    return (get_client().table("conversations")
            .upsert(row, on_conflict="tenant_id,session").execute().data[0])


# ── projects + shapes ─────────────────────────────────────────────────────────

def list_projects(tenant_id: str = DEFAULT_TENANT_ID) -> list[dict]:
    return (get_client().table("projects").select("*")
            .eq("tenant_id", tenant_id).order("updated_at", desc=True).execute().data)


def create_project(name: str, calibration: dict | None = None,
                   image_path: str | None = None, tenant_id: str = DEFAULT_TENANT_ID) -> dict:
    row = {"tenant_id": tenant_id, "name": name,
           "calibration": calibration or {}, "image_path": image_path}
    return get_client().table("projects").insert(row).execute().data[0]


def get_project(project_id: str) -> dict | None:
    rows = get_client().table("projects").select("*").eq("id", project_id).execute().data
    if not rows:
        return None
    project = rows[0]
    project["shapes"] = get_shapes(project_id)
    return project


def update_project(project_id: str, fields: dict) -> dict | None:
    allowed = {k: v for k, v in fields.items() if k in ("name", "calibration", "image_path")}
    if not allowed:
        return get_project(project_id)
    rows = get_client().table("projects").update(allowed).eq("id", project_id).execute().data
    return rows[0] if rows else None


def delete_project(project_id: str) -> None:
    get_client().table("projects").delete().eq("id", project_id).execute()


def get_shapes(project_id: str) -> list[dict]:
    return (get_client().table("shapes").select("*")
            .eq("project_id", project_id).order("created_at").execute().data)


def replace_shapes(project_id: str, shapes: list[dict], tenant_id: str = DEFAULT_TENANT_ID) -> list[dict]:
    """Bulk replace all shapes of a project (matches the front's save-everything model)."""
    client = get_client()
    client.table("shapes").delete().eq("project_id", project_id).execute()
    if not shapes:
        return []
    rows = [{
        "tenant_id": tenant_id, "project_id": project_id,
        "kind": s.get("kind", "polygon"), "layer": s.get("layer", "room_internal"),
        "label": s.get("label"), "points": s.get("points", []),
        "area_px2": s.get("area_px2"), "area_m2": s.get("area_m2"),
    } for s in shapes]
    return client.table("shapes").insert(rows).execute().data


# ── offers / sections / items (τεύχη) ─────────────────────────────────────────

def list_offers(tenant_id: str = DEFAULT_TENANT_ID) -> list[dict]:
    return (get_client().table("offers").select("*")
            .eq("tenant_id", tenant_id).order("updated_at", desc=True).execute().data)


def create_offer(name: str, client: str | None = None, project_name: str | None = None,
                 offer_date: str | None = None, tenant_id: str = DEFAULT_TENANT_ID) -> dict:
    row = {"tenant_id": tenant_id, "name": name, "client": client,
           "project_name": project_name, "offer_date": offer_date}
    return get_client().table("offers").insert(row).execute().data[0]


def get_offer(offer_id: str) -> dict | None:
    c = get_client()
    rows = c.table("offers").select("*").eq("id", offer_id).execute().data
    if not rows:
        return None
    offer = rows[0]
    sections = (c.table("offer_sections").select("*")
                .eq("offer_id", offer_id).order("position").execute().data)
    sids = [s["id"] for s in sections]
    items = []
    if sids:
        items = (c.table("offer_items").select("*")
                 .in_("section_id", sids).order("position").execute().data)
    by_section: dict[str, list] = {}
    for it in items:
        by_section.setdefault(it["section_id"], []).append(it)
    for s in sections:
        s["items"] = by_section.get(s["id"], [])
    offer["sections"] = sections
    return offer


def update_offer(offer_id: str, fields: dict) -> dict | None:
    allowed = {k: v for k, v in fields.items()
               if k in ("name", "client", "project_name", "offer_date", "vat_rate",
                        "discount_pct", "status", "terms", "notes", "valid_until",
                        "number", "company", "client_id")}
    if not allowed:
        return get_offer(offer_id)
    rows = get_client().table("offers").update(allowed).eq("id", offer_id).execute().data
    return rows[0] if rows else None


def delete_offer(offer_id: str) -> None:
    get_client().table("offers").delete().eq("id", offer_id).execute()


def _bucket_names() -> set[str]:
    try:
        return {getattr(b, "name", None) or (b.get("name") if isinstance(b, dict) else None)
                for b in get_client().storage.list_buckets()}
    except Exception:
        return set()


def ensure_bucket(name: str = PLANS_BUCKET) -> None:
    if name in _bucket_names():
        return
    try:
        get_client().storage.create_bucket(name, options={"public": False})
    except Exception:
        pass  # already exists / race — fine


def upload_project_image(project_id: str, data: bytes, content_type: str = "image/png",
                         tenant_id: str = DEFAULT_TENANT_ID) -> str:
    ensure_bucket()
    ext = _EXT.get(content_type, "png")
    path = f"{tenant_id}/{project_id}.{ext}"
    get_client().storage.from_(PLANS_BUCKET).upload(
        path, data, {"content-type": content_type, "upsert": "true"})
    update_project(project_id, {"image_path": path})
    return path


def project_image_signed_url(project_id: str, expires_in: int = 3600) -> str | None:
    project = get_project(project_id)
    if not project or not project.get("image_path"):
        return None
    res = get_client().storage.from_(PLANS_BUCKET).create_signed_url(
        project["image_path"], expires_in)
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    return res


def list_catalog(category: str | None = None, q: str | None = None,
                 tenant_id: str = DEFAULT_TENANT_ID) -> list[dict]:
    """Global catalog (tenant_id IS NULL) plus the tenant's own items."""
    query = get_client().table("catalog_items").select("*").or_(
        f"tenant_id.is.null,tenant_id.eq.{tenant_id}")
    if category:
        query = query.eq("category", category)
    if q:
        query = query.ilike("description", f"%{q}%")
    return query.order("category").order("code").limit(2000).execute().data


def catalog_categories(tenant_id: str = DEFAULT_TENANT_ID) -> list[str]:
    rows = get_client().table("catalog_items").select("category").or_(
        f"tenant_id.is.null,tenant_id.eq.{tenant_id}").execute().data
    return sorted({r["category"] for r in rows})


def reseed_global_catalog(rows: list[dict]) -> int:
    """Replace the global catalog (tenant_id IS NULL) with `rows`. Idempotent."""
    c = get_client()
    c.table("catalog_items").delete().is_("tenant_id", "null").execute()
    if rows:
        c.table("catalog_items").insert(rows).execute()
    return len(rows)


def create_offer_from_quantities(name: str, sections: list[dict], project_id: str | None = None,
                                 tenant_id: str = DEFAULT_TENANT_ID) -> dict:
    """Create an offer linked to a project and fill it from takeoff-derived quantities."""
    offer = get_client().table("offers").insert(
        {"tenant_id": tenant_id, "name": name, "project_id": project_id}).execute().data[0]
    replace_offer_content(offer["id"], sections, tenant_id)
    return offer


def replace_offer_content(offer_id: str, sections: list[dict],
                          tenant_id: str = DEFAULT_TENANT_ID) -> dict:
    """Bulk replace all sections + items of an offer (front save-everything model)."""
    c = get_client()
    c.table("offer_sections").delete().eq("offer_id", offer_id).execute()  # cascades items
    n_sections = n_items = 0
    for si, sec in enumerate(sections):
        srow = c.table("offer_sections").insert({
            "tenant_id": tenant_id, "offer_id": offer_id,
            "name": sec.get("name", ""), "note": sec.get("note"), "position": si,
        }).execute().data[0]
        n_sections += 1
        items = sec.get("items", [])
        if items:
            c.table("offer_items").insert([{
                "tenant_id": tenant_id, "section_id": srow["id"],
                "description": it.get("description", ""), "quantity": it.get("quantity", 0),
                "unit": it.get("unit", "pcs"), "unit_price": it.get("unit_price", 0),
                "position": ii,
            } for ii, it in enumerate(items)]).execute()
            n_items += len(items)
    return {"offer_id": offer_id, "sections": n_sections, "items": n_items}

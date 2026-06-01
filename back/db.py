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

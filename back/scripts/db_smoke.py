"""Smoke-test the Supabase connection + schema via supabase-py.

  python back/scripts/db_smoke.py
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from back.db import get_client, DEFAULT_TENANT_ID, log_detection

c = get_client()

tenants = c.table("tenants").select("*").execute().data
print("tenants:", tenants)
assert any(t["id"] == DEFAULT_TENANT_ID for t in tenants), "default tenant missing"

det = log_detection("classical", 9, {"smoke": True})
print("inserted detection:", det["id"], det["engine"], det["room_count"])

n = len(c.table("detections").select("id").execute().data)
print(f"detections rows: {n}")
print("OK — supabase-py connected, schema reachable, insert/read works.")

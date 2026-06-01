"""Seed the global catalog (tenant_id IS NULL) from back/catalog_data.py.
Idempotent — replaces the global rows each run.

  python back/scripts/seed_catalog.py
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from back.catalog_data import as_dicts
from back.db import reseed_global_catalog

n = reseed_global_catalog(as_dicts(tenant_id=None))
print(f"✓ seeded {n} global catalog items")

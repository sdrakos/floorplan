# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`FLOORPLAN/` is a Greek (el-GR) construction estimating / quoting app. The flow is:
**trace a floor plan → detect rooms & derive material/labour quantities → assemble a priced offer
("Τεύχος") → branded PDF**. It grew from standalone React artifacts into a **full stack**:

- **`front/`** — React (Vite) UI: a floor-plan takeoff tool + an offer/τεύχος builder + a catalog manager.
- **`back/`** — FastAPI service: room detection (multiple engines), Supabase data layer, offers + PDF.
- **`supabase/`** — local Supabase stack (Postgres + Auth + Storage) via migrations.

## Run

```bat
REM 1. Database (Docker; Studio at http://127.0.0.1:54323)
npx supabase start
REM 2. Backend API (uses the GLOBAL Python env — no venv) -> http://127.0.0.1:8000
python back\app.py            REM or: uvicorn back.app:app --port 8000
REM 3. Front (Vite) -> http://localhost:5180  (5173 is taken by another local app)
cd front & npm install & npm run dev
```

- **Python = the global interpreter** (`C:\Users\...\Python313`), NOT a venv. Install deps with
  `pip install -r back\requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu`.
- **CubiCasa engine setup** (optional): clone the vendored model + weights, then patch:
  `git clone --depth 1 https://github.com/EmanuelKuhn/CubiCasa5k back\detector\cubicasa_model\vendor`,
  `python back\scripts\patch_vendor.py`, `python back\scripts\download_weights.py`.
- **Seed the catalog**: `python back\scripts\seed_catalog.py` (after `supabase start`).

## Tests

```bat
python -m pytest back\tests -v
REM DB/integration tests auto-skip if local Supabase isn't running.
REM Detection integration tests auto-skip if CubiCasa weights are absent.
REM A single test:
python -m pytest back\tests\test_finance.py::test_totals_mixed_vat -v
```

There is **no lint step** and **no front-end test suite**; validate the front with `npm run build`
(it bundles every component, so it catches JSX/import errors).

## Architecture — the big picture

### The one data model (the core seam)
Everything funnels into one shape:
```
offer → sections[] → items[] = { description, quantity, unit, unit_price }
```
The takeoff tool's `deriveQuantities()` emits exactly this; the offer builder consumes it; the backend
`/offers` API and the catalog all speak it. Keep this item shape stable across any edit.

### Backend (`back/`, FastAPI)
- **`app.py`** — thin entrypoint: CORS (so the browser can call it) + `include_router(...)`. Runnable
  both as a script (`python back/app.py`) and a module (`uvicorn back.app:app`).
- **`routers/`** — `detect.py` (`/detect`, `/detect/overlay`), `projects.py` (`/projects` CRUD + image
  upload/signed-URL), `offers.py` (`/offers` CRUD, `/from-project`, `/totals`, `/pdf`), `catalog.py`
  (`/catalog` list/CRUD).
- **`detector/`** — the swappable detection layer. `base.RoomDetector` (ABC) + `DetectedRoom`
  (polygon in **original-image pixels** + layer `type`). `dependencies.get_detector_for(engine)`
  selects an engine by name; **all engines return the same `DetectedRoom` shape**:
  - `classical` (OpenCV walls→watershed), `planar` (wall graph→faces), `cubicasa` (CC BY-NC ML,
    vendored), `sam` (SAM2 baseline), `claude` / `gemini` (VLM proxies, keys from `back/.env`).
  - **Honest status:** geometric engines can't split open-plan (no walls); base SAM segments
    furniture; VLMs (Claude/Gemini) give the best room-level labels but imperfect geometry. The
    intended workflow is **auto-detect → manual vertex correction in the canvas**.
- **`geometry.py`** (shoelace area, px²→m², simplify) and **`finance.py`** (VAT/discount/totals in
  integer cents) are **pure** and unit-tested.
- **`db.py`** — Supabase data access via **supabase-py** using the **service_role** key (bypasses RLS
  in dev). Reads `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` from `back/.env`. **Cloud migration = change
  only those two env vars; no code change.** `DEFAULT_TENANT_ID` is the dev tenant everything writes under.
- **`pdf.py`** — branded offer PDF via **fpdf2** (Greek via Arial, el-GR money formatting).
- **`catalog_data.py`** — ~124 researched Greek unit prices (work/material/combo); seeded into the
  `catalog_items` table. **Single source of truth for prices**: the takeoff `deriveQuantities()` maps
  each generated line to a catalog `code` and pulls its unit price (falls back to an indicative value
  if the catalog/server is unavailable). Editing the catalog updates auto-generated offers too.

### Supabase (`supabase/migrations/`)
Multi-tenant schema: `tenants, memberships, projects, shapes, detections, offers, offer_sections,
offer_items, conversations, clients, offer_templates, catalog_items`. **Every table has `tenant_id`
and RLS** with membership-based policies (auth not wired yet — backend uses service_role). New tables
in `public` are NOT auto-exposed to the Data API (Apr-2026 change) → migrations `GRANT` explicitly.
After schema edits run `npx supabase db advisors --local` and keep it clean. Floor-plan images go to a
private Storage bucket `plans`.

### Front (`front/`)
- **`src/App.jsx`** — top-level shell with a **menu**: 📐 Κατόψεις (`floor-plan-takeoff.jsx`),
  📋 Προσφορές (`teuchos-builder-v3.jsx`), 📚 Κατάλογος (`src/CatalogManager.jsx`).
- **`src/storage-shim.js`** — polyfills the artifacts' `window.storage` API onto `localStorage`
  (must load before components mount). Components still own distinct `STORAGE_KEY`s; cloud sync to the
  backend is layered on top (debounced auto-push + an explicit save).
- The three offer builders (`construction-offer-manager` → `teuchos-builder` → `teuchos-builder-v3`)
  are **successive rewrites**, not a hierarchy. `teuchos-builder-v3.jsx` is canonical.
- `BACKEND_URL`/`API_URL` are hardcoded to `http://localhost:8000` at the top of the relevant files.

## Conventions

- **Greek domain + locale**: UI/strings/templates in Greek; `Intl.NumberFormat("el-GR", …)`; metric units.
- **Front styling is inline** style objects (`S`/`B`) + an injected `<style>` tag; no CSS/Tailwind/UI lib.
- **IDs (front)**: local `uid()`; **(DB)**: `gen_random_uuid()`.
- **Money is summed server-side in integer cents** (`finance.py`) — never trust client-side totals.
- **Detection coords** are always original-image pixels; scale (pixels→m) is **manual** (front
  calibration), passed to the backend as `pixels_per_meter`.

## Conversation Logging (standing instruction)

Record every conversation and **update at each checkpoint** (after each meaningful step) to **three
mirrors** (best-effort):

1. **SQLite** `back/claude.db` via `back/conversation_log.py upsert --session <id> --title … --summary …
   --status … --type … --project … --device … --notion-url <url>`.
2. **Supabase** `conversations` table (auto-mirrored by `conversation_log.py`; disable with `FLOORPLAN_DB_LOG=0`).
3. **Notion** "📝 Claude Conversations" DB (data source `cd521f39-b784-426d-8a73-2a7f35391d65`) via the
   Notion MCP — create once per conversation, `update-page` on later checkpoints.

Rules: **one row per conversation** (keyed by `--session`), updated in place; store the Notion URL back
into `claude.db` with `--notion-url`; `claude.db` is gitignored — never commit it.

## Commits

- Remote is **public** (`github.com/sdrakos/floorplan`). FLOORPLAN has its **own git repo** (nested
  inside `AGENTI_SDK/`, which does not track it); auth via the PAT in `back/.env`, embedded in the
  remote URL so pushes don't prompt.
- **Author/sign commits as `sdrakos`. Never add a `Co-Authored-By` line.**
- **Never commit** `.env`, `claude.db`, `.Claude/`, `node_modules/`, `dist/`, the vendored CubiCasa
  tree, model weights (`*.pkl/*.pth`), generated render PNGs, or the `paper/` dir (all gitignored).

# Professional Offers (Τεύχη) — Integration Plan

> **For agentic workers:** phased plan. Each phase is independently shippable and ends green
> (tests + a live check). Execute phases in order; within a phase, follow the steps.

**Goal:** Take the offers feature from "a builder UI with local data" to a **professional, integrated
quoting system**: offers generated from the takeoff measurements, with VAT, numbering, status,
branded PDF, clients, and cloud persistence — usable in front of a paying client.

**Where we start (already built):**
- `teuchos-builder-v3.jsx`: offer with company branding/logo, client/project/date, sections→items
  (`description, quantity, unit, unitPrice, notes`), Greek construction templates, CSV import,
  letterhead preview, print, offer comparison, save-as-template.
- `floor-plan-takeoff.jsx`: detects rooms, computes areas, and `deriveQuantities()` already emits
  priced line items (`{sec, desc, qty, unit, price}`) — tiles, ceilings, paint, etc.
- Supabase: `offers / offer_sections / offer_items` tables + `/offers` API (CRUD + bulk content),
  multi-tenant, RLS-ready. Auto-sync from the builder is wired.

**Core insight:** the two halves are already shaped to connect — `deriveQuantities()` output maps
1:1 onto offer items. The professional product is **takeoff → priced offer → branded PDF → client**.

**Tech:** Python/FastAPI + supabase-py (backend), React artifacts (front), Postgres migrations,
server-side PDF (WeasyPrint or ReportLab). Money handled in integer cents server-side where summed.

---

## Phase 0 — Data-model hardening (migration)

**Files:** `supabase/migrations/<ts>_offers_pro.sql`

Add professional fields and supporting tables. New migration (via `supabase migration new offers_pro`):

- [ ] **`offers` new columns:**
  - `number text` (human offer no., e.g. `2026-0001`), `status text default 'draft'`
    (`draft|sent|accepted|rejected|expired`), `currency text default 'EUR'`,
    `vat_rate numeric default 24`, `discount_pct numeric default 0`,
    `valid_until date`, `terms text`, `notes text`, `version int default 1`,
    `company jsonb default '{}'` (name/addr/web/logo_path), `client_id uuid references public.clients(id)`.
- [ ] **`clients` table** (id, tenant_id, name, contact, email, phone, address, vat_no, created_at) — RLS + tenant policy (copy the `*_rw` policy pattern from the init migration).
- [ ] **`offer_templates` table** (id, tenant_id, name, icon, category, sections jsonb) — shared templates (replaces localStorage `custom`). RLS + policy.
- [ ] **`offer_items` new columns:** `discount_pct numeric default 0`, `vat_rate numeric` (null = inherit offer), `notes text`, `category text`.
- [ ] Run `supabase db advisors --local` → fix warnings (set `search_path` on any new function). Verify: `supabase db reset` applies cleanly.

**Verify:** `python back/scripts/db_smoke.py` style check inserting a client + offer with the new fields.

---

## Phase 1 — Offer ⇄ Takeoff link (the differentiator)

**Files:** `back/db.py`, `back/routers/offers.py`, `front/floor-plan-takeoff.jsx`

Generate a priced offer directly from a project's measured quantities.

- [ ] **Backend `create_offer_from_quantities(project_id, sections)`** in `db.py`: create an offer
  (linked `project_id`), then `replace_offer_content` with the supplied sections. Each item:
  `{description, quantity, unit, unit_price}`.
- [ ] **Endpoint** `POST /offers/from-project` body `{project_id, name?, sections:[...]}` → returns the offer id.
  (The front sends `deriveQuantities()` mapped to `sections`, since pricing/derivation already lives there.)
- [ ] **Front (takeoff):** add a button **"📋 Δημιουργία Προσφοράς"** next to Export. It calls
  `deriveQuantities()`, groups items by `sec` into sections, POSTs to `/offers/from-project`, and
  shows the new offer number / a link to open it in the builder.
- [ ] Round-trip the derivation: a unit test asserts a takeoff with N rooms → an offer whose item
  total equals `Σ qty*price` from `deriveQuantities()`.

**Verify (live):** detect on a sample plan → "Create offer" → `GET /offers/{id}` shows the derived
sections/items with correct totals.

---

## Phase 2 — Financials (VAT, discounts, totals)

**Files:** `back/finance.py` (new, pure), `back/routers/offers.py`, `front/teuchos-builder-v3.jsx`

- [ ] **`back/finance.py`** pure functions (work in integer cents to avoid float drift):
  `line_net(qty, unit_price, discount_pct)`, `offer_totals(offer)` → `{net, discount, vat, gross}`
  with per-section subtotals and per-item or offer-level `vat_rate`.
- [ ] **`GET /offers/{id}/totals`** returns the computed breakdown (server is the source of truth for money).
- [ ] Unit tests for finance: known offer → exact net/VAT/gross; mixed VAT rates; discounts; 0-rate.
- [ ] **Front (builder + preview):** show per-section subtotal, net, discount, **ΦΠΑ 24%**, gross;
  inputs for `vat_rate`, `discount_pct`, per-line discount. Preview footer shows the full breakdown.

**Verify:** finance unit tests pass; preview totals match `/offers/{id}/totals`.

---

## Phase 3 — Numbering, status, versioning

**Files:** `back/db.py`, `back/routers/offers.py`, `front/teuchos-builder-v3.jsx`

- [ ] **Offer numbering** per tenant per year: `next_offer_number(tenant)` → `YYYY-NNNN`
  (sequence table or `max+1` in a transaction). Assigned on first "send" (or on create — decide).
- [ ] **Status workflow** endpoints: `POST /offers/{id}/status {status}` with allowed transitions
  (`draft→sent→accepted|rejected`, `→expired` when past `valid_until`). Stamp `sent_at`, `decided_at`.
- [ ] **Versioning:** "New revision" duplicates the offer with `version+1`, same `number`, status `draft`,
  linking `supersedes` (add column). Keep history queryable.
- [ ] **Front:** status chips + actions in `ListV`/`EditV`; filter offers by status; show number/version.

**Verify:** create → send (gets number) → accept; new revision bumps version, keeps number.

---

## Phase 4 — Professional PDF export (server-side)

**Files:** `back/pdf.py` (new), `back/routers/offers.py`, `back/requirements.txt`

Replace browser-print with consistent, branded, paginated PDF.

- [ ] Add a PDF engine to `requirements.txt` (prefer **WeasyPrint** — HTML/CSS templating; fallback
  ReportLab). Render an HTML template (letterhead with logo from Storage, client block, offer no./date,
  sectioned line items, totals breakdown, terms, validity, signature block) → PDF bytes.
- [ ] **`GET /offers/{id}/pdf`** → `StreamingResponse(application/pdf)` with filename
  `offer-{number}.pdf`. Logo pulled from Storage via signed URL / bytes.
- [ ] **Front:** replace the print button with **"⬇️ PDF"** that hits the endpoint.
- [ ] Smoke: generate a PDF for a seeded offer; assert non-empty `application/pdf` and that totals/number appear.

**Verify (live):** `curl .../offers/{id}/pdf -o offer.pdf` → opens as a branded, paginated document.

---

## Phase 5 — Clients

**Files:** `back/routers/clients.py` (new), `back/db.py`, `front/teuchos-builder-v3.jsx`

- [ ] **`/clients` CRUD** (service_role; tenant-scoped). Reuse across offers via `offers.client_id`.
- [ ] **Front:** client picker in the builder (select existing or create); offer pulls client block from
  the client record (name/address/VAT) instead of free-text.
- [ ] Verify: create client → create offer referencing it → preview/PDF shows client details.

---

## Phase 6 — Shared client link (accept online) — optional/advanced

**Files:** migration (tokens), `back/routers/public.py` (new, unauthenticated)

- [ ] `offer_share_tokens` table (offer_id, token, expires_at). `POST /offers/{id}/share` → token URL.
- [ ] **Public, read-only** endpoint `GET /public/offer/{token}` (no auth) returning a sanitized
  offer + an **Accept** action (`POST /public/offer/{token}/accept`) that sets status `accepted`.
  Strictly scoped: token only exposes that one offer; no tenant data leakage.
- [ ] Verify: token URL renders the offer; accept flips status; expired/invalid token → 404.

---

## Phase 7 — Shared templates in DB

**Files:** `back/routers/offers.py`, `front/teuchos-builder-v3.jsx`

- [ ] `/offer-templates` CRUD; migrate the builder's localStorage `custom` templates into `offer_templates`.
- [ ] Front: "Save as template" writes to the API; template list loads from the API (cross-device).
- [ ] Keep the built-in `TEMPLATES` (Greek construction) in code; DB holds user/custom ones.

---

## Suggested order & MVP

**Professional MVP = Phases 0 → 1 → 2 → 4** (data model, takeoff→offer, VAT/totals, branded PDF).
That alone makes it client-ready. Phases 3 (numbering/status), 5 (clients), 7 (templates) are the
next polish tier; Phase 6 (online accept) is a differentiator for later.

## Cross-cutting

- **Money:** compute totals server-side in integer cents; never trust client sums.
- **Multi-tenant/RLS:** every new table gets `tenant_id` + the `*_rw` policy; backend uses service_role in dev.
- **Cloud move:** unchanged — only `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` differ in `back/.env`.
- **Verification:** each phase ends with `pytest back/tests` green + one live `curl`/script check.
- **i18n/format:** keep `el-GR` EUR formatting; PDF and UI in Greek.

-- ════════════════════════════════════════════════════════════════════════
-- Offers PRO — clients, shared templates, and professional offer fields.
-- Multi-tenant + RLS (same membership pattern as the init migration).
-- ════════════════════════════════════════════════════════════════════════

-- ── clients (reusable across offers) ────────────────────────────────────────
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  contact    text,
  email      text,
  phone      text,
  address    text,
  vat_no     text,
  created_at timestamptz not null default now()
);
create index on public.clients (tenant_id);

-- ── shared offer templates (DB-backed, cross-device) ────────────────────────
create table public.offer_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  icon       text,
  category   text,
  sections   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.offer_templates (tenant_id);

-- ── offers: professional fields ─────────────────────────────────────────────
alter table public.offers
  add column number       text,
  add column status       text not null default 'draft',     -- draft|sent|accepted|rejected|expired
  add column currency     text not null default 'EUR',
  add column vat_rate      numeric not null default 24,
  add column discount_pct  numeric not null default 0,
  add column valid_until   date,
  add column terms         text,
  add column notes         text,
  add column version       int not null default 1,
  add column company       jsonb not null default '{}'::jsonb, -- {name, address, web, logo_path}
  add column client_id     uuid references public.clients(id) on delete set null,
  add column supersedes    uuid references public.offers(id) on delete set null,
  add column sent_at       timestamptz,
  add column decided_at    timestamptz;

create index on public.offers (client_id);
create index on public.offers (status);

-- ── offer_items: per-line financial detail ──────────────────────────────────
alter table public.offer_items
  add column discount_pct numeric not null default 0,
  add column vat_rate     numeric,                  -- null = inherit offer.vat_rate
  add column notes        text,
  add column category     text;

-- ════════════════════════════ RLS ══════════════════════════════════════════
alter table public.clients         enable row level security;
alter table public.offer_templates enable row level security;

grant all privileges on table public.clients, public.offer_templates to authenticated;

create policy clients_rw on public.clients for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy offer_templates_rw on public.offer_templates for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

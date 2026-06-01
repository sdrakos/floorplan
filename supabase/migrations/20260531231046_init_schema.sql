-- ════════════════════════════════════════════════════════════════════════
-- FloorPlan schema — multi-tenant-ready. RLS enabled on every table.
-- Dev: the backend uses the service_role key (bypasses RLS). When auth is
-- wired later, the membership-based policies below apply automatically — no
-- schema rewrite needed.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- gen_random_uuid()

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''       -- advisor: avoid mutable search_path (now() is in pg_catalog)
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── tenants ───────────────────────────────────────────────────────────────
create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── memberships (links future auth.users to tenants) ────────────────────────
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- ── projects (replaces window.storage takeoff projects) ─────────────────────
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  image_path  text,
  calibration jsonb not null default '{}'::jsonb,  -- {pixelsPerMeter, wallHeight, calLine, calMeters}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── shapes (rooms / walls / openings) ───────────────────────────────────────
create table public.shapes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind       text not null default 'polygon',     -- polygon | line
  layer      text not null,                        -- room_internal, room_wc, room_kitchen, ...
  label      text,
  points     jsonb not null,                       -- [{x, y}, ...] image pixels
  area_px2   double precision,
  area_m2    double precision,
  created_at timestamptz not null default now()
);

-- ── detections (backend run log) ────────────────────────────────────────────
create table public.detections (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  engine     text not null,                        -- classical | cubicasa
  params     jsonb not null default '{}'::jsonb,
  room_count int,
  created_at timestamptz not null default now()
);

-- ── offers / sections / items (τεύχη προσφορών) ─────────────────────────────
create table public.offers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  name         text not null,
  client       text,
  project_name text,
  offer_date   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.offer_sections (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  offer_id  uuid not null references public.offers(id) on delete cascade,
  name      text not null,
  note      text,
  position  int not null default 0
);

create table public.offer_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  section_id  uuid not null references public.offer_sections(id) on delete cascade,
  description text not null default '',
  quantity    numeric not null default 0,
  unit        text not null default 'pcs',
  unit_price  numeric not null default 0,
  position    int not null default 0
);

-- ── conversations (mirror of the Notion "Claude Conversations" DB + claude.db) ─
create table public.conversations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  session       text not null,
  title         text,
  summary       text,
  action_items  text,
  key_decisions text,
  status        text,                              -- Completed | In Progress | Follow Up Needed | Reference
  projects      text[],                            -- multi-select
  type          text,                              -- Development | Strategy | ...
  device_source text,
  conv_date     date,
  notion_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, session)
);

-- ── triggers ────────────────────────────────────────────────────────────────
create trigger trg_projects_updated      before update on public.projects      for each row execute function public.set_updated_at();
create trigger trg_offers_updated        before update on public.offers        for each row execute function public.set_updated_at();
create trigger trg_conversations_updated before update on public.conversations for each row execute function public.set_updated_at();

-- ── indexes ──────────────────────────────────────────────────────────────────
create index on public.memberships   (user_id);
create index on public.projects      (tenant_id);
create index on public.shapes        (tenant_id);
create index on public.shapes        (project_id);
create index on public.detections    (tenant_id);
create index on public.detections    (project_id);
create index on public.offers        (tenant_id);
create index on public.offer_sections(offer_id);
create index on public.offer_items   (section_id);
create index on public.conversations (tenant_id);

-- ════════════════════════════ RLS ══════════════════════════════════════════
alter table public.tenants        enable row level security;
alter table public.memberships    enable row level security;
alter table public.projects       enable row level security;
alter table public.shapes         enable row level security;
alter table public.detections     enable row level security;
alter table public.offers         enable row level security;
alter table public.offer_sections enable row level security;
alter table public.offer_items    enable row level security;
alter table public.conversations  enable row level security;

-- Expose to the Data API (since Apr 2026 new tables are NOT auto-exposed).
-- service_role bypasses RLS; `authenticated` is gated by the policies below.
grant usage on schema public to anon, authenticated;
grant all privileges on all tables in schema public to authenticated;

-- tenants: visible to members.
create policy tenants_select on public.tenants for select to authenticated
  using (id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- memberships: a user sees their own rows.
create policy memberships_self on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));

-- Tenant-scoped read/write for the domain tables (select+insert+update+delete,
-- with WITH CHECK so a row can't be moved to a foreign tenant).
create policy projects_rw on public.projects for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy shapes_rw on public.shapes for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy detections_rw on public.detections for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy offers_rw on public.offers for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy offer_sections_rw on public.offer_sections for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy offer_items_rw on public.offer_items for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy conversations_rw on public.conversations for all to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- ── dev seed: a default tenant the backend (service_role) writes under ───────
insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default (dev)');

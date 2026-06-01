-- ════════════════════════════════════════════════════════════════════════
-- Catalog of works & materials (price book). Rows with tenant_id = NULL are the
-- shared/global catalog (seeded from back/catalog_data.py); a tenant may also
-- add its own private rows.
-- ════════════════════════════════════════════════════════════════════════

create table public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,  -- NULL = global
  code        text,
  category    text not null,
  description text not null,
  unit        text not null default 'τεμ',
  unit_price  numeric not null default 0,
  kind        text not null default 'combo',   -- work | material | combo
  created_at  timestamptz not null default now()
);
create index on public.catalog_items (category);
create index on public.catalog_items (tenant_id);

alter table public.catalog_items enable row level security;
grant all privileges on table public.catalog_items to authenticated;

-- read: global rows OR the member's own tenant rows
create policy catalog_select on public.catalog_items for select to authenticated
  using (tenant_id is null
         or tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- write: only the member's own tenant rows (global catalog is managed server-side).
-- Split per-action so SELECT has a single permissive policy (catalog_select).
create policy catalog_insert on public.catalog_items for insert to authenticated
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy catalog_update on public.catalog_items for update to authenticated
  using      (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy catalog_delete on public.catalog_items for delete to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

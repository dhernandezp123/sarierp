-- Miami bodega: catálogo de transportistas (carriers) administrable desde la UI.

create table if not exists public.miami_carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint miami_carriers_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists miami_carriers_name_unique_idx
  on public.miami_carriers (lower(name));

-- Semilla con los valores que estaban hardcodeados en la UI.
insert into public.miami_carriers (name)
values
  ('UPS'),
  ('FedEx'),
  ('DHL'),
  ('USPS'),
  ('Amazon Logistics'),
  ('OnTrac'),
  ('LaserShip'),
  ('Otro')
on conflict ((lower(name))) do nothing;

alter table public.miami_carriers enable row level security;

drop policy if exists miami_carriers_read_authenticated on public.miami_carriers;
create policy miami_carriers_read_authenticated
  on public.miami_carriers
  for select
  to authenticated
  using (true);

drop policy if exists miami_carriers_admin_ops_insert on public.miami_carriers;
create policy miami_carriers_admin_ops_insert
  on public.miami_carriers
  for insert
  to authenticated
  with check (public.is_admin_or_operations());

drop policy if exists miami_carriers_admin_ops_update on public.miami_carriers;
create policy miami_carriers_admin_ops_update
  on public.miami_carriers
  for update
  to authenticated
  using (public.is_admin_or_operations())
  with check (public.is_admin_or_operations());

create table if not exists public.surcharge_rules (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  label text not null,

  service_product text not null,

  calculation_type text not null,

  rate_per_lbs numeric(12,4) default 0,
  rate_per_ft3 numeric(12,4) default 0,
  fixed_amount numeric(12,2) default 0,
  minimum_amount numeric(12,2) default 0,

  currency text default 'USD',

  is_active boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.surcharge_rules
drop constraint if exists surcharge_rules_calculation_type_check;

alter table public.surcharge_rules
add constraint surcharge_rules_calculation_type_check
check (
  calculation_type in (
    'max_formula',
    'fixed',
    'per_lbs',
    'per_ft3'
  )
);

alter table public.surcharge_rules
drop constraint if exists surcharge_rules_service_product_check;

alter table public.surcharge_rules
add constraint surcharge_rules_service_product_check
check (
  service_product in (
    'miami_lcl',
    'miami_air',
    'other_origin_fcl',
    'other_origin_lcl',
    'usa_ltl_ftl',
    'courier'
  )
);

create index if not exists idx_surcharge_rules_service_product
on public.surcharge_rules(service_product);

alter table public.surcharge_rules enable row level security;

create policy "surcharge_rules_select"
on public.surcharge_rules
for select
to authenticated
using (true);

create policy "surcharge_rules_insert"
on public.surcharge_rules
for insert
to authenticated
with check (true);

create policy "surcharge_rules_update"
on public.surcharge_rules
for update
to authenticated
using (true)
with check (true);
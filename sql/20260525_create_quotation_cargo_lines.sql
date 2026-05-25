create table if not exists public.quotation_cargo_lines (
  id uuid primary key default gen_random_uuid(),

  quotation_id uuid not null
    references public.quotations(id)
    on delete cascade,

  quantity numeric(12,2) not null default 1,
  package_type text not null,
  length numeric(12,2),
  width numeric(12,2),
  height numeric(12,2),
  dimension_unit text not null default 'in',
  weight_lbs numeric(12,2),

  ft3 numeric(12,4),
  cbm numeric(12,4),

  created_at timestamptz default now()
);

alter table public.quotation_cargo_lines enable row level security;

create policy "quotation_cargo_lines_select"
on public.quotation_cargo_lines
for select
to authenticated
using (true);

create policy "quotation_cargo_lines_insert"
on public.quotation_cargo_lines
for insert
to authenticated
with check (true);

create policy "quotation_cargo_lines_update"
on public.quotation_cargo_lines
for update
to authenticated
using (true)
with check (true);

create index if not exists idx_quotation_cargo_lines_quotation_id
on public.quotation_cargo_lines(quotation_id);
create table if not exists public.shipping_instruction_events (
  id uuid primary key default gen_random_uuid(),

  shipping_instruction_id uuid not null
    references public.shipping_instructions(id)
    on delete cascade,

  event_type text not null,
  event_date timestamptz not null default now(),
  location text,
  notes text,

  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.shipping_instruction_events enable row level security;

drop policy if exists "shipping_instruction_events_select_policy"
on public.shipping_instruction_events;

create policy "shipping_instruction_events_select_policy"
on public.shipping_instruction_events
for select
to authenticated
using (true);

drop policy if exists "shipping_instruction_events_insert_policy"
on public.shipping_instruction_events;

create policy "shipping_instruction_events_insert_policy"
on public.shipping_instruction_events
for insert
to authenticated
with check (created_by = auth.uid());

create index if not exists idx_shipping_instruction_events_si
on public.shipping_instruction_events (shipping_instruction_id);

create index if not exists idx_shipping_instruction_events_date
on public.shipping_instruction_events (event_date);
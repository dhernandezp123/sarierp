create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),

  shipping_instruction_id uuid not null
    references public.shipping_instructions(id)
    on delete cascade,

  booking_number text,
  carrier_booking text,
  master_bl text,
  house_bl text,
  carrier text,
  vessel_name text,
  voyage text,
  etd date,
  eta date,
  original_eta date,
  actual_etd date,
  actual_eta date,
  tracking_url text,
  shipment_status text default 'Booking Solicitado',
  estimated_transit_days integer,
  real_transit_days integer,
  free_days integer,
  remaining_free_days integer,
  freight_terms text,
  release_type text,
  hbl_freight_visibility text,
  printed_at_destination boolean default true,
  operational_comments text,

  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.booking_containers (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,

  container_type text,
  quantity integer,
  notes text,

  created_at timestamptz default now()
);

create index if not exists idx_bookings_shipping_instruction_id
on public.bookings (shipping_instruction_id);

create index if not exists idx_bookings_booking_number
on public.bookings (booking_number);

create index if not exists idx_bookings_shipment_status
on public.bookings (shipment_status);

create index if not exists idx_booking_containers_booking_id
on public.booking_containers (booking_id);

alter table public.bookings enable row level security;
alter table public.booking_containers enable row level security;

-- TODO: reforzar estas policies por roles cuando el flujo multi-booking salga del MVP.
drop policy if exists "bookings_select_policy"
on public.bookings;

create policy "bookings_select_policy"
on public.bookings
for select
to authenticated
using (true);

drop policy if exists "bookings_insert_policy"
on public.bookings;

create policy "bookings_insert_policy"
on public.bookings
for insert
to authenticated
with check (true);

drop policy if exists "bookings_update_policy"
on public.bookings;

create policy "bookings_update_policy"
on public.bookings
for update
to authenticated
using (true)
with check (true);

drop policy if exists "bookings_delete_policy"
on public.bookings;

create policy "bookings_delete_policy"
on public.bookings
for delete
to authenticated
using (true);

-- TODO: reforzar estas policies por roles cuando el flujo multi-booking salga del MVP.
drop policy if exists "booking_containers_select_policy"
on public.booking_containers;

create policy "booking_containers_select_policy"
on public.booking_containers
for select
to authenticated
using (true);

drop policy if exists "booking_containers_insert_policy"
on public.booking_containers;

create policy "booking_containers_insert_policy"
on public.booking_containers
for insert
to authenticated
with check (true);

drop policy if exists "booking_containers_update_policy"
on public.booking_containers;

create policy "booking_containers_update_policy"
on public.booking_containers
for update
to authenticated
using (true)
with check (true);

drop policy if exists "booking_containers_delete_policy"
on public.booking_containers;

create policy "booking_containers_delete_policy"
on public.booking_containers
for delete
to authenticated
using (true);

insert into public.bookings (
  shipping_instruction_id,
  booking_number,
  carrier_booking,
  master_bl,
  house_bl,
  carrier,
  vessel_name,
  voyage,
  etd,
  eta,
  original_eta,
  actual_etd,
  actual_eta,
  tracking_url,
  shipment_status,
  estimated_transit_days,
  real_transit_days,
  free_days,
  remaining_free_days,
  freight_terms,
  release_type,
  hbl_freight_visibility,
  printed_at_destination,
  operational_comments,
  created_by,
  created_at,
  updated_at
)
select
  si.id,
  si.booking_number,
  si.carrier_booking,
  si.master_bl,
  si.house_bl,
  si.carrier,
  si.vessel_name,
  si.voyage,
  si.etd,
  si.eta,
  si.original_eta,
  si.actual_etd,
  si.actual_eta,
  si.tracking_url,
  coalesce(si.shipment_status, 'Booking Solicitado'),
  si.estimated_transit_days,
  si.real_transit_days,
  case
    when nullif(si.free_days, '') ~ '^[0-9]+$' then si.free_days::integer
    else null
  end,
  si.remaining_free_days,
  si.freight_terms,
  si.release_type,
  si.hbl_freight_visibility,
  coalesce(si.printed_at_destination, true),
  si.operational_comments,
  null,
  coalesce(si.created_at, now()),
  now()
from public.shipping_instructions si
where (
    nullif(si.booking_number, '') is not null
    or nullif(si.carrier_booking, '') is not null
    or nullif(si.master_bl, '') is not null
    or nullif(si.house_bl, '') is not null
    or nullif(si.vessel_name, '') is not null
  )
  and not exists (
    select 1
    from public.bookings b
    where b.shipping_instruction_id = si.id
  );

notify pgrst, 'reload schema';

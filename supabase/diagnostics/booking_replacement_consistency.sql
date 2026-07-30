-- Fase 5B: relaciones incompletas, entre shipments diferentes y ciclos.

with recursive replacement_walk as (
  select
    b.id as origin_id,
    b.id,
    b.replaced_by_booking_id,
    array[b.id] as path,
    false as cycle
  from public.bookings b
  where b.replaced_by_booking_id is not null

  union all

  select
    walk.origin_id,
    next_booking.id,
    next_booking.replaced_by_booking_id,
    walk.path || next_booking.id,
    next_booking.id = any(walk.path)
  from replacement_walk walk
  join public.bookings next_booking
    on next_booking.id = walk.replaced_by_booking_id
  where not walk.cycle
),
findings as (
  select
    old_booking.id as booking_id,
    'REPLACED_WITHOUT_VALID_REPLACEMENT'::text as finding,
    old_booking.replaced_by_booking_id as related_booking_id
  from public.bookings old_booking
  left join public.bookings replacement
    on replacement.id = old_booking.replaced_by_booking_id
  where old_booking.booking_lifecycle_status = 'REPLACED'
    and (
      replacement.id is null
      or replacement.supersedes_booking_id is distinct from old_booking.id
      or replacement.booking_lifecycle_status <> 'ACTIVE'
    )

  union all

  select
    replacement.id,
    'REPLACEMENT_WITHOUT_VALID_PREVIOUS',
    replacement.supersedes_booking_id
  from public.bookings replacement
  left join public.bookings old_booking
    on old_booking.id = replacement.supersedes_booking_id
  where replacement.supersedes_booking_id is not null
    and (
      old_booking.id is null
      or old_booking.replaced_by_booking_id is distinct from replacement.id
      or old_booking.booking_lifecycle_status <> 'REPLACED'
    )

  union all

  select
    old_booking.id,
    'REPLACEMENT_CROSSES_SHIPMENTS',
    replacement.id
  from public.bookings old_booking
  join public.bookings replacement
    on replacement.id = old_booking.replaced_by_booking_id
  where replacement.shipment_id is distinct from old_booking.shipment_id

  union all

  select distinct
    walk.origin_id,
    'REPLACEMENT_CYCLE',
    walk.id
  from replacement_walk walk
  where walk.cycle
)
select *
from findings
order by finding, booking_id;

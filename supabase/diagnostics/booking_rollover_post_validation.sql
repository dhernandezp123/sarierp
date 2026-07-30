-- Fase 5B: validacion posterior de booking vigente, contenedores y documentos.

with findings as (
  select
    b.id as booking_id,
    b.shipment_id,
    'PRIMARY_POINTS_TO_HISTORICAL_BOOKING'::text as finding,
    si.primary_booking_id::text as detail
  from public.shipping_instructions si
  join public.bookings b on b.id = si.primary_booking_id
  where b.booking_lifecycle_status <> 'ACTIVE'

  union all

  select
    b.id,
    b.shipment_id,
    'CANCELLED_OR_REPLACED_USED_AS_ACTIVE',
    b.shipment_status
  from public.bookings b
  where b.booking_lifecycle_status <> 'ACTIVE'
    and b.shipment_status <> 'Cancelada'

  union all

  select distinct
    old_booking.id,
    old_booking.shipment_id,
    'PHYSICAL_CONTAINER_MOVED_TO_REPLACEMENT',
    bc.id::text
  from public.bookings old_booking
  join public.bookings replacement
    on replacement.supersedes_booking_id = old_booking.id
  join public.booking_containers bc
    on bc.booking_id = replacement.id
  join public.operational_events oe
    on oe.booking_container_id = bc.id
   and oe.booking_id = old_booking.id
   and oe.event_code in (
     'CONTAINER_PICKED_UP',
     'GATE_IN',
     'CONTAINER_LOADED',
     'ON_BOARD',
     'DELIVERED'
   )

  union all

  select
    old_booking.id,
    old_booking.shipment_id,
    'STRUCTURED_BL_COPIED_TO_REPLACEMENT',
    replacement.id::text
  from public.bookings old_booking
  join public.bookings replacement
    on replacement.supersedes_booking_id = old_booking.id
  join public.bills_of_lading old_bl
    on old_bl.booking_id = old_booking.id
  join public.bills_of_lading new_bl
    on new_bl.booking_id = replacement.id
   and new_bl.bl_type = old_bl.bl_type
   and new_bl.bl_number is not distinct from old_bl.bl_number
  where old_bl.bl_number is not null

  union all

  select
    old_booking.id,
    old_booking.shipment_id,
    'BOOKING_DOCUMENT_COPIED_TO_REPLACEMENT',
    replacement.id::text
  from public.bookings old_booking
  join public.bookings replacement
    on replacement.supersedes_booking_id = old_booking.id
  join public.booking_documents old_document
    on old_document.booking_id = old_booking.id
  join public.booking_documents new_document
    on new_document.booking_id = replacement.id
   and new_document.file_url = old_document.file_url

  union all

  select
    b.id,
    b.shipment_id,
    'ROLLOVER_AFTER_ACTUAL_ETD',
    r.id::text
  from public.bookings b
  join public.booking_schedule_revisions r
    on r.booking_id = b.id
   and r.revision_type = 'ROLLOVER_SAME_BOOKING'
  where b.actual_etd is not null
    and r.effective_at > b.actual_etd::timestamptz
)
select *
from findings
order by finding, shipment_id, booking_id;

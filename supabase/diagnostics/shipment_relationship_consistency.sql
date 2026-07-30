-- Fase 5A: relaciones canónicas y compatibilidad. Solo lectura.

select *
from (
  select
    'SI_WITHOUT_SHIPMENT' as issue,
    si.id as entity_id,
    null::uuid as related_id,
    si.routing_number as detail
  from public.shipping_instructions si
  left join public.shipments shipment
    on shipment.shipping_instruction_id = si.id
  where shipment.id is null

  union all

  select
    'SHIPMENT_WITHOUT_SI',
    shipment.id,
    shipment.shipping_instruction_id,
    shipment.shipment_number
  from public.shipments shipment
  left join public.shipping_instructions si
    on si.id = shipment.shipping_instruction_id
  where shipment.shipping_instruction_id is null
     or si.id is null

  union all

  select
    'BACKFILLED_ID_DOES_NOT_MATCH',
    shipment.id,
    shipment.shipping_instruction_id,
    shipment.shipment_number
  from public.shipments shipment
  where shipment.metadata ->> 'migration_source' = 'shipping_instructions'
    and shipment.id <> shipment.shipping_instruction_id

  union all

  select
    'BOOKING_WITHOUT_SHIPMENT',
    booking.id,
    booking.shipping_instruction_id,
    coalesce(booking.booking_number, booking.carrier_booking, 'Sin booking')
  from public.bookings booking
  where booking.shipment_id is null

  union all

  select
    'BOOKING_RELATIONSHIP_MISMATCH',
    booking.id,
    booking.shipment_id,
    coalesce(booking.booking_number, booking.carrier_booking, 'Sin booking')
  from public.bookings booking
  join public.shipments shipment on shipment.id = booking.shipment_id
  where shipment.shipping_instruction_id <> booking.shipping_instruction_id

  union all

  select
    'EVENT_WITHOUT_SHIPMENT',
    event.id,
    event.shipping_instruction_id,
    event.event_code
  from public.operational_events event
  where event.shipment_id is null

  union all

  select
    'EVENT_SHIPMENT_SI_MISMATCH',
    event.id,
    event.shipment_id,
    event.event_code
  from public.operational_events event
  join public.shipments shipment on shipment.id = event.shipment_id
  where shipment.shipping_instruction_id <> event.shipping_instruction_id

  union all

  select
    'EVENT_BOOKING_SHIPMENT_MISMATCH',
    event.id,
    event.booking_id,
    event.event_code
  from public.operational_events event
  join public.bookings booking on booking.id = event.booking_id
  where event.shipment_id is distinct from booking.shipment_id
) issues
order by issue, entity_id;

select
  shipping_instruction_id,
  count(*) as shipment_count,
  array_agg(id order by id) as shipment_ids
from public.shipments
where shipping_instruction_id is not null
group by shipping_instruction_id
having count(*) > 1;

select
  shipment_number,
  count(*) as shipment_count,
  array_agg(id order by id) as shipment_ids
from public.shipments
group by shipment_number
having count(*) > 1;

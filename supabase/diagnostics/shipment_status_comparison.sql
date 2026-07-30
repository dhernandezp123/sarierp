-- Fase 5A: compara el estado canónico derivado contra el estado legacy.
-- No actualiza ninguno de los dos estados.

select
  shipment.id as shipment_id,
  shipment.shipment_number,
  shipment.operational_status as stored_shipment_status,
  public.derive_shipment_operational_status(shipment.id) as derived_status,
  si.operational_status as legacy_operational_status,
  si.shipment_status as legacy_shipment_status,
  count(booking.id) as booking_count,
  count(booking.id) filter (
    where booking.shipment_status not in ('Cancelado', 'Cancelada')
  ) as active_booking_count,
  array_remove(array_agg(distinct booking.shipment_status), null) as booking_statuses
from public.shipments shipment
left join public.shipping_instructions si
  on si.id = shipment.shipping_instruction_id
left join public.bookings booking
  on booking.shipment_id = shipment.id
group by
  shipment.id,
  shipment.shipment_number,
  shipment.operational_status,
  si.operational_status,
  si.shipment_status
having shipment.operational_status
         is distinct from public.derive_shipment_operational_status(shipment.id)
    or si.operational_status
         is distinct from public.derive_shipment_operational_status(shipment.id)
order by shipment.shipment_number;

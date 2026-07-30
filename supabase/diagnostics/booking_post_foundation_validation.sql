-- Solo diagnostico posterior a la fundacion canonica.
select
  si.id,
  si.routing_number,
  si.primary_booking_id,
  count(b.id)::integer as booking_count,
  count(*) filter (where b.id = si.primary_booking_id)::integer as matching_primary_count,
  case
    when si.primary_booking_id is null and count(b.id) = 0 then 'OK_NO_BOOKING'
    when si.primary_booking_id is not null
         and count(*) filter (where b.id = si.primary_booking_id) = 1 then 'OK_PRIMARY'
    when si.primary_booking_id is null and count(b.id) = 1
         and coalesce(si.operational_status, si.shipment_status) not in ('Finalizado', 'Cancelada')
      then 'MISSING_SAFE_PRIMARY'
    when si.primary_booking_id is null and count(b.id) > 1 then 'MULTIPLE_REQUIRES_REVIEW'
    else 'INVALID'
  end as validation_status
from public.shipping_instructions si
left join public.bookings b on b.shipping_instruction_id = si.id
group by si.id, si.routing_number, si.primary_booking_id,
  si.operational_status, si.shipment_status
order by validation_status, si.routing_number;

select
  al.id,
  al.created_at,
  al.user_id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.metadata
from public.activity_logs al
where al.action in (
  'primary_booking_auto_selected',
  'primary_booking_changed',
  'booking_created',
  'booking_canonical_updated',
  'booking_status_updated'
)
order by al.created_at desc;

\pset pager off

-- Toda fila es un hallazgo.
select 'booking_marked_ready_with_blockers' as finding,
       booking.id as entity_id,
       public.evaluate_booking_readiness(booking.id) as details
from public.bookings booking
where booking.booking_lifecycle_status = 'ACTIVE'
  and booking.shipment_status in ('Listo para Embarque', 'Embarcado')
  and not coalesce(
    (
      public.evaluate_booking_readiness(booking.id) ->> 'ready'
    )::boolean,
    false
  )
union all
select 'post_departure_without_readiness_snapshot',
       booking.id,
       jsonb_build_object(
         'shipment_status', booking.shipment_status,
         'actual_etd', booking.actual_etd
       )
from public.bookings booking
where booking.created_at >= '2026-07-29 17:00:00+00'::timestamptz
  and (
    booking.actual_etd is not null
    or booking.shipment_status in (
      'Embarcado',
      'En Transito',
      'En Tránsito',
      'Arribado',
      'Finalizado'
    )
  )
  and not exists (
    select 1
    from public.booking_readiness_evaluations evaluation
    where evaluation.booking_id = booking.id
      and evaluation.trigger_status = 'Embarcado'
  )
union all
select 'expired_exception_still_satisfies_readiness',
       exception.id,
       jsonb_build_object(
         'booking_id', exception.booking_id,
         'expires_at', exception.expires_at
       )
from public.booking_readiness_exceptions exception
where exception.status = 'ACTIVE'
  and exception.expires_at <= clock_timestamp()
  and exists (
    select 1
    from jsonb_array_elements(
      public.evaluate_booking_readiness(exception.booking_id)
        -> 'authorized_exceptions'
    ) active_exception
    where active_exception ->> 'id' = exception.id::text
  )
union all
select 'active_booking_missing_template_requirement',
       booking.id,
       jsonb_build_object(
         'missing_requirement_code', template.requirement_code,
         'mode', public.booking_operational_mode(booking.id)
       )
from public.bookings booking
cross join lateral public.get_booking_readiness_template(booking.id) template
where booking.booking_lifecycle_status = 'ACTIVE'
  and not exists (
    select 1
    from public.booking_readiness_requirements requirement
    where requirement.booking_id = booking.id
      and requirement.requirement_code = template.requirement_code
      and requirement.booking_container_id is null
  )
order by finding, entity_id;

-- Cancelados o reemplazados nunca deben aparecer en alertas 5C.
select 'historical_booking_in_readiness_alerts' as finding,
       alert.booking_id,
       alert.alert_code
from public.get_booking_readiness_alerts() alert
join public.bookings booking on booking.id = alert.booking_id
where booking.booking_lifecycle_status <> 'ACTIVE'
order by alert.booking_id, alert.alert_code;

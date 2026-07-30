\pset pager off

-- Toda fila es un hallazgo.
select 'cutoff_booking_shipment_mismatch' as finding,
       cutoff.id as entity_id,
       jsonb_build_object(
         'cutoff_shipment_id', cutoff.shipment_id,
         'booking_shipment_id', booking.shipment_id
       ) as details
from public.booking_cutoffs cutoff
join public.bookings booking on booking.id = cutoff.booking_id
where cutoff.shipment_id is distinct from booking.shipment_id
union all
select 'cutoff_container_booking_mismatch',
       cutoff.id,
       jsonb_build_object(
         'cutoff_booking_id', cutoff.booking_id,
         'container_booking_id', container.booking_id
       )
from public.booking_cutoffs cutoff
join public.booking_containers container
  on container.id = cutoff.booking_container_id
where cutoff.booking_id is distinct from container.booking_id
union all
select 'cutoff_revision_booking_mismatch',
       cutoff.id,
       jsonb_build_object(
         'cutoff_booking_id', cutoff.booking_id,
         'revision_booking_id', revision.booking_id
       )
from public.booking_cutoffs cutoff
join public.booking_schedule_revisions revision
  on revision.id = cutoff.booking_schedule_revision_id
where cutoff.booking_id is distinct from revision.booking_id
union all
select 'cutoff_timezone_missing_or_invalid',
       cutoff.id,
       jsonb_build_object('timezone', cutoff.timezone)
from public.booking_cutoffs cutoff
where nullif(btrim(cutoff.timezone), '') is null
   or not exists (
     select 1
     from pg_timezone_names timezone_name
     where timezone_name.name = cutoff.timezone
   )
union all
select 'cutoff_completed_after_booking_cancel_without_explanation',
       cutoff.id,
       jsonb_build_object(
         'completed_at', cutoff.completed_at,
         'booking_cancelled_at', booking.cancelled_at
       )
from public.booking_cutoffs cutoff
join public.bookings booking on booking.id = cutoff.booking_id
where cutoff.status = 'COMPLETED'
  and booking.cancelled_at is not null
  and cutoff.completed_at > booking.cancelled_at
  and nullif(cutoff.metadata ->> 'administrative_exception_reason', '') is null
order by finding, entity_id;

select 'duplicate_current_cutoff' as finding,
       booking_id,
       booking_container_id,
       cutoff_code,
       count(*) as total
from public.booking_cutoffs
where superseded_by_cutoff_id is null
  and status <> 'CANCELLED'
group by booking_id, booking_container_id, cutoff_code
having count(*) > 1
order by booking_id, booking_container_id, cutoff_code;

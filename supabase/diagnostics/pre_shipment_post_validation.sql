\pset pager off

-- Contratos estructurales requeridos por 5C.
select required.object_type,
       required.object_name
from (
  values
    ('table', 'booking_cutoffs'),
    ('table', 'container_vgm_records'),
    ('table', 'booking_readiness_requirements'),
    ('table', 'booking_readiness_exceptions'),
    ('table', 'booking_readiness_evaluations'),
    ('function', 'evaluate_booking_readiness'),
    ('function', 'create_or_replace_booking_cutoff'),
    ('function', 'save_container_vgm_draft'),
    ('function', 'get_booking_readiness_alerts'),
    ('function', 'get_client_booking_readiness_v1'),
    ('function', 'get_booking_readiness_report_v1')
) required(object_type, object_name)
where (
  required.object_type = 'table'
  and to_regclass('public.' || required.object_name) is null
) or (
  required.object_type = 'function'
  and not exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = required.object_name
  )
)
order by required.object_type, required.object_name;

-- Toda fila es un hallazgo de integridad acumulada.
select 'active_booking_without_shipment' as finding,
       booking.id as entity_id
from public.bookings booking
where booking.booking_lifecycle_status = 'ACTIVE'
  and booking.shipment_id is null
union all
select 'replacement_inherited_cutoff',
       new_booking.id
from public.bookings new_booking
join public.bookings previous
  on previous.id = new_booking.supersedes_booking_id
join public.booking_cutoffs new_cutoff
  on new_cutoff.booking_id = new_booking.id
join public.booking_cutoffs old_cutoff
  on old_cutoff.booking_id = previous.id
 and old_cutoff.cutoff_code = new_cutoff.cutoff_code
 and old_cutoff.due_at = new_cutoff.due_at
where new_cutoff.created_at = old_cutoff.created_at
union all
select 'replacement_inherited_vgm',
       new_booking.id
from public.bookings new_booking
join public.bookings previous
  on previous.id = new_booking.supersedes_booking_id
join public.container_vgm_records new_vgm
  on new_vgm.booking_id = new_booking.id
join public.container_vgm_records old_vgm
  on old_vgm.booking_id = previous.id
 and old_vgm.booking_container_id = new_vgm.booking_container_id
where new_vgm.created_at = old_vgm.created_at
union all
select 'rollover_without_current_cutoffs_after_previous_cutoffs',
       booking.id
from public.bookings booking
where booking.booking_lifecycle_status = 'ACTIVE'
  and exists (
    select 1
    from public.booking_schedule_revisions revision
    where revision.booking_id = booking.id
      and revision.revision_type = 'ROLLOVER_SAME_BOOKING'
  )
  and exists (
    select 1
    from public.booking_cutoffs cutoff
    where cutoff.booking_id = booking.id
  )
  and not exists (
    select 1
    from public.booking_cutoffs current_cutoff
    where current_cutoff.booking_id = booking.id
      and current_cutoff.superseded_by_cutoff_id is null
      and current_cutoff.status <> 'CANCELLED'
  )
order by finding, entity_id;

-- El backfill ya aplicado no debe dejar duplicados.
select 'duplicate_readiness_requirement' as finding,
       requirement.booking_id,
       requirement.booking_container_id,
       requirement.requirement_code,
       count(*) as total
from public.booking_readiness_requirements requirement
group by
  requirement.booking_id,
  requirement.booking_container_id,
  requirement.requirement_code
having count(*) > 1
order by requirement.booking_id, requirement.requirement_code;

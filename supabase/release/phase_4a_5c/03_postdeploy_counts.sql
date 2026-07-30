\pset pager off
\timing on

-- Snapshot posterior. Comparar con 01_predeploy_counts.sql.
select metric, value
from (
  values
    ('quotations', (select count(*) from public.quotations)),
    ('shipping_instructions', (select count(*) from public.shipping_instructions)),
    ('shipments', (select count(*) from public.shipments)),
    ('bookings', (select count(*) from public.bookings)),
    ('booking_containers', (select count(*) from public.booking_containers)),
    ('booking_documents', (select count(*) from public.booking_documents)),
    ('bills_of_lading', (select count(*) from public.bills_of_lading)),
    ('operational_events', (select count(*) from public.operational_events)),
    ('booking_schedule_revisions',
      (select count(*) from public.booking_schedule_revisions)),
    ('booking_cutoffs', (select count(*) from public.booking_cutoffs)),
    ('container_vgm_records',
      (select count(*) from public.container_vgm_records)),
    ('booking_readiness_requirements',
      (select count(*) from public.booking_readiness_requirements)),
    ('booking_readiness_exceptions',
      (select count(*) from public.booking_readiness_exceptions)),
    ('booking_readiness_evaluations',
      (select count(*) from public.booking_readiness_evaluations))
) counts(metric, value)
order by metric;

select b.booking_lifecycle_status,
       b.shipment_status,
       count(*) as total
from public.bookings b
group by b.booking_lifecycle_status, b.shipment_status
order by b.booking_lifecycle_status, b.shipment_status;

select public.booking_operational_mode(b.id) as operational_mode,
       count(*) as bookings,
       count(*) filter (
         where (public.evaluate_booking_readiness(b.id) ->> 'ready')::boolean
       ) as ready,
       count(*) filter (
         where not (
           public.evaluate_booking_readiness(b.id) ->> 'ready'
         )::boolean
       ) as blocked
from public.bookings b
where b.booking_lifecycle_status = 'ACTIVE'
group by public.booking_operational_mode(b.id)
order by operational_mode;

select
  count(*) filter (where coalesce(bc.quantity, 0) = 1)
    as physical_container_rows,
  count(*) filter (where coalesce(bc.quantity, 0) <> 1)
    as aggregated_or_invalid_container_rows,
  count(*) filter (
    where exists (
      select 1
      from public.container_vgm_records vgm
      where vgm.booking_container_id = bc.id
        and vgm.status not in ('SUPERSEDED', 'REJECTED')
    )
  ) as containers_with_active_vgm
from public.booking_containers bc;

select
  count(*) as active_cutoffs,
  count(*) filter (where status = 'PENDING') as pending_cutoffs,
  count(*) filter (
    where status in ('PENDING', 'MISSED')
      and due_at <= clock_timestamp()
  ) as overdue_cutoffs
from public.booking_cutoffs
where superseded_by_cutoff_id is null
  and status <> 'CANCELLED';

select 'POSTDEPLOY_COUNTS_CAPTURED' as result;

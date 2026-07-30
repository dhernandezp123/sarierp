\pset pager off
\timing on

-- COUNTS_AFTER: comparar con phase_4a_5b_pre_snapshot.sql.
select *
from (
  select 'quotations'::text as metric, count(*)::bigint as value
  from public.quotations
  union all
  select 'shipping_instructions', count(*)
  from public.shipping_instructions
  union all
  select 'shipments', count(*)
  from public.shipments
  union all
  select 'bookings', count(*)
  from public.bookings
  union all
  select 'booking_containers', count(*)
  from public.booking_containers
  union all
  select 'booking_documents', count(*)
  from public.booking_documents
  union all
  select 'bills_of_lading', count(*)
  from public.bills_of_lading
  union all
  select 'operational_events', count(*)
  from public.operational_events
  union all
  select 'booking_schedule_revisions', count(*)
  from public.booking_schedule_revisions
) metrics
order by metric;

-- Toda fila devuelta por las siguientes consultas es un hallazgo.
select 'active_si_without_shipment' as finding, si.id::text as entity_id
from public.shipping_instructions si
left join public.shipments s on s.shipping_instruction_id = si.id
where si.deleted_at is null
  and s.id is null
union all
select 'booking_without_shipment', b.id::text
from public.bookings b
where b.shipment_id is null
union all
select 'booking_shipment_si_mismatch', b.id::text
from public.bookings b
join public.shipments s on s.id = b.shipment_id
where s.shipping_instruction_id is distinct from b.shipping_instruction_id
union all
select 'event_shipment_mismatch', oe.id::text
from public.operational_events oe
join public.bookings b on b.id = oe.booking_id
where oe.shipment_id is distinct from b.shipment_id
union all
select 'bl_cross_si', bl.id::text
from public.bills_of_lading bl
join public.bookings b on b.id = bl.booking_id
where bl.shipping_instruction_id is not null
  and bl.shipping_instruction_id is distinct from b.shipping_instruction_id
union all
select 'invalid_primary_booking', si.id::text
from public.shipping_instructions si
left join public.bookings b on b.id = si.primary_booking_id
where si.primary_booking_id is not null
  and (
    b.id is null
    or b.shipping_instruction_id is distinct from si.id
    or b.booking_lifecycle_status <> 'ACTIVE'
  )
order by finding, entity_id;

select 'duplicate_shipment_for_si' as finding,
       s.shipping_instruction_id::text as entity_id,
       count(*) as total
from public.shipments s
where s.shipping_instruction_id is not null
group by s.shipping_instruction_id
having count(*) > 1
union all
select 'duplicate_active_shipment_for_quotation',
       s.quotation_id::text,
       count(*)
from public.shipments s
where s.quotation_id is not null
  and s.closed_at is null
group by s.quotation_id
having count(*) > 1
union all
select 'duplicate_initial_revision',
       r.booking_id::text,
       count(*)
from public.booking_schedule_revisions r
where r.revision_type = 'INITIAL'
group by r.booking_id
having count(*) > 1
order by finding, entity_id;

select b.booking_lifecycle_status, count(*) as total
from public.bookings b
group by b.booking_lifecycle_status
order by b.booking_lifecycle_status;

select
  count(*) filter (
    where (b.etd is not null or b.eta is not null)
      and not exists (
        select 1
        from public.booking_schedule_revisions r
        where r.booking_id = b.id
          and r.revision_type = 'INITIAL'
      )
  ) as scheduled_without_initial_revision,
  count(*) filter (
    where b.original_etd is null and b.etd is not null
  ) as etd_without_original,
  count(*) filter (
    where b.original_eta is null and b.eta is not null
  ) as eta_without_original
from public.bookings b;

select s.operational_status,
       count(*) as stored_total,
       count(*) filter (
         where s.operational_status =
           public.derive_shipment_operational_status(s.id)
       ) as matching_derived_total
from public.shipments s
group by s.operational_status
order by s.operational_status;

select q.tipo_transporte,
       q.quote_type,
       q.service_product,
       count(distinct s.id) as shipments,
       count(distinct b.id) as bookings,
       count(*) filter (where b.booking_lifecycle_status = 'ACTIVE')
         as active_booking_rows
from public.shipments s
left join public.quotations q on q.id = s.quotation_id
left join public.bookings b on b.shipment_id = s.id
group by q.tipo_transporte, q.quote_type, q.service_product
order by shipments desc, q.tipo_transporte, q.quote_type, q.service_product;

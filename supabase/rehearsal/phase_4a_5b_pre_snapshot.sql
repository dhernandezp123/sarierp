\pset pager off
\timing on

-- Ejecutar sobre una copia representativa ANTES de 4A.
select clock_timestamp() as captured_at,
       current_database() as database_name,
       current_setting('server_version') as postgres_version;

select *
from (
  select 'quotations'::text as metric, count(*)::bigint as value
  from public.quotations
  union all
  select 'shipping_instructions', count(*)
  from public.shipping_instructions
  union all
  select 'shipping_instructions_active', count(*)
  from public.shipping_instructions
  where deleted_at is null
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
  select 'bookings_without_si', count(*)
  from public.bookings b
  left join public.shipping_instructions si
    on si.id = b.shipping_instruction_id
  where si.id is null
  union all
  select 'bl_without_booking', count(*)
  from public.bills_of_lading bl
  left join public.bookings b on b.id = bl.booking_id
  where b.id is null
  union all
  select 'si_with_multiple_bookings', count(*)
  from (
    select b.shipping_instruction_id
    from public.bookings b
    group by b.shipping_instruction_id
    having count(*) > 1
  ) duplicates
) metrics
order by metric;

select coalesce(nullif(btrim(shipment_status), ''), '<NULL>') as booking_status,
       count(*) as total
from public.bookings
group by 1
order by 1;

select coalesce(nullif(btrim(status), ''), '<NULL>') as si_status,
       count(*) as total
from public.shipping_instructions
group by 1
order by 1;

select coalesce(nullif(btrim(bl_type), ''), '<NULL>') as bl_type,
       coalesce(nullif(btrim(status), ''), '<NULL>') as bl_status,
       count(*) as total
from public.bills_of_lading
group by 1, 2
order by 1, 2;

select
  count(*) filter (where booking_number is null and carrier_booking is null)
    as bookings_without_external_number,
  count(*) filter (where etd is null and eta is null)
    as bookings_without_schedule,
  count(*) filter (where etd is not null or eta is not null)
    as bookings_with_partial_or_full_schedule,
  count(*) filter (where actual_etd is not null)
    as bookings_with_actual_etd,
  count(*) filter (where actual_eta is not null)
    as bookings_with_actual_eta
from public.bookings;

select q.tipo_transporte,
       q.quote_type,
       q.service_product,
       count(*) as total
from public.shipping_instructions si
left join public.quotations q on q.id = si.quotation_id
where si.deleted_at is null
group by q.tipo_transporte, q.quote_type, q.service_product
order by total desc, q.tipo_transporte, q.quote_type, q.service_product;

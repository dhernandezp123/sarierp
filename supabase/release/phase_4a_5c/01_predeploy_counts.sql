\pset pager off
\timing on

-- Snapshot de conteos anterior a 4A. Guardar la salida completa como evidencia.
create or replace function pg_temp.safe_count(p_relation text)
returns bigint
language plpgsql
as $$
declare
  v_result bigint;
begin
  if to_regclass(p_relation) is null then
    return null;
  end if;
  execute format('select count(*) from %s', p_relation) into v_result;
  return v_result;
end;
$$;

select metric, value
from (
  values
    ('quotations', pg_temp.safe_count('public.quotations')),
    ('shipping_instructions', pg_temp.safe_count('public.shipping_instructions')),
    ('bookings', pg_temp.safe_count('public.bookings')),
    ('booking_containers', pg_temp.safe_count('public.booking_containers')),
    ('booking_documents', pg_temp.safe_count('public.booking_documents')),
    ('bills_of_lading', pg_temp.safe_count('public.bills_of_lading')),
    ('operational_events', pg_temp.safe_count('public.operational_events')),
    ('activity_logs', pg_temp.safe_count('public.activity_logs'))
) counts(metric, value)
order by metric;

select coalesce(nullif(btrim(si.status), ''), '<NULL>') as si_status,
       coalesce(nullif(btrim(si.operational_status), ''), '<NULL>')
         as operational_status,
       count(*) as total
from public.shipping_instructions si
group by 1, 2
order by 1, 2;

select coalesce(nullif(btrim(b.shipment_status), ''), '<NULL>')
         as booking_status,
       count(*) as total
from public.bookings b
group by 1
order by 1;

select coalesce(nullif(btrim(bl.bl_type), ''), '<NULL>') as bl_type,
       coalesce(nullif(btrim(bl.status), ''), '<NULL>') as bl_status,
       count(*) as total
from public.bills_of_lading bl
group by 1, 2
order by 1, 2;

select
  count(*) filter (
    where b.booking_number is null and b.carrier_booking is null
  ) as bookings_without_external_number,
  count(*) filter (
    where b.etd is null and b.eta is null
  ) as bookings_without_schedule,
  count(*) filter (
    where b.etd is not null or b.eta is not null
  ) as bookings_with_schedule_evidence,
  count(*) filter (where b.actual_etd is not null)
    as bookings_with_actual_etd,
  count(*) filter (where b.actual_eta is not null)
    as bookings_with_actual_eta,
  count(*) filter (where coalesce(bc.total_rows, 0) > 0)
    as bookings_with_containers,
  count(*) filter (where coalesce(bc.multi_quantity_rows, 0) > 0)
    as bookings_with_aggregated_container_rows
from public.bookings b
left join (
  select booking_id,
         count(*) as total_rows,
         count(*) filter (where coalesce(quantity, 0) <> 1)
           as multi_quantity_rows
  from public.booking_containers
  group by booking_id
) bc on bc.booking_id = b.id;

select q.tipo_transporte,
       q.quote_type,
       q.service_product,
       count(distinct si.id) as shipping_instructions,
       count(distinct b.id) as bookings
from public.shipping_instructions si
left join public.quotations q on q.id = si.quotation_id
left join public.bookings b on b.shipping_instruction_id = si.id
where si.deleted_at is null
group by q.tipo_transporte, q.quote_type, q.service_product
order by shipping_instructions desc,
         q.tipo_transporte,
         q.quote_type,
         q.service_product;

select 'PREDEPLOY_COUNTS_CAPTURED' as result;

-- Fase 5A: control post-foundation. Todas las consultas son read-only.

select
  (select count(*) from public.shipping_instructions) as shipping_instruction_count,
  (select count(*) from public.shipments) as shipment_count,
  (select count(*) from public.bookings) as booking_count,
  (select count(*) from public.operational_events) as operational_event_count,
  (select count(*) from public.shipping_instructions si
    where not exists (
      select 1 from public.shipments shipment
      where shipment.shipping_instruction_id = si.id
    )) as si_without_shipment,
  (select count(*) from public.bookings where shipment_id is null)
    as bookings_without_shipment,
  (select count(*) from public.operational_events where shipment_id is null)
    as events_without_shipment;

select
  constraint_name,
  table_name,
  delete_rule
from information_schema.referential_constraints
join information_schema.table_constraints using (constraint_catalog, constraint_schema, constraint_name)
where constraint_schema = 'public'
  and constraint_name in (
    'shipments_shipping_instruction_id_fkey',
    'bookings_shipment_id_fkey',
    'operational_events_shipment_id_fkey'
  )
order by constraint_name;

select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'backfill_shipments_from_shipping_instructions',
    'create_shipment_from_quotation',
    'derive_shipment_operational_status',
    'get_shipment_context',
    'shipment_id_for_booking',
    'shipment_id_for_shipping_instruction'
  )
order by routine_name;

select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'shipments'
order by policyname;

select
  shipment.id,
  shipment.shipment_number,
  shipment.shipping_instruction_id,
  shipment.metadata ->> 'migration_classification' as migration_classification,
  shipment.metadata -> 'migration_notes' as migration_notes
from public.shipments shipment
where shipment.shipping_instruction_id is null
   or shipment.shipment_number is null
   or btrim(shipment.shipment_number) = ''
   or (
     shipment.metadata ->> 'migration_source' = 'shipping_instructions'
     and shipment.id <> shipment.shipping_instruction_id
   )
order by shipment.created_at, shipment.id;

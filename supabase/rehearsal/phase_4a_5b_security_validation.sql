\pset pager off
\timing on

select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege(
         'authenticated',
         p.oid,
         'EXECUTE'
       ) as authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_booking_for_shipping_instruction',
    'update_booking_canonical',
    'record_operational_event',
    'transition_booking_status',
    'get_booking_operational_timeline',
    'finalize_shipping_instruction_canonical',
    'create_shipment_from_quotation',
    'revise_booking_schedule',
    'rollover_booking_schedule',
    'replace_booking',
    'cancel_booking',
    'reopen_booking',
    'correct_booking_administrative',
    'get_client_shipments_v2',
    'get_operations_report_v2'
  )
order by p.proname, arguments;

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'shipments',
    'shipping_instructions',
    'bookings',
    'booking_containers',
    'booking_documents',
    'bills_of_lading',
    'operational_events',
    'booking_schedule_revisions'
  )
order by c.relname;

select schemaname,
       tablename,
       policyname,
       roles,
       cmd,
       qual,
       with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'shipments',
    'shipping_instructions',
    'bookings',
    'booking_containers',
    'booking_documents',
    'bills_of_lading',
    'operational_events',
    'booking_schedule_revisions'
  )
order by tablename, policyname;

-- Debe devolver cero: anon nunca ejecuta RPC operativos mutables.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_booking_for_shipping_instruction',
    'update_booking_canonical',
    'record_operational_event',
    'transition_booking_status',
    'finalize_shipping_instruction_canonical',
    'create_shipment_from_quotation',
    'revise_booking_schedule',
    'rollover_booking_schedule',
    'replace_booking',
    'cancel_booking',
    'reopen_booking',
    'correct_booking_administrative'
  )
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname, arguments;

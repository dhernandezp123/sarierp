\pset pager off
\timing on

-- Inventario de funciones públicas del release.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')
         as authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_booking_for_shipping_instruction',
    'update_booking_canonical',
    'set_primary_booking',
    'record_operational_event',
    'transition_booking_status',
    'finalize_shipping_instruction_canonical',
    'create_shipment_from_quotation',
    'revise_booking_schedule',
    'rollover_booking_schedule',
    'replace_booking',
    'cancel_booking',
    'reopen_booking',
    'correct_booking_administrative',
    'create_or_replace_booking_cutoff',
    'complete_booking_cutoff',
    'waive_booking_cutoff',
    'cancel_booking_cutoff',
    'save_container_vgm_draft',
    'verify_container_vgm',
    'submit_container_vgm',
    'accept_container_vgm',
    'reject_container_vgm',
    'supersede_container_vgm',
    'complete_booking_readiness_requirement',
    'authorize_booking_readiness_exception',
    'revoke_booking_readiness_exception',
    'evaluate_booking_readiness'
  )
order by p.proname, arguments;

-- Debe retornar cero: anon no puede ejecutar funciones operativas del release.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_booking_for_shipping_instruction',
    'update_booking_canonical',
    'set_primary_booking',
    'record_operational_event',
    'transition_booking_status',
    'finalize_shipping_instruction_canonical',
    'create_shipment_from_quotation',
    'revise_booking_schedule',
    'rollover_booking_schedule',
    'replace_booking',
    'cancel_booking',
    'reopen_booking',
    'correct_booking_administrative',
    'create_or_replace_booking_cutoff',
    'complete_booking_cutoff',
    'waive_booking_cutoff',
    'cancel_booking_cutoff',
    'save_container_vgm_draft',
    'verify_container_vgm',
    'submit_container_vgm',
    'accept_container_vgm',
    'reject_container_vgm',
    'supersede_container_vgm',
    'complete_booking_readiness_requirement',
    'authorize_booking_readiness_exception',
    'revoke_booking_readiness_exception'
  )
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname, arguments;

-- Debe retornar cero: las tablas 5C son de escritura por RPC, no directa.
select grantee,
       table_name,
       privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'booking_cutoffs',
    'container_vgm_records',
    'booking_readiness_requirements',
    'booking_readiness_exceptions',
    'booking_readiness_evaluations'
  )
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by grantee, table_name, privilege_type;

select 'SECURITY_GATE_COMPLETED' as result;

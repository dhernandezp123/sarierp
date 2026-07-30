\pset pager off
\timing on

-- Release gate de solo lectura. Ejecutar sobre una copia representativa
-- restaurada ANTES de aplicar 4A. Cualquier excepción es NO-GO.
select clock_timestamp() as captured_at,
       current_database() as database_name,
       current_setting('server_version') as postgres_version,
       current_user as executed_by;

select version
from supabase_migrations.schema_migrations
order by version;

do $$
declare
  v_last_version text;
  v_release_applied integer;
  v_collision_count integer;
begin
  select max(version)
  into v_last_version
  from supabase_migrations.schema_migrations;

  if v_last_version is distinct from '20260728130000' then
    raise exception
      'PREDEPLOY_NO_GO: baseline esperado 20260728130000, encontrado %',
      coalesce(v_last_version, '<NULL>');
  end if;

  select count(*)
  into v_release_applied
  from supabase_migrations.schema_migrations
  where version in (
    '20260729120000',
    '20260729130000',
    '20260729140000',
    '20260729150000',
    '20260729160000',
    '20260729170000'
  );

  if v_release_applied <> 0 then
    raise exception
      'PREDEPLOY_NO_GO: una o mas migraciones 4A-5C ya figuran aplicadas';
  end if;

  select count(*)
  into v_collision_count
  from (
    select 'shipping_instructions.primary_booking_id'
    where exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'shipping_instructions'
        and column_name = 'primary_booking_id'
    )
    union all
    select 'shipments'
    where to_regclass('public.shipments') is not null
    union all
    select 'bookings.shipment_id'
    where exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bookings'
        and column_name = 'shipment_id'
    )
    union all
    select 'booking_schedule_revisions'
    where to_regclass('public.booking_schedule_revisions') is not null
    union all
    select 'booking_cutoffs'
    where to_regclass('public.booking_cutoffs') is not null
    union all
    select 'container_vgm_records'
    where to_regclass('public.container_vgm_records') is not null
    union all
    select 'booking_readiness_requirements'
    where to_regclass('public.booking_readiness_requirements') is not null
    union all
    select 'booking_readiness_exceptions'
    where to_regclass('public.booking_readiness_exceptions') is not null
    union all
    select 'booking_readiness_evaluations'
    where to_regclass('public.booking_readiness_evaluations') is not null
  ) collisions;

  if v_collision_count <> 0 then
    raise exception
      'PREDEPLOY_NO_GO: objetos 4A-5C existen sin historial de migracion; reconciliar SQL manual';
  end if;
end;
$$;

-- Toda fila es NO-GO salvo clasificación y aprobación explícita.
select 'booking_without_shipping_instruction' as finding,
       b.id::text as entity_id,
       jsonb_build_object(
         'shipping_instruction_id', b.shipping_instruction_id
       ) as details
from public.bookings b
left join public.shipping_instructions si
  on si.id = b.shipping_instruction_id
where si.id is null
union all
select 'bill_of_lading_without_booking',
       bl.id::text,
       jsonb_build_object('booking_id', bl.booking_id)
from public.bills_of_lading bl
left join public.bookings b on b.id = bl.booking_id
where bl.booking_id is not null
  and b.id is null
union all
select 'booking_container_without_booking',
       bc.id::text,
       jsonb_build_object('booking_id', bc.booking_id)
from public.booking_containers bc
left join public.bookings b on b.id = bc.booking_id
where b.id is null
union all
select 'booking_document_without_booking',
       bd.id::text,
       jsonb_build_object('booking_id', bd.booking_id)
from public.booking_documents bd
left join public.bookings b on b.id = bd.booking_id
where b.id is null
order by finding, entity_id;

select 'PREDEPLOY_GATE_OK' as result;

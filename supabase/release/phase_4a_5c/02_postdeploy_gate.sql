\pset pager off
\timing on

-- Gate estructural posterior a 5C. Cualquier excepción es NO-GO.
do $$
declare
  v_release_count integer;
  v_missing_objects integer;
begin
  select count(*)
  into v_release_count
  from supabase_migrations.schema_migrations
  where version in (
    '20260729120000',
    '20260729130000',
    '20260729140000',
    '20260729150000',
    '20260729160000',
    '20260729170000'
  );

  if v_release_count <> 6 then
    raise exception
      'POSTDEPLOY_NO_GO: se esperaban 6 migraciones 4A-5C, encontradas %',
      v_release_count;
  end if;

  select count(*)
  into v_missing_objects
  from (
    values
      ('public.shipments'),
      ('public.operational_events'),
      ('public.booking_schedule_revisions'),
      ('public.booking_cutoffs'),
      ('public.container_vgm_records'),
      ('public.booking_readiness_requirements'),
      ('public.booking_readiness_exceptions'),
      ('public.booking_readiness_evaluations')
  ) expected(relation_name)
  where to_regclass(expected.relation_name) is null;

  if v_missing_objects <> 0 then
    raise exception
      'POSTDEPLOY_NO_GO: faltan % relaciones canónicas',
      v_missing_objects;
  end if;
end;
$$;

-- Toda fila devuelta es NO-GO.
select 'missing_required_column' as finding,
       expected.table_name || '.' || expected.column_name as entity_id
from (
  values
    ('shipping_instructions', 'primary_booking_id'),
    ('bookings', 'shipment_id'),
    ('bookings', 'booking_lifecycle_status'),
    ('bookings', 'original_etd'),
    ('bookings', 'original_eta'),
    ('bookings', 'supersedes_booking_id'),
    ('bookings', 'replaced_by_booking_id'),
    ('operational_events', 'shipment_id')
) expected(table_name, column_name)
where not exists (
  select 1
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = expected.table_name
    and c.column_name = expected.column_name
)
union all
select 'rls_not_enabled', expected.table_name
from (
  values
    ('shipments'),
    ('operational_events'),
    ('booking_schedule_revisions'),
    ('booking_cutoffs'),
    ('container_vgm_records'),
    ('booking_readiness_requirements'),
    ('booking_readiness_exceptions'),
    ('booking_readiness_evaluations')
) expected(table_name)
left join pg_class c
  on c.oid = to_regclass('public.' || expected.table_name)
where not coalesce(c.relrowsecurity, false)
union all
select 'invalid_index', indexrelid::regclass::text
from pg_index
where indrelid in (
  'public.shipments'::regclass,
  'public.operational_events'::regclass,
  'public.booking_schedule_revisions'::regclass,
  'public.booking_cutoffs'::regclass,
  'public.container_vgm_records'::regclass,
  'public.booking_readiness_requirements'::regclass,
  'public.booking_readiness_exceptions'::regclass,
  'public.booking_readiness_evaluations'::regclass
)
  and not indisvalid
order by finding, entity_id;

-- Toda fila devuelta es NO-GO.
select conrelid::regclass::text as table_name,
       conname as constraint_name
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.shipments'::regclass,
    'public.bookings'::regclass,
    'public.operational_events'::regclass,
    'public.booking_schedule_revisions'::regclass,
    'public.booking_cutoffs'::regclass,
    'public.container_vgm_records'::regclass,
    'public.booking_readiness_requirements'::regclass,
    'public.booking_readiness_exceptions'::regclass,
    'public.booking_readiness_evaluations'::regclass
  )
  and not convalidated
order by table_name, constraint_name;

select 'POSTDEPLOY_GATE_OK' as result;

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (select max(version) = '20260921190000'
   from supabase_migrations.schema_migrations),
  'El upgrade debe alcanzar la última migración multiempresa'
);

do $$
declare
  expected record;
  actual_count bigint;
begin
  for expected in
    select table_name, row_count
    from phase8_certification.pre_upgrade_counts
    order by table_name
  loop
    execute format('select count(*) from public.%I', expected.table_name)
      into actual_count;

    if actual_count <> expected.row_count then
      raise exception 'ASSERTION FAILED: conteo de % cambió de % a %',
        expected.table_name, expected.row_count, actual_count;
    end if;
  end loop;
end;
$$;

do $$
declare
  tenant_table record;
  null_count bigint;
  foreign_count bigint;
begin
  for tenant_table in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
    order by table_name
  loop
    execute format(
      'select count(*) filter (where tenant_id is null), '
      || 'count(*) filter (where tenant_id is distinct from %L::uuid) '
      || 'from public.%I',
      '00000000-0000-4000-8000-000000000001',
      tenant_table.table_name
    ) into null_count, foreign_count;

    if null_count > 0 or foreign_count > 0 then
      raise exception
        'ASSERTION FAILED: tenant inválido en %, nulos %, ajenos %',
        tenant_table.table_name, null_count, foreign_count;
    end if;
  end loop;
end;
$$;

select pg_temp.assert_true(
  exists (
    select 1 from public.tenants
    where id = '00000000-0000-4000-8000-000000000001'
      and slug = 'sari'
      and status = 'Activo'
  )
  and exists (
    select 1 from public.tenant_domains
    where tenant_id = '00000000-0000-4000-8000-000000000001'
      and hostname = 'sari.forwarders.app'
      and is_primary is true
  )
  and exists (
    select 1 from public.company_settings
    where tenant_id = '00000000-0000-4000-8000-000000000001'
  ),
  'El bootstrap Sari debe conservar tenant, dominio principal y configuración'
);

select pg_temp.assert_true(
  (select tenant_id = '00000000-0000-4000-8000-000000000001'
   from public.quotations
   where id = '00000000-0000-4000-8000-000000000982')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001'
   from public.shipping_instructions
   where id = '00000000-0000-4000-8000-000000000986')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001'
   from public.shipments
   where id = '00000000-0000-4000-8000-000000000986')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001'
   from public.bookings
   where id = '00000000-0000-4000-8000-000000000988')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001'
   from public.invoices
   where id = '00000000-0000-4000-8000-000000000992')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001'
   from public.support_tickets
   where id = '00000000-0000-4000-8000-000000000994'),
  'El expediente ficticio completo debe pertenecer a Sari después del backfill'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.bookings booking
    join public.shipments shipment on shipment.id = booking.shipment_id
    join public.shipping_instructions instruction
      on instruction.id = booking.shipping_instruction_id
    join public.quotations quotation on quotation.id = instruction.quotation_id
    join public.invoices invoice on invoice.quotation_id = quotation.id
    where booking.id = '00000000-0000-4000-8000-000000000988'
      and booking.tenant_id = shipment.tenant_id
      and shipment.tenant_id = instruction.tenant_id
      and instruction.tenant_id = quotation.tenant_id
      and quotation.tenant_id = invoice.tenant_id
  ),
  'Las relaciones Cotización -> Shipment -> SI -> Booking -> Facturación deben conservarse'
);

\echo 'phase8_upgrade_verify.sql: OK'

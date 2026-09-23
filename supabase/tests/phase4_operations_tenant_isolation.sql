\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_denied(command text, message text)
returns void language plpgsql as $$
declare
  was_denied boolean := false;
begin
  begin
    execute command;
  exception when others then
    was_denied := true;
  end;

  if not was_denied then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 27
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
      and is_nullable = 'NO'
      and table_name in (
        'shipments', 'operational_events', 'shipping_instructions',
        'shipping_instruction_events', 'bookings', 'booking_containers',
        'booking_cutoffs', 'booking_documents',
        'booking_readiness_evaluations', 'booking_readiness_exceptions',
        'booking_readiness_requirements', 'booking_schedule_revisions',
        'bills_of_lading', 'bl_amendments', 'bl_containers',
        'bl_draft_sends', 'bl_validation_exceptions',
        'container_vgm_records', 'garantias_navieras', 'miami_packages',
        'miami_package_events', 'miami_package_documents',
        'miami_pre_alerts', 'miami_incidencias', 'miami_manifests',
        'miami_shipments', 'miami_shipment_packages'
      )
  ) and (
    select count(*) = 27
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and trigger_row.tgname = 'tenant_guard'
      and not trigger_row.tgisinternal
      and table_row.relname in (
        'shipments', 'operational_events', 'shipping_instructions',
        'shipping_instruction_events', 'bookings', 'booking_containers',
        'booking_cutoffs', 'booking_documents',
        'booking_readiness_evaluations', 'booking_readiness_exceptions',
        'booking_readiness_requirements', 'booking_schedule_revisions',
        'bills_of_lading', 'bl_amendments', 'bl_containers',
        'bl_draft_sends', 'bl_validation_exceptions',
        'container_vgm_records', 'garantias_navieras', 'miami_packages',
        'miami_package_events', 'miami_package_documents',
        'miami_pre_alerts', 'miami_incidencias', 'miami_manifests',
        'miami_shipments', 'miami_shipment_packages'
      )
  ) and (
    select count(*) = 27 and bool_and(permissive = 'RESTRICTIVE')
    from pg_policies
    where schemaname = 'public'
      and policyname = 'tenant_isolation_guard'
      and tablename in (
        'shipments', 'operational_events', 'shipping_instructions',
        'shipping_instruction_events', 'bookings', 'booking_containers',
        'booking_cutoffs', 'booking_documents',
        'booking_readiness_evaluations', 'booking_readiness_exceptions',
        'booking_readiness_requirements', 'booking_schedule_revisions',
        'bills_of_lading', 'bl_amendments', 'bl_containers',
        'bl_draft_sends', 'bl_validation_exceptions',
        'container_vgm_records', 'garantias_navieras', 'miami_packages',
        'miami_package_events', 'miami_package_documents',
        'miami_pre_alerts', 'miami_incidencias', 'miami_manifests',
        'miami_shipments', 'miami_shipment_packages'
      )
  ),
  'Las 27 tablas de Fase 4 deben exigir tenant, guard de fila y RLS restrictivo'
);

insert into public.tenants (id, slug, name, status)
values ('00000000-0000-4000-8000-000000000014', 'mya-phase4', 'MYA Phase 4', 'Activo');

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000941', 'authenticated', 'authenticated', 'sari-sales-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000942', 'authenticated', 'authenticated', 'mya-sales-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000943', 'authenticated', 'authenticated', 'sari-ops-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000944', 'authenticated', 'authenticated', 'mya-ops-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000945', 'authenticated', 'authenticated', 'sari-client-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000946', 'authenticated', 'authenticated', 'mya-client-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000947', 'authenticated', 'authenticated', 'platform-p4@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000948', 'authenticated', 'authenticated', 'sari-accounting-p4@test.local', '{}'::jsonb);

update public.profiles
set rol = case
    when id in (
      '00000000-0000-0000-0000-000000000941',
      '00000000-0000-0000-0000-000000000942'
    ) then 'Ventas'::public.user_role
    when id in (
      '00000000-0000-0000-0000-000000000943',
      '00000000-0000-0000-0000-000000000944'
    ) then 'Operaciones'::public.user_role
    when id in (
      '00000000-0000-0000-0000-000000000945',
      '00000000-0000-0000-0000-000000000946'
    ) then 'Cliente'::public.user_role
    when id = '00000000-0000-0000-0000-000000000948'
      then 'Contabilidad'::public.user_role
    else 'Admin'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true,
  tenant_id = case
    when id in (
      '00000000-0000-0000-0000-000000000941',
      '00000000-0000-0000-0000-000000000943',
      '00000000-0000-0000-0000-000000000945',
      '00000000-0000-0000-0000-000000000948'
    ) then '00000000-0000-4000-8000-000000000001'::uuid
    when id in (
      '00000000-0000-0000-0000-000000000942',
      '00000000-0000-0000-0000-000000000944',
      '00000000-0000-0000-0000-000000000946'
    ) then '00000000-0000-4000-8000-000000000014'::uuid
    else null
  end,
  is_platform_admin = id = '00000000-0000-0000-0000-000000000947'
where id in (
  '00000000-0000-0000-0000-000000000941',
  '00000000-0000-0000-0000-000000000942',
  '00000000-0000-0000-0000-000000000943',
  '00000000-0000-0000-0000-000000000944',
  '00000000-0000-0000-0000-000000000945',
  '00000000-0000-0000-0000-000000000946',
  '00000000-0000-0000-0000-000000000947',
  '00000000-0000-0000-0000-000000000948'
);

-- Padres comerciales minimos para crear dos expedientes canonicos.
insert into public.clientes (id, tenant_id, nombre, vendedor_asignado)
values
  (
    '00000000-0000-4000-8000-000000000341',
    '00000000-0000-4000-8000-000000000001',
    'Cliente Sari P4',
    '00000000-0000-0000-0000-000000000941'
  ),
  (
    '00000000-0000-4000-8000-000000000342',
    '00000000-0000-4000-8000-000000000014',
    'Cliente MYA P4',
    '00000000-0000-0000-0000-000000000942'
  );

insert into public.quotations (
  id, tenant_id, cliente_id, created_by, status, service_product,
  origen, destino
)
values
  (
    '00000000-0000-4000-8000-000000000441',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000341',
    '00000000-0000-0000-0000-000000000941',
    'Ganada', 'miami_lcl', 'Miami', 'San Pedro Sula'
  ),
  (
    '00000000-0000-4000-8000-000000000442',
    '00000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000342',
    '00000000-0000-0000-0000-000000000942',
    'Ganada', 'miami_lcl', 'Miami', 'Tegucigalpa'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000941","role":"authenticated"}',
  true
);
select public.create_shipment_from_quotation(
  '00000000-0000-4000-8000-000000000441',
  'phase4-test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000942","role":"authenticated"}',
  true
);
select public.create_shipment_from_quotation(
  '00000000-0000-4000-8000-000000000442',
  'phase4-test'
);

-- Operaciones lleva ambos expedientes al booking mediante la RPC canonica.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000943","role":"authenticated"}',
  true
);
update public.shipping_instructions
set operational_status = 'Listo para Booking'
where quotation_id = '00000000-0000-4000-8000-000000000441';
select * from public.create_booking_for_shipping_instruction(
  (select id from public.shipping_instructions where quotation_id = '00000000-0000-4000-8000-000000000441')
);
select set_config(
  'app.phase4_sari_si_id',
  (select id::text from public.shipping_instructions where quotation_id = '00000000-0000-4000-8000-000000000441'),
  true
);

insert into public.booking_containers (id, booking_id, container_type, quantity)
values (
  '00000000-0000-4000-8000-000000000541',
  (select id from public.bookings limit 1),
  '40HC',
  1
);
insert into public.booking_documents (
  id, booking_id, document_type, file_name, file_url, uploaded_by
)
values (
  '00000000-0000-4000-8000-000000000641',
  (select id from public.bookings limit 1),
  'Booking Confirmation',
  'booking-sari.pdf',
  'private/booking-sari.pdf',
  '00000000-0000-0000-0000-000000000943'
);
select * from public.record_operational_event(
  (
    select b.shipping_instruction_id
    from public.bookings b
    limit 1
  ),
  (
    select b.id
    from public.bookings b
    limit 1
  ),
  null,
  'OPERATIONAL_NOTE',
  'Prueba Fase 4',
  now(),
  null,
  'Evento operativo aislado por tenant',
  '{}'::jsonb
);
insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, created_by
)
select
  '00000000-0000-4000-8000-000000000841',
  b.id,
  b.shipping_instruction_id,
  'MBL',
  '00000000-0000-0000-0000-000000000943'
from public.bookings b
limit 1;
insert into public.bl_containers (bl_id, container_type, quantity)
values ('00000000-0000-4000-8000-000000000841', '40HC', 1);
insert into public.garantias_navieras (
  booking_id, naviera, monto, fecha_deposito, created_by
)
values (
  (select id from public.bookings limit 1),
  'Naviera Sari',
  500,
  current_date,
  '00000000-0000-0000-0000-000000000943'
);

select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.shipments)
  and (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.shipping_instructions)
  and (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.bookings)
  and (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.bills_of_lading),
  'Shipment, Shipping Instruction, booking y BL deben heredar el tenant Sari'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.booking_containers)
  and (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.booking_documents)
  and (select count(*) >= 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.operational_events)
  and (select count(*) = 1 and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001') from public.garantias_navieras),
  'Documentos, eventos, contenedores y garantias deben heredar el tenant Sari'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.booking_schedule_revisions
    where tenant_id <> '00000000-0000-4000-8000-000000000001'
  ) and not exists (
    select 1 from public.booking_readiness_requirements
    where tenant_id <> '00000000-0000-4000-8000-000000000001'
  ),
  'Revisiones y readiness generados automaticamente no deben cruzar tenants'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000944","role":"authenticated"}',
  true
);
update public.shipping_instructions
set operational_status = 'Listo para Booking'
where quotation_id = '00000000-0000-4000-8000-000000000442';
select * from public.create_booking_for_shipping_instruction(
  (select id from public.shipping_instructions where quotation_id = '00000000-0000-4000-8000-000000000442')
);
select set_config(
  'app.phase4_mya_si_id',
  (select id::text from public.shipping_instructions where quotation_id = '00000000-0000-4000-8000-000000000442'),
  true
);
select set_config(
  'app.phase4_mya_booking_id',
  (select id::text from public.bookings limit 1),
  true
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.shipments)
  and (select count(*) = 1 from public.shipping_instructions)
  and (select count(*) = 1 from public.bookings),
  'Operaciones MYA solo debe leer su propio expediente'
);
select pg_temp.expect_denied(
  $$select * from public.create_booking_for_shipping_instruction(current_setting('app.phase4_sari_si_id')::uuid)$$,
  'La RPC de booking no debe operar una Shipping Instruction Sari desde MYA'
);

-- Miami: numeros iguales entre tenants, vinculacion atomica y referencias cerradas.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000943","role":"authenticated"}',
  true
);
insert into public.miami_manifests (id, manifest_number, received_by)
values (
  '00000000-0000-4000-8000-000000000941',
  'MANIFEST-COMPARTIDO',
  '00000000-0000-0000-0000-000000000943'
);
insert into public.miami_packages (
  id, tracking_number, warehouse_number, cliente_id, manifest_id, received_by
)
values
  (
    '00000000-0000-4000-8000-000000000951',
    'TRACK-SARI-P4',
    'WH-COMPARTIDO',
    '00000000-0000-4000-8000-000000000341',
    '00000000-0000-4000-8000-000000000941',
    '00000000-0000-0000-0000-000000000943'
  ),
  (
    '00000000-0000-4000-8000-000000000953',
    'TRACK-SARI-CROSS-P4',
    'WH-SARI-CROSS-P4',
    '00000000-0000-4000-8000-000000000341',
    '00000000-0000-4000-8000-000000000941',
    '00000000-0000-0000-0000-000000000943'
  );
select * from public.create_miami_shipment(
  array['00000000-0000-4000-8000-000000000951'::uuid],
  'Maritimo',
  'Prueba Sari Fase 4'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000944","role":"authenticated"}',
  true
);
insert into public.miami_manifests (id, manifest_number, received_by)
values (
  '00000000-0000-4000-8000-000000000942',
  'MANIFEST-COMPARTIDO',
  '00000000-0000-0000-0000-000000000944'
);
insert into public.miami_manifests (id, manifest_number, received_by)
values (
  '00000000-0000-4000-8000-000000000943',
  'MANIFEST-MYA-VACIO',
  '00000000-0000-0000-0000-000000000944'
);
insert into public.miami_packages (
  id, tracking_number, warehouse_number, cliente_id, manifest_id, received_by
)
values (
  '00000000-0000-4000-8000-000000000952',
  'TRACK-MYA-P4',
  'WH-COMPARTIDO',
  '00000000-0000-4000-8000-000000000342',
  '00000000-0000-4000-8000-000000000942',
  '00000000-0000-0000-0000-000000000944'
);
select pg_temp.expect_denied(
  $$insert into public.miami_manifests (manifest_number, received_by) values ('MANIFEST-COMPARTIDO', '00000000-0000-0000-0000-000000000944')$$,
  'El numero de manifiesto debe seguir siendo unico dentro de MYA'
);
select * from public.create_miami_shipment(
  array['00000000-0000-4000-8000-000000000952'::uuid],
  'Aereo',
  'Prueba MYA Fase 4'
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.miami_packages)
  and (select count(*) = 1 from public.miami_shipments)
  and (select count(*) = 1 from public.miami_shipment_packages)
  and (select count(*) >= 1 from public.miami_package_events),
  'Operaciones MYA solo debe leer su operacion Miami'
);

select pg_temp.expect_denied(
  $$insert into public.miami_packages (tracking_number, cliente_id, received_by) values ('TRACK-CRUZADO', '00000000-0000-4000-8000-000000000341', '00000000-0000-0000-0000-000000000944')$$,
  'MYA no debe asociar paquetes a un cliente Sari'
);
select pg_temp.expect_denied(
  $$select * from public.create_miami_shipment(array['00000000-0000-4000-8000-000000000953'::uuid], 'Aereo', 'Cruce')$$,
  'La RPC Miami no debe despachar paquetes Sari desde MYA'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000943","role":"authenticated"}',
  true
);
select pg_temp.expect_denied(
  $$select * from public.delete_miami_manifest('00000000-0000-4000-8000-000000000943', 'Prueba cross tenant Fase 4')$$,
  'Una RPC SECURITY DEFINER no debe borrar manifiestos MYA desde Sari'
);
select pg_temp.expect_denied(
  $$insert into public.booking_containers (booking_id, container_type, quantity) values (current_setting('app.phase4_mya_booking_id')::uuid, '20GP', 1)$$,
  'Sari no debe agregar contenedores a un booking MYA'
);
select pg_temp.assert_true(
  not public.can_select_booking((
    select current_setting('app.phase4_mya_booking_id')::uuid
  )),
  'El helper SECURITY DEFINER de booking debe fallar cerrado entre tenants'
);
select pg_temp.assert_true(
  public.booking_operational_mode((
    select current_setting('app.phase4_mya_booking_id')::uuid
  )) is null,
  'La modalidad operativa no debe revelar bookings de otro tenant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000948","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(quotation_id = '00000000-0000-4000-8000-000000000441')
    from public.get_billing_work_queue()
  ),
  'La cola SECURITY DEFINER de facturacion debe limitarse al tenant Sari'
);

-- Portal Cliente conserva acceso propio y no obtiene filas de la otra empresa.
reset role;
select set_config('request.jwt.claims', '{}'::text, true);
update public.profiles
set cliente_id = case id
    when '00000000-0000-0000-0000-000000000945' then '00000000-0000-4000-8000-000000000341'::uuid
    when '00000000-0000-0000-0000-000000000946' then '00000000-0000-4000-8000-000000000342'::uuid
  end
where id in (
  '00000000-0000-0000-0000-000000000945',
  '00000000-0000-0000-0000-000000000946'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000945","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.miami_packages)
  and (select count(*) >= 1 from public.miami_package_events),
  'El Cliente Sari debe ver solo su paquete y sus eventos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000947","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.shipments)
  and (select count(*) = 0 from public.bookings)
  and (select count(*) = 0 from public.miami_packages),
  'El administrador exclusivo de plataforma no debe asumir operaciones de tenants'
);
select pg_temp.expect_denied(
  $$insert into public.miami_manifests (manifest_number) values ('SIN-TENANT')$$,
  'Un perfil sin tenant no debe crear operaciones'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_denied(
  $$select * from public.shipments$$,
  'anon no debe leer shipments'
);
select pg_temp.expect_denied(
  $$select * from public.miami_packages$$,
  'anon no debe leer paquetes Miami'
);

reset role;
rollback;

\echo 'phase4_operations_tenant_isolation.sql: OK'

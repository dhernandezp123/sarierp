\set ON_ERROR_STOP on
begin;
\o /dev/null

-- UX-OPS-04: booking en 5 acciones, VGM en lote y aprobacion directa de HBL.

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(command text, message text, expected_state text default null)
returns void language plpgsql as $$
declare
  failed boolean := false;
begin
  begin
    execute command;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then
      raise exception 'Unexpected SQLSTATE % (expected %): %', sqlstate, expected_state, sqlerrm;
    end if;
    failed := true;
  end;
  if not failed then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.booking_version(p_booking_id uuid)
returns timestamptz language sql as $$
  select updated_at from public.bookings where id = p_booking_id
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('5f000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ops-flow@test.local', '{}'::jsonb),
  ('5f000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sales-flow@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '5f000000-0000-0000-0000-000000000001' then 'Operaciones'::public.user_role
    else 'Ventas'::public.user_role
  end,
  nombre = case id when '5f000000-0000-0000-0000-000000000001' then 'Operativo' else nombre end,
  apellido = case id when '5f000000-0000-0000-0000-000000000001' then 'Flujo' else apellido end,
  tenant_id = '00000000-0000-4000-8000-000000000001',
  is_platform_admin = false,
  status = 'Aprobado',
  is_active = true
where id in ('5f000000-0000-0000-0000-000000000001', '5f000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claims',
  '{"sub":"5f000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.clientes (id, nombre)
values ('5f100000-0000-0000-0000-000000000001', 'Cliente Flujo Simplificado');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '5f200000-0000-0000-0000-000000000001',
  '5f100000-0000-0000-0000-000000000001',
  '5f000000-0000-0000-0000-000000000001',
  'Ganada', 'Q-FLOW-FCL', 'other_origin_fcl', 'FCL', 'Maritimo',
  'FOB', 'Shanghai', 'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status, validated_by, validated_at
) values (
  '5f300000-0000-0000-0000-000000000001', 'RT-FLOW-FCL',
  '5f200000-0000-0000-0000-000000000001',
  '5f100000-0000-0000-0000-000000000001',
  '5f000000-0000-0000-0000-000000000001',
  'Validada', 'Validada', 'Listo para Booking',
  '5f000000-0000-0000-0000-000000000001', now()
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, vessel_name, voyage, etd, eta, shipment_status, created_by
) values (
  '5f400000-0000-0000-0000-000000000001',
  '5f300000-0000-0000-0000-000000000001',
  'BOOK-FLOW', 'CB-FLOW', 'CARRIER FLOW', 'VESSEL FLOW', 'V900',
  current_date + 10, current_date + 30, 'Listo para Booking',
  '5f000000-0000-0000-0000-000000000001'
);

insert into public.booking_containers (id, booking_id, container_type, quantity, notes)
values
  ('5f500000-0000-0000-0000-000000000001', '5f400000-0000-0000-0000-000000000001', 'Contenedor 40HC', 1, 'FLOW0000001'),
  ('5f500000-0000-0000-0000-000000000002', '5f400000-0000-0000-0000-000000000001', 'Contenedor 40HC', 1, 'FLOW0000002');

insert into public.booking_documents (id, booking_id, document_type, file_name, file_url, uploaded_by)
select gen_random_uuid(), '5f400000-0000-0000-0000-000000000001', document_type,
  document_type || '.pdf', 'test/flow/' || document_type || '.pdf',
  '5f000000-0000-0000-0000-000000000001'
from unnest(array['Booking Confirmation', 'Commercial Invoice', 'Packing List']) document_type;

-- Ventas no puede avanzar el booking.
select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error(
  $$select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
    pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'confirm')$$,
  'Ventas no debe avanzar el booking', '42501'
);
select pg_temp.expect_error(
  $$select public.submit_booking_vgm_batch('5f400000-0000-0000-0000-000000000001',
    '[{"booking_container_id":"5f500000-0000-0000-0000-000000000001","gross_mass":28000,"unit":"KG","verification_method":"METHOD_1","weighed_at":"2026-11-25T10:00:00Z"}]'::jsonb)$$,
  'Ventas no debe registrar VGM', '42501'
);

set local role postgres;
select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Versión obsoleta y paso fuera de orden se rechazan.
select pg_temp.expect_error(
  $$select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001', now() - interval '1 day', 'confirm')$$,
  'Una version obsoleta debe rechazarse', '40001'
);
select pg_temp.expect_error(
  $$select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
    pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'departure')$$,
  'Registrar salida antes de confirmar debe rechazarse', '22023'
);

-- 1. Confirmar: Listo para Booking -> Solicitado -> Confirmado en una acción.
select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
  pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'confirm');
select pg_temp.assert_true(
  (select shipment_status = 'Booking Confirmado' from public.bookings where id = '5f400000-0000-0000-0000-000000000001'),
  'Confirmar debe dejar el booking confirmado'
);

-- 2. Listo para embarque sin VGM: queda en Documentación Pendiente con el bloqueo.
select pg_temp.assert_true(
  (public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
    pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'ready') ->> 'transitioned')::boolean = false,
  'Sin VGM el paso listo debe devolver el bloqueo de readiness'
);
select pg_temp.assert_true(
  (select shipment_status = U&'Documentaci\00F3n Pendiente' from public.bookings where id = '5f400000-0000-0000-0000-000000000001'),
  'El paso intermedio debe quedar como Documentacion Pendiente'
);

-- 3. VGM en lote: un error revierte todo el lote.
select pg_temp.expect_error(
  $$select public.submit_booking_vgm_batch('5f400000-0000-0000-0000-000000000001',
    '[{"booking_container_id":"5f500000-0000-0000-0000-000000000001","gross_mass":28000,"unit":"KG","verification_method":"METHOD_1","weighed_at":"2026-11-25T10:00:00Z"},
      {"booking_container_id":"5f500000-0000-0000-0000-000000000002","gross_mass":-5,"unit":"KG","verification_method":"METHOD_1","weighed_at":"2026-11-25T10:00:00Z"}]'::jsonb)$$,
  'Una masa invalida debe rechazar el lote'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.container_vgm_records where booking_id = '5f400000-0000-0000-0000-000000000001'),
  'El lote fallido no debe dejar VGM parciales'
);
select pg_temp.assert_true(
  (public.submit_booking_vgm_batch('5f400000-0000-0000-0000-000000000001',
    '[{"booking_container_id":"5f500000-0000-0000-0000-000000000001","gross_mass":28000,"unit":"KG","verification_method":"METHOD_1","weighed_at":"2026-11-25T10:00:00Z"},
      {"booking_container_id":"5f500000-0000-0000-0000-000000000002","gross_mass":61000,"unit":"LB","verification_method":"METHOD_2","weighed_at":"2026-11-25T11:00:00Z"}]'::jsonb,
    'VGM-FLOW-1') ->> 'submitted')::integer = 2,
  'El lote debe enviar dos VGM'
);
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(status = 'SUBMITTED' and verified_at is not null
      and verified_by_name = 'Operativo Flujo' and submission_reference = 'VGM-FLOW-1')
   from public.container_vgm_records where booking_id = '5f400000-0000-0000-0000-000000000001'),
  'Cada VGM debe quedar verificada (con el usuario) y enviada'
);

-- 4. Listo para embarque con readiness completo.
select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
  pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'ready');
select pg_temp.assert_true(
  (select shipment_status = 'Listo para Embarque' from public.bookings where id = '5f400000-0000-0000-0000-000000000001'),
  'Con VGM enviada el booking debe quedar listo para embarque'
);

-- 5. Salida: Embarcado + En Tránsito con la misma fecha real.
select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
  pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'departure',
  (current_date + 10)::timestamptz + interval '8 hours', 'Shanghai', 'Zarpe');
select pg_temp.assert_true(
  (select shipment_status = U&'En Tr\00E1nsito' and actual_etd = current_date + 10
   from public.bookings where id = '5f400000-0000-0000-0000-000000000001'),
  'La salida debe dejar el booking en transito con salida real'
);
select pg_temp.assert_true(
  (select count(*) >= 2 from public.operational_events
   where booking_id = '5f400000-0000-0000-0000-000000000001'
     and metadata ->> 'flow_step' = 'departure'),
  'La salida debe registrar los dos eventos del flujo'
);

-- 6. Arribo.
select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
  pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'arrival',
  (current_date + 38)::timestamptz + interval '9 hours', 'Puerto Cortes', null);
select pg_temp.assert_true(
  (select shipment_status = 'Arribado' and actual_eta = current_date + 38
   from public.bookings where id = '5f400000-0000-0000-0000-000000000001'),
  'El arribo debe registrar la llegada real'
);

-- 7. HBL: aprobación directa desde el draft; el flujo anterior sigue siendo válido.
set local role postgres;
insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, bl_number, status,
  shipper, consignee, port_of_loading, port_of_discharge,
  carrier, vessel_name, voyage, description_of_goods, gross_weight_kg, created_by
) values (
  '5f600000-0000-0000-0000-000000000001', '5f400000-0000-0000-0000-000000000001',
  '5f300000-0000-0000-0000-000000000001', 'MBL', 'MASTER-FLOW', 'MBL Validado',
  'Agente origen', 'Sari Express', 'Shanghai', 'Puerto Cortes',
  'CARRIER FLOW', 'VESSEL FLOW', 'V900', 'Repuestos', 100,
  '5f000000-0000-0000-0000-000000000001'
);
insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, parent_bl_id, status,
  shipper, consignee, port_of_loading, port_of_discharge,
  carrier, vessel_name, voyage, description_of_goods, gross_weight_kg, created_by
) values
  ('5f600000-0000-0000-0000-000000000002', '5f400000-0000-0000-0000-000000000001',
   '5f300000-0000-0000-0000-000000000001', 'HBL', '5f600000-0000-0000-0000-000000000001', 'HBL Draft',
   'Proveedor', 'Cliente Flujo Simplificado', 'Shanghai', 'Puerto Cortes',
   'CARRIER FLOW', 'VESSEL FLOW', 'V900', 'Repuestos', 100, '5f000000-0000-0000-0000-000000000001'),
  ('5f600000-0000-0000-0000-000000000003', '5f400000-0000-0000-0000-000000000001',
   '5f300000-0000-0000-0000-000000000001', 'HBL', '5f600000-0000-0000-0000-000000000001', U&'Pendiente Aprobaci\00F3n Cliente',
   'Proveedor', 'Cliente Flujo Simplificado', 'Shanghai', 'Puerto Cortes',
   'CARRIER FLOW', 'VESSEL FLOW', 'V900', 'Repuestos', 100, '5f000000-0000-0000-0000-000000000001');
set local role authenticated;

select public.transition_bill_of_lading(
  '5f600000-0000-0000-0000-000000000002', 'HBL Draft', 'Aprobado por Cliente',
  (select updated_at from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000002')
);
select pg_temp.assert_true(
  (select status = 'Aprobado por Cliente' and client_approved_at is not null
   from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000002'),
  'El HBL debe aprobarse directo desde el draft'
);
select public.transition_bill_of_lading(
  '5f600000-0000-0000-0000-000000000002', 'Aprobado por Cliente', 'Emitido',
  (select updated_at from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000002')
);
select pg_temp.assert_true(
  (select status = 'Emitido' and issue_date is not null
   from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000002'),
  'El HBL aprobado debe poder emitirse'
);
select public.transition_bill_of_lading(
  '5f600000-0000-0000-0000-000000000003', U&'Pendiente Aprobaci\00F3n Cliente', 'Aprobado por Cliente',
  (select updated_at from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000003')
);
select pg_temp.assert_true(
  (select status = 'Aprobado por Cliente' from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000003'),
  'Los HBL historicos en Pendiente Aprobacion Cliente deben seguir avanzando'
);
select pg_temp.expect_error(
  $$select public.transition_bill_of_lading('5f600000-0000-0000-0000-000000000002', 'Emitido', 'HBL Draft',
    (select updated_at from public.bills_of_lading where id = '5f600000-0000-0000-0000-000000000002'))$$,
  'No se puede regresar un HBL emitido a draft', '22023'
);

-- 8. Entrega y cierre en una acción.
select public.advance_booking_flow('5f400000-0000-0000-0000-000000000001',
  pg_temp.booking_version('5f400000-0000-0000-0000-000000000001'), 'deliver_finalize',
  (current_date + 40)::timestamptz + interval '10 hours', 'Bodega cliente', 'Entregado completo');
select pg_temp.assert_true(
  (select shipment_status = 'Finalizado' from public.bookings where id = '5f400000-0000-0000-0000-000000000001')
  and (select count(*) = 1 from public.operational_events
       where booking_id = '5f400000-0000-0000-0000-000000000001' and event_code = 'DELIVERED'),
  'Entregar y finalizar debe registrar una entrega y cerrar el booking'
);

\o
select 'operations_simplified_flow: OK' as result;
rollback;

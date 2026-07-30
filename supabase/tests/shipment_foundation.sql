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

create temp table baseline_counts as
select
  (select count(*) from public.shipping_instructions) as si_count,
  (select count(*) from public.bookings) as booking_count,
  (select count(*) from public.operational_events) as event_count;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('5a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-shipment-foundation@test.local', '{}'::jsonb),
  ('5a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'operations-shipment-foundation@test.local', '{}'::jsonb),
  ('5a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'sales-owner-shipment-foundation@test.local', '{}'::jsonb),
  ('5a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
   'sales-other-shipment-foundation@test.local', '{}'::jsonb),
  ('5a000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated',
   'client-shipment-foundation@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '5a000000-0000-0000-0000-000000000001'
      then 'Admin'::public.user_role
    when '5a000000-0000-0000-0000-000000000002'
      then 'Operaciones'::public.user_role
    when '5a000000-0000-0000-0000-000000000005'
      then 'Cliente'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.clientes (id, nombre)
values
  ('5a100000-0000-0000-0000-000000000001', 'Cliente Shipment A'),
  ('5a100000-0000-0000-0000-000000000002', 'Cliente Shipment B');

update public.profiles
set cliente_id = '5a100000-0000-0000-0000-000000000001'
where id = '5a000000-0000-0000-0000-000000000005';

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values
  (
    '5a200000-0000-0000-0000-000000000001',
    '5a100000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000003',
    'Ganada', 'Q-5A-BACKFILL', 'other_origin_fcl', 'FCL', 'Marítimo',
    'FOB', 'Shanghai', 'Puerto Cortés'
  ),
  (
    '5a200000-0000-0000-0000-000000000002',
    '5a100000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000003',
    'Ganada', 'Q-5A-CREATE', 'other_origin_fcl', 'FCL', 'Marítimo',
    'FOB', 'Ningbo', 'Puerto Cortés'
  ),
  (
    '5a200000-0000-0000-0000-000000000003',
    '5a100000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000003',
    'Ganada', 'Q-5A-HISTORICAL', 'other_origin_fcl', 'FCL', 'Marítimo',
    'FOB', 'Qingdao', 'Puerto Cortés'
  );

insert into public.agent_quotes (
  id, quotation_id, agente_nombre, carrier, transit_time,
  free_days_destination, etd, is_selected
) values (
  '5a300000-0000-0000-0000-000000000001',
  '5a200000-0000-0000-0000-000000000002',
  'Agente 5A', 'CARRIER 5A', '18', 7, current_date + 2, true
);

-- Simula filas anteriores a 5A omitiendo únicamente la guardia de inserción.
select set_config('app.shipment_creation_mode', 'canonical_rpc', true);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status, container_qty
) values
  (
    '5a400000-0000-0000-0000-000000000001', 'RT-5A-MAIN',
    '5a200000-0000-0000-0000-000000000001',
    '5a100000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000003',
    'Validada', 'Booking Solicitado', 'Listo para Booking', 2
  ),
  (
    '5a400000-0000-0000-0000-000000000002', 'RT-5A-NO-QUOTE',
    null, null, '5a000000-0000-0000-0000-000000000002',
    'Borrador', 'Pendiente Validación', 'Pendiente Validación', null
  ),
  (
    '5a400000-0000-0000-0000-000000000003', 'RT-5A-HISTORICAL',
    '5a200000-0000-0000-0000-000000000003',
    '5a100000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000002',
    'Validada', 'Finalizado', 'Finalizado', 1
  );

alter table public.bookings
  disable trigger trg_validate_booking_shipment_relationship;

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, etd, eta, shipment_status, created_by
) values (
  '5a500000-0000-0000-0000-000000000009',
  '5a400000-0000-0000-0000-000000000003',
  'BOOK-5A-HISTORICAL', 'CARRIER-BOOK-5A-HISTORICAL',
  'CARRIER 5A', current_date - 30, current_date - 10, 'Finalizado',
  '5a000000-0000-0000-0000-000000000002'
);

set constraints all immediate;
alter table public.bookings
  enable trigger trg_validate_booking_shipment_relationship;

alter table public.operational_events
  disable trigger trg_validate_operational_event_relationships;

insert into public.operational_events (
  id, shipping_instruction_id, booking_id, event_code, event_label,
  occurred_at, source_system, created_by, created_at, updated_at
) values (
  '5a700000-0000-0000-0000-000000000009',
  '5a400000-0000-0000-0000-000000000003',
  '5a500000-0000-0000-0000-000000000009',
  'BOOKING_COMPLETED', 'Evento histórico 5A',
  '2026-01-01 00:00:00+00', 'legacy',
  '5a000000-0000-0000-0000-000000000002',
  '2026-01-01 00:00:00+00', '2026-01-02 00:00:00+00'
);

alter table public.operational_events
  enable trigger trg_validate_operational_event_relationships;

select set_config('app.shipment_creation_mode', '', true);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.shipments
    where id::text like '5a400000-%'
  ),
  'La prueba debe comenzar con SI históricas sin shipment'
);

create temp table first_backfill as
select * from public.backfill_shipments_from_shipping_instructions();

select pg_temp.assert_true(
  (
    select inserted_shipments = 3
      and linked_bookings = 1
      and linked_events = 1
    from first_backfill
  ),
  'El backfill debe crear exactamente un shipment por SI histórica'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
      and bool_and(id = shipping_instruction_id)
    from public.shipments
    where id::text like '5a400000-%'
  ),
  'El backfill debe conservar el UUID de cada SI'
);

select pg_temp.assert_true(
  (
    select metadata ->> 'migration_classification' = 'B_SI_WITHOUT_QUOTATION'
    from public.shipments
    where id = '5a400000-0000-0000-0000-000000000002'
  ),
  'Una SI sin cotización debe migrarse y clasificarse'
);

select pg_temp.assert_true(
  (
    select metadata ->> 'migration_classification' = 'F_HISTORICAL_CLOSED'
      and closed_at is not null
    from public.shipments
    where id = '5a400000-0000-0000-0000-000000000003'
  ),
  'Una SI histórica debe conservarse como cerrada'
);

select pg_temp.assert_true(
  (
    select
      booking.shipment_id = booking.shipping_instruction_id
      and event.shipment_id = booking.shipment_id
      and event.updated_at = '2026-01-02 00:00:00+00'::timestamptz
    from public.bookings booking
    join public.operational_events event on event.booking_id = booking.id
    where booking.id = '5a500000-0000-0000-0000-000000000009'
  ),
  'El backfill debe vincular booking/evento sin alterar su timestamp histórico'
);

select pg_temp.assert_true(
  (
    select inserted_shipments = 0
      and linked_bookings = 0
      and linked_events = 0
    from public.backfill_shipments_from_shipping_instructions()
  ),
  'Reejecutar el backfill debe ser idempotente'
);

insert into public.shipping_instructions (
  id, routing_number, client_id, created_by, status,
  shipment_status, operational_status, container_qty
) values (
  '5a400000-0000-0000-0000-000000000004', 'RT-5A-COMPAT',
  '5a100000-0000-0000-0000-000000000001',
  '5a000000-0000-0000-0000-000000000002',
  'Validada', 'Booking Solicitado', 'Listo para Booking', 1
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.shipments
    where id = '5a400000-0000-0000-0000-000000000004'
      and shipping_instruction_id = id
  ),
  'Un escritor legacy debe recibir un shipment por la guardia temporal'
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, vessel_name, voyage, etd, eta, shipment_status, created_by
) values
  (
    '5a500000-0000-0000-0000-000000000001',
    '5a400000-0000-0000-0000-000000000001',
    'BOOK-5A-A', 'CARRIER-BOOK-5A-A', 'CARRIER 5A', 'VESSEL 5A', 'V001',
    current_date, current_date + 18, 'Booking Solicitado',
    '5a000000-0000-0000-0000-000000000002'
  ),
  (
    '5a500000-0000-0000-0000-000000000002',
    '5a400000-0000-0000-0000-000000000001',
    'BOOK-5A-B', 'CARRIER-BOOK-5A-B', 'CARRIER 5A', 'VESSEL 5A', 'V002',
    current_date + 1, current_date + 19, 'Booking Confirmado',
    '5a000000-0000-0000-0000-000000000002'
  ),
  (
    '5a500000-0000-0000-0000-000000000003',
    '5a400000-0000-0000-0000-000000000004',
    'BOOK-5A-OTHER', 'CARRIER-BOOK-5A-OTHER', 'CARRIER 5A', 'VESSEL 5A', 'V003',
    current_date, current_date + 20, 'Booking Solicitado',
    '5a000000-0000-0000-0000-000000000002'
  );

select pg_temp.assert_true(
  (
    select count(*) = 2 and bool_and(shipment_id = shipping_instruction_id)
    from public.bookings
    where shipping_instruction_id = '5a400000-0000-0000-0000-000000000001'
  ),
  'Uno y varios bookings deben heredar el shipment correcto'
);

select pg_temp.expect_denied(
  $$update public.bookings
    set shipment_id = '5a400000-0000-0000-0000-000000000004'
    where id = '5a500000-0000-0000-0000-000000000001'$$,
  'No se debe mover un booking a otro shipment'
);

select pg_temp.expect_denied(
  $$insert into public.operational_events (
      shipping_instruction_id, shipment_id, booking_id,
      event_code, event_label, occurred_at, source_system, created_by
    ) values (
      '5a400000-0000-0000-0000-000000000001',
      '5a400000-0000-0000-0000-000000000004',
      '5a500000-0000-0000-0000-000000000001',
      'OPERATIONAL_NOTE', 'Evento inconsistente', now(), 'manual',
      '5a000000-0000-0000-0000-000000000002'
    )$$,
  'Un evento con shipment incorrecto debe rechazarse'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.shipments
    where id = '5a400000-0000-0000-0000-000000000001'
  ),
  'Ventas ajeno no debe ver el shipment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.shipments
    where id = '5a400000-0000-0000-0000-000000000001'
  ),
  'Ventas propietario debe ver su shipment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temp table created_operation as
select public.create_shipment_from_quotation(
  '5a200000-0000-0000-0000-000000000002',
  'default'
) as result;

select pg_temp.assert_true(
  (
    select
      (result -> 'shipment' ->> 'id') =
        (result -> 'shipping_instruction' ->> 'id')
      and (result ->> 'created')::boolean
    from created_operation
  ),
  'La creación canónica debe ser atómica y conservar el ID compatible'
);

select pg_temp.assert_true(
  (
    select not (public.create_shipment_from_quotation(
      '5a200000-0000-0000-0000-000000000002',
      'default'
    ) ->> 'created')::boolean
  ),
  'La misma clave de creación debe ser idempotente'
);

reset role;

update public.shipping_instructions
set status = 'Validada',
    operational_status = 'Listo para Booking',
    updated_at = clock_timestamp()
where id = (
  select (result -> 'shipping_instruction' ->> 'id')::uuid
  from created_operation
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

create temp table rpc_booking as
select id, shipment_id, shipping_instruction_id, updated_at
from public.create_booking_for_shipping_instruction((
  select (result -> 'shipping_instruction' ->> 'id')::uuid
  from created_operation
));

select pg_temp.assert_true(
  (
    select shipment_id = shipping_instruction_id
    from rpc_booking
  ),
  'La creación de booking debe heredar shipment_id'
);

reset role;

select set_config('app.booking_schedule_write_mode', 'admin_correction', true);
update public.bookings
set booking_number = 'BOOK-5A-RPC',
    carrier_booking = 'CARRIER-BOOK-5A-RPC',
    updated_at = clock_timestamp()
where id = (select id from rpc_booking);
select set_config('app.booking_schedule_write_mode', '', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

create temp table transition_result as
select public.transition_booking_status(
  (select id from rpc_booking),
  (select updated_at from public.bookings where id = (select id from rpc_booking)),
  'Booking Confirmado'
) as result;

select pg_temp.assert_true(
  (
    select
      (result ->> 'shipment_id')::uuid = (select shipment_id from rpc_booking)
      and (select shipment_id from public.bookings where id = (select id from rpc_booking))
          = (select shipment_id from rpc_booking)
    from transition_result
  ),
  'La transición debe retornar y preservar shipment_id'
);

select * from public.record_operational_event(
  p_shipping_instruction_id => '5a400000-0000-0000-0000-000000000001',
  p_booking_id => '5a500000-0000-0000-0000-000000000001',
  p_event_code => 'OPERATIONAL_NOTE',
  p_event_label => 'Nota 5A',
  p_notes => 'Evento asociado al shipment'
);

select pg_temp.assert_true(
  (
    select shipment_id = '5a400000-0000-0000-0000-000000000001'
    from public.operational_events
    where booking_id = '5a500000-0000-0000-0000-000000000001'
      and event_label = 'Nota 5A'
  ),
  'Un evento nuevo debe guardar shipment_id'
);

reset role;

insert into public.shipping_instructions (
  id, routing_number, client_id, created_by, status,
  shipment_status, operational_status, container_qty
) values (
  '5a400000-0000-0000-0000-000000000005', 'RT-5A-FINALIZE',
  '5a100000-0000-0000-0000-000000000001',
  '5a000000-0000-0000-0000-000000000002',
  'Validada', 'Booking Solicitado', 'Listo para Booking', 1
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier_booking,
  carrier, vessel_name, voyage, etd, eta, shipment_status, created_by
) values (
  '5a500000-0000-0000-0000-000000000005',
  '5a400000-0000-0000-0000-000000000005',
  'BOOK-5A-FINAL', 'CARRIER-BOOK-5A-FINAL',
  'CARRIER 5A', 'VESSEL 5A', 'V005',
  current_date, current_date + 10, 'Finalizado',
  '5a000000-0000-0000-0000-000000000002'
);

insert into public.booking_containers (
  id, booking_id, container_type, quantity, notes
) values (
  '5a600000-0000-0000-0000-000000000005',
  '5a500000-0000-0000-0000-000000000005',
  '40HC', 1, 'CONT-5A-FINAL'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select public.finalize_shipping_instruction_canonical(
  '5a400000-0000-0000-0000-000000000005',
  (
    select updated_at
    from public.shipping_instructions
    where id = '5a400000-0000-0000-0000-000000000005'
  )
);

select pg_temp.assert_true(
  (
    select operational_status = 'Finalizado' and closed_at is not null
    from public.shipments
    where id = '5a400000-0000-0000-0000-000000000005'
  ),
  'La finalización operativa debe cerrar el shipment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"5a000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.shipments
  ),
  'Cliente no debe leer shipments directamente'
);

select pg_temp.assert_true(
  (
    select count(*) >= 1
      and count(*) filter (
        where id = '5a400000-0000-0000-0000-000000000001'
          and booking_count = 2
      ) = 1
    from public.get_client_shipments_v2(true)
  ),
  'Portal v2 debe devolver una fila por shipment con varios bookings'
);

select pg_temp.assert_true(
  (
    select jsonb_array_length(bookings) = 2
    from public.get_client_shipment_detail_v2(
      '5a400000-0000-0000-0000-000000000001'
    )
  ),
  'Detalle de portal v2 debe conservar los dos bookings'
);

reset role;

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.shipments
    where shipping_instruction_id = '5a400000-0000-0000-0000-000000000001'
  ),
  'Reporte de operaciones debe tener una fila por shipment'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.bookings
    where shipment_id = '5a400000-0000-0000-0000-000000000001'
  ),
  'Reporte de bookings debe conservar N filas por booking'
);

select pg_temp.assert_true(
  (
    select
      (select count(*) from public.shipping_instructions) >= si_count
      and (select count(*) from public.bookings) >= booking_count
      and (select count(*) from public.operational_events) >= event_count
    from baseline_counts
  ),
  'La fundación no debe eliminar SI, bookings ni eventos existentes'
);

rollback;

\echo 'shipment_foundation.sql: OK'

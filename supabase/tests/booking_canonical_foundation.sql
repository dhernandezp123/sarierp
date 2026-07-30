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

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('4a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-booking-foundation@test.local', '{}'::jsonb),
  ('4a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'operations-booking-foundation@test.local', '{}'::jsonb),
  ('4a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'sales-booking-foundation@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '4a000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    when '4a000000-0000-0000-0000-000000000002' then 'Operaciones'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.clientes (id, nombre)
values ('4a100000-0000-0000-0000-000000000001', 'Cliente Booking Canonico');

insert into public.quotations (
  id,
  cliente_id,
  created_by,
  status,
  quotation_number,
  preferred_carrier,
  transit_time
) values (
  '4a200000-0000-0000-0000-000000000001',
  '4a100000-0000-0000-0000-000000000001',
  '4a000000-0000-0000-0000-000000000003',
  'Ganada',
  'Q-BOOKING-CANONICAL',
  'QUOTE CARRIER',
  '15'
);

insert into public.agent_quotes (
  id,
  quotation_id,
  agente_nombre,
  carrier,
  transit_time,
  free_days_destination,
  etd,
  is_selected
) values (
  '4a300000-0000-0000-0000-000000000001',
  '4a200000-0000-0000-0000-000000000001',
  'Agente Booking Canonico',
  'AGENT CARRIER',
  '12',
  7,
  current_date + 2,
  true
);

insert into public.shipping_instructions (
  id,
  routing_number,
  quotation_id,
  client_id,
  created_by,
  status,
  shipment_status,
  operational_status,
  booking_number,
  carrier_booking,
  master_bl,
  house_bl,
  carrier,
  etd,
  eta,
  free_days
) values
  (
    '4a400000-0000-0000-0000-000000000001',
    'RT-BOOKING-READY',
    '4a200000-0000-0000-0000-000000000001',
    '4a100000-0000-0000-0000-000000000001',
    '4a000000-0000-0000-0000-000000000003',
    'Validada',
    'Validada',
    'Listo para Booking',
    'LEGACY-BOOKING',
    'LEGACY-CARRIER-BOOKING',
    'LEGACY-MBL',
    'LEGACY-HBL',
    'LEGACY CARRIER',
    current_date,
    current_date + 20,
    '9'
  ),
  (
    '4a400000-0000-0000-0000-000000000002',
    'RT-BOOKING-ZERO',
    null,
    '4a100000-0000-0000-0000-000000000001',
    '4a000000-0000-0000-0000-000000000003',
    'Borrador',
    'Booking Solicitado',
    'Asignado',
    null, null, null, null, null, null, null, null
  ),
  (
    '4a400000-0000-0000-0000-000000000003',
    'RT-BOOKING-CANCELLED',
    null,
    '4a100000-0000-0000-0000-000000000001',
    '4a000000-0000-0000-0000-000000000003',
    'Validada',
    'Cancelada',
    'Cancelada',
    null, null, null, null, null, null, null, null
  ),
  (
    '4a400000-0000-0000-0000-000000000004',
    'RT-BOOKING-OTHER',
    null,
    '4a100000-0000-0000-0000-000000000001',
    '4a000000-0000-0000-0000-000000000003',
    'Validada',
    'Validada',
    'Listo para Booking',
    null, null, null, null, null, null, null, null
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"4a000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select * from public.create_booking_for_shipping_instruction(
    '4a400000-0000-0000-0000-000000000001'
  )$$,
  'Ventas no debe crear bookings'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"4a000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select * from public.create_booking_for_shipping_instruction(
    '4a400000-0000-0000-0000-000000000002'
  )$$,
  'Una SI no lista debe rechazar la creacion'
);

select pg_temp.expect_denied(
  $$select * from public.create_booking_for_shipping_instruction(
    '4a400000-0000-0000-0000-000000000003'
  )$$,
  'Una SI cancelada debe rechazar la creacion'
);

create temp table first_created_booking as
select id as booking_id, updated_at
from public.create_booking_for_shipping_instruction(
  '4a400000-0000-0000-0000-000000000001'
);

select pg_temp.assert_true(
  (
    select si.primary_booking_id = f.booking_id
    from public.shipping_instructions si
    cross join first_created_booking f
    where si.id = '4a400000-0000-0000-0000-000000000001'
  ),
  'El primer booking debe ser primario automaticamente'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.bookings
    where shipping_instruction_id = '4a400000-0000-0000-0000-000000000001'
  ),
  'El caso de compatibilidad con un booking debe ser distinguible'
);

select pg_temp.assert_true(
  (
    select b.carrier = 'AGENT CARRIER'
      and b.free_days = 7
      and b.estimated_transit_days = 12
    from public.bookings b
    join first_created_booking f on f.booking_id = b.id
  ),
  'El booking debe heredar defaults de la tarifa seleccionada'
);

create temp table second_created_booking as
select id as booking_id, updated_at
from public.create_booking_for_shipping_instruction(
  '4a400000-0000-0000-0000-000000000001'
);

select pg_temp.assert_true(
  (
    select si.primary_booking_id = f.booking_id
      and si.primary_booking_id <> s.booking_id
    from public.shipping_instructions si
    cross join first_created_booking f
    cross join second_created_booking s
    where si.id = '4a400000-0000-0000-0000-000000000001'
  ),
  'El segundo booking no debe reemplazar silenciosamente al primario'
);

select pg_temp.expect_denied(
  $$select public.set_primary_booking(
    '4a400000-0000-0000-0000-000000000004',
    (select booking_id from first_created_booking),
    'Intento con booking ajeno'
  )$$,
  'No se debe asignar un booking de otra SI'
);

select public.set_primary_booking(
  '4a400000-0000-0000-0000-000000000001',
  (select booking_id from second_created_booking),
  'Cambio manual para prueba'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.activity_logs al
    join second_created_booking s
      on (al.metadata ->> 'new_booking_id')::uuid = s.booking_id
    where al.action = 'primary_booking_changed'
      and al.entity_id = '4a400000-0000-0000-0000-000000000001'
  ),
  'El cambio manual de primario debe quedar auditado'
);

create temp table stale_booking_version as
select booking_id, updated_at
from first_created_booking;

create temp table updated_booking as
select
  (result -> 'booking' ->> 'updated_at')::timestamptz as updated_at
from (
  select public.correct_booking_administrative(
    (select booking_id from first_created_booking),
    (select updated_at from first_created_booking),
    'Preparacion de regresion 4A bajo reglas 5B',
    '{
      "booking_number":"CANONICAL-001",
      "carrier_booking":"CARRIER-CANONICAL-001",
      "carrier":"UPDATED CARRIER"
    }'::jsonb
  ) as result
) corrected;

select pg_temp.expect_denied(
  $$select * from public.update_booking_canonical(
    (select booking_id from first_created_booking),
    '4a400000-0000-0000-0000-000000000001',
    (select updated_at from updated_booking),
    '{"shipment_status":"Booking Confirmado"}'::jsonb
  )$$,
  'Fase 4C debe impedir cambios libres de estado en el update canonico'
);

select pg_temp.assert_true(
  (
    select si.booking_number = 'LEGACY-BOOKING'
      and si.carrier_booking = 'LEGACY-CARRIER-BOOKING'
      and si.master_bl = 'LEGACY-MBL'
      and si.house_bl = 'LEGACY-HBL'
    from public.shipping_instructions si
    where si.id = '4a400000-0000-0000-0000-000000000001'
  ),
  'El update canonico no debe modificar campos legacy de SI'
);

select pg_temp.expect_denied(
  $$select * from public.update_booking_canonical(
    (select booking_id from stale_booking_version),
    '4a400000-0000-0000-0000-000000000001',
    (select updated_at from stale_booking_version),
    '{"carrier":"STALE WRITE"}'::jsonb
  )$$,
  'Una version stale debe fallar por concurrencia'
);

select pg_temp.expect_denied(
  $$select * from public.update_booking_canonical(
    (select booking_id from first_created_booking),
    '4a400000-0000-0000-0000-000000000004',
    (select updated_at from updated_booking),
    '{"carrier":"WRONG SI"}'::jsonb
  )$$,
  'El update debe validar pertenencia a la SI'
);

select pg_temp.assert_true(
  (
    select
      count(*) filter (
        where shipping_instruction_id = '4a400000-0000-0000-0000-000000000002'
      ) = 0
      and count(*) filter (
        where shipping_instruction_id = '4a400000-0000-0000-0000-000000000001'
      ) = 2
    from public.bookings
    where shipping_instruction_id in (
      '4a400000-0000-0000-0000-000000000001',
      '4a400000-0000-0000-0000-000000000002'
    )
  ),
  'Los casos de compatibilidad 0 y N bookings deben ser distinguibles'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.bookings b
    join public.shipping_instructions si on si.id = b.shipping_instruction_id
    where si.id = '4a400000-0000-0000-0000-000000000001'
      and si.routing_number = 'RT-BOOKING-READY'
  ),
  'La consulta de bandeja debe devolver varios bookings de la misma SI'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"4a000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.bookings
    where shipping_instruction_id = '4a400000-0000-0000-0000-000000000001'
  ),
  'RLS debe permitir a Ventas leer bookings de su propia SI'
);

update public.bookings
set carrier = 'DIRECT WRITE'
where id = (select booking_id from first_created_booking);

select pg_temp.assert_true(
  (
    select carrier = 'UPDATED CARRIER'
    from public.bookings
    where id = (select booking_id from first_created_booking)
  ),
  'RLS debe filtrar el update directo de Ventas'
);

select pg_temp.expect_denied(
  $$select * from public.update_booking_canonical(
    (select booking_id from first_created_booking),
    '4a400000-0000-0000-0000-000000000001',
    (select updated_at from updated_booking),
    '{"carrier":"UNAUTHORIZED"}'::jsonb
  )$$,
  'El RPC debe impedir update de Ventas'
);

reset role;
rollback;

\echo 'booking_canonical_foundation.sql: OK'

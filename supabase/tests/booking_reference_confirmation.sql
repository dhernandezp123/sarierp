\set ON_ERROR_STOP on

begin;
\o /dev/null

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
  blocked boolean := false;
begin
  begin
    execute command;
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('6c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'operations-6c@test.local', '{}'::jsonb),
  ('6c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'client-6c@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '6c000000-0000-0000-0000-000000000001'
      then 'Operaciones'::public.user_role
    else 'Cliente'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.clientes (id, nombre)
values ('6c100000-0000-0000-0000-000000000001', 'Cliente Booking 6C');

update public.profiles
set cliente_id = '6c100000-0000-0000-0000-000000000001'
where id = '6c000000-0000-0000-0000-000000000002';

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '6c200000-0000-0000-0000-000000000001',
  '6c100000-0000-0000-0000-000000000001',
  '6c000000-0000-0000-0000-000000000001',
  'Ganada', 'Q-6C-BOOKING', 'other_origin_fcl', 'FCL', 'Maritimo',
  'FOB', 'Shanghai', 'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status
) values (
  '6c300000-0000-0000-0000-000000000001',
  'RT-6C-BOOKING',
  '6c200000-0000-0000-0000-000000000001',
  '6c100000-0000-0000-0000-000000000001',
  '6c000000-0000-0000-0000-000000000001',
  'Validada', 'Booking Solicitado', 'Booking Solicitado'
);

insert into public.bookings (
  id, shipping_instruction_id, carrier, vessel_name, voyage,
  shipment_status, created_by
) values (
  '6c400000-0000-0000-0000-000000000001',
  '6c300000-0000-0000-0000-000000000001',
  'MAERSK', 'VESSEL 6C', '006C', 'Booking Solicitado',
  '6c000000-0000-0000-0000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '6c000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select pg_temp.expect_denied(
  $$update public.bookings
    set booking_number = 'DIRECT-6C'
    where id = '6c400000-0000-0000-0000-000000000001'$$,
  'La referencia no debe aceptar update directo'
);

select public.confirm_booking_reference(
  '6c400000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
   where id = '6c400000-0000-0000-0000-000000000001'),
  'BOOK-6C-001',
  null,
  'Confirmacion recibida del carrier'
);

select pg_temp.assert_true(
  (
    select booking_number = 'BOOK-6C-001' and carrier_booking is null
    from public.bookings
    where id = '6c400000-0000-0000-0000-000000000001'
  ),
  'Operaciones debe poder completar el Booking Number faltante'
);

select public.confirm_booking_reference(
  '6c400000-0000-0000-0000-000000000001',
  (select updated_at from public.bookings
   where id = '6c400000-0000-0000-0000-000000000001'),
  'BOOK-6C-001',
  'CARRIER-6C-001',
  'Carrier Booking recibido posteriormente'
);

select pg_temp.assert_true(
  (
    select booking_number = 'BOOK-6C-001'
      and carrier_booking = 'CARRIER-6C-001'
    from public.bookings
    where id = '6c400000-0000-0000-0000-000000000001'
  ),
  'La segunda confirmacion debe preservar y completar referencias'
);

select pg_temp.expect_denied(
  format(
    $$select public.confirm_booking_reference(
      '6c400000-0000-0000-0000-000000000001',
      %L::timestamptz,
      'BOOK-6C-ALTERADO',
      'CARRIER-6C-001',
      'Intento de reemplazo'
    )$$,
    (select updated_at from public.bookings
     where id = '6c400000-0000-0000-0000-000000000001')
  ),
  'Operaciones no debe reemplazar una referencia confirmada'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.booking_schedule_revisions
    where booking_id = '6c400000-0000-0000-0000-000000000001'
      and revision_type = 'BOOKING_CONFIRMATION'
  ),
  'Cada referencia confirmada debe crear una revision inmutable'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.activity_logs
    where entity_id = '6c400000-0000-0000-0000-000000000001'
      and action = 'booking_reference_confirmed'
  ),
  'Cada confirmacion debe registrar actividad'
);

select set_config(
  'request.jwt.claim.sub',
  '6c000000-0000-0000-0000-000000000002',
  true
);

select pg_temp.expect_denied(
  format(
    $$select public.confirm_booking_reference(
      '6c400000-0000-0000-0000-000000000001',
      %L::timestamptz,
      'BOOK-6C-001',
      'CARRIER-6C-001',
      'Sin autorizacion'
    )$$,
    (select updated_at from public.bookings
     where id = '6c400000-0000-0000-0000-000000000001')
  ),
  'Cliente no puede confirmar referencias operativas'
);

\o
\echo 'booking_reference_confirmation: OK'
rollback;

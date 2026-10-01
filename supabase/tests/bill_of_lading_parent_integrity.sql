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
values (
  '6d000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'bl-parent@test.local', '{}'::jsonb
);

update public.profiles
set rol = 'Operaciones'::public.user_role,
    status = 'Aprobado',
    is_active = true
where id = '6d000000-0000-0000-0000-000000000001';

insert into public.clientes (id, nombre)
values ('6d100000-0000-0000-0000-000000000001', 'Cliente parent BL');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '6d200000-0000-0000-0000-000000000001',
  '6d100000-0000-0000-0000-000000000001',
  '6d000000-0000-0000-0000-000000000001',
  'Ganada', 'Q-PARENT-BL', 'other_origin_fcl', 'FCL', 'Maritimo',
  'FOB', 'Shanghai', 'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status
) values (
  '6d300000-0000-0000-0000-000000000001',
  'RT-PARENT-BL',
  '6d200000-0000-0000-0000-000000000001',
  '6d100000-0000-0000-0000-000000000001',
  '6d000000-0000-0000-0000-000000000001',
  'Validada', 'Booking Confirmado', 'Booking Confirmado'
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier,
  shipment_status, created_by
) values
  (
    '6d400000-0000-0000-0000-000000000001',
    '6d300000-0000-0000-0000-000000000001',
    'BOOKING-PARENT-1', 'MAERSK', 'Booking Confirmado',
    '6d000000-0000-0000-0000-000000000001'
  ),
  (
    '6d400000-0000-0000-0000-000000000002',
    '6d300000-0000-0000-0000-000000000001',
    'BOOKING-PARENT-2', 'MAERSK', 'Booking Confirmado',
    '6d000000-0000-0000-0000-000000000001'
  );

insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, bl_number, status, created_by
) values (
  '6d500000-0000-0000-0000-000000000001',
  '6d400000-0000-0000-0000-000000000001',
  '6d300000-0000-0000-0000-000000000001',
  'MBL', 'MASTER-PARENT-1', 'MBL Draft',
  '6d000000-0000-0000-0000-000000000001'
);

select pg_temp.expect_denied(
  $$insert into public.bills_of_lading (
      booking_id, shipping_instruction_id, bl_type, status, created_by
    ) values (
      '6d400000-0000-0000-0000-000000000001',
      '6d300000-0000-0000-0000-000000000001',
      'HBL', 'HBL Draft',
      '6d000000-0000-0000-0000-000000000001'
    )$$,
  'No debe crear un HBL sin MBL padre'
);

select pg_temp.expect_denied(
  $$insert into public.bills_of_lading (
      booking_id, shipping_instruction_id, bl_type, parent_bl_id, status, created_by
    ) values (
      '6d400000-0000-0000-0000-000000000002',
      '6d300000-0000-0000-0000-000000000001',
      'HBL', '6d500000-0000-0000-0000-000000000001', 'HBL Draft',
      '6d000000-0000-0000-0000-000000000001'
    )$$,
  'No debe asociar un HBL al MBL de otro booking'
);

insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, parent_bl_id, status,
  created_by
) values (
  '6d500000-0000-0000-0000-000000000002',
  '6d400000-0000-0000-0000-000000000001',
  '6d300000-0000-0000-0000-000000000001',
  'HBL', '6d500000-0000-0000-0000-000000000001', 'HBL Draft',
  '6d000000-0000-0000-0000-000000000001'
);

select pg_temp.expect_denied(
  $$update public.bills_of_lading
    set status = U&'Pendiente Aprobaci\00F3n Cliente'
    where id = '6d500000-0000-0000-0000-000000000002'$$,
  'No debe avanzar el HBL mientras el MBL padre siga en draft'
);

update public.bills_of_lading
set status = 'MBL Validado'
where id = '6d500000-0000-0000-0000-000000000001';

update public.bills_of_lading
set status = U&'Pendiente Aprobaci\00F3n Cliente'
where id = '6d500000-0000-0000-0000-000000000002';

select pg_temp.assert_true(
  (
    select status = U&'Pendiente Aprobaci\00F3n Cliente'
    from public.bills_of_lading
    where id = '6d500000-0000-0000-0000-000000000002'
  ),
  'Debe permitir avanzar el HBL cuando su MBL padre ya esta validado'
);

select pg_temp.expect_denied(
  $$update public.bills_of_lading
    set parent_bl_id = '6d500000-0000-0000-0000-000000000001'
    where id = '6d500000-0000-0000-0000-000000000001'$$,
  'Un MBL no debe pertenecer a otro BL'
);

\o
\echo 'bill_of_lading_parent_integrity: OK'
rollback;

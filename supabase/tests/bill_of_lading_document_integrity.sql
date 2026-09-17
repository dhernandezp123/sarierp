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
  ('6b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'operations-6b@test.local', '{}'::jsonb);

update public.profiles
set rol = 'Operaciones'::public.user_role,
    status = 'Aprobado',
    is_active = true
where id = '6b000000-0000-0000-0000-000000000001';

insert into public.clientes (id, nombre)
values ('6b100000-0000-0000-0000-000000000001', 'Cliente BL 6B');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '6b200000-0000-0000-0000-000000000001',
  '6b100000-0000-0000-0000-000000000001',
  '6b000000-0000-0000-0000-000000000001',
  'Ganada', 'Q-6B-BL', 'other_origin_fcl', 'FCL', 'Maritimo',
  'FOB', 'Shanghai', 'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status
) values (
  '6b300000-0000-0000-0000-000000000001',
  'RT-6B-BL',
  '6b200000-0000-0000-0000-000000000001',
  '6b100000-0000-0000-0000-000000000001',
  '6b000000-0000-0000-0000-000000000001',
  'Validada', 'Booking Confirmado', 'Booking Confirmado'
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier, vessel_name, voyage,
  shipment_status, created_by
) values (
  '6b400000-0000-0000-0000-000000000001',
  '6b300000-0000-0000-0000-000000000001',
  'BOOKING-6B', 'MAERSK', 'VESSEL 6B', '001S',
  'Booking Confirmado',
  '6b000000-0000-0000-0000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '6b000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, bl_number, status,
  shipper, consignee, port_of_loading, port_of_discharge,
  carrier, vessel_name, voyage, description_of_goods, gross_weight_kg,
  created_by
) values (
  '6b500000-0000-0000-0000-000000000003',
  '6b400000-0000-0000-0000-000000000001',
  '6b300000-0000-0000-0000-000000000001',
  'MBL', 'MASTER-6B', 'MBL Draft', 'Agente origen', 'Sari Express',
  'Shanghai', 'Puerto Cortes', 'MAERSK', 'VESSEL 6B', '001S',
  'Repuestos', 100,
  '6b000000-0000-0000-0000-000000000001'
);

insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, parent_bl_id, status,
  shipper, consignee, port_of_loading, port_of_discharge,
  carrier, vessel_name, voyage, description_of_goods, gross_weight_kg,
  created_by
) values
  (
    '6b500000-0000-0000-0000-000000000001',
    '6b400000-0000-0000-0000-000000000001',
    '6b300000-0000-0000-0000-000000000001',
    'HBL', '6b500000-0000-0000-0000-000000000003', 'HBL Draft', 'Proveedor 6B', 'Cliente BL 6B',
    'Shanghai', 'Puerto Cortes', 'MAERSK', 'VESSEL 6B', '001S',
    'Repuestos', 100,
    '6b000000-0000-0000-0000-000000000001'
  ),
  (
    '6b500000-0000-0000-0000-000000000002',
    '6b400000-0000-0000-0000-000000000001',
    '6b300000-0000-0000-0000-000000000001',
    'HBL', '6b500000-0000-0000-0000-000000000003', 'HBL Draft', null, null, null, null, null, null, null, null, null,
    '6b000000-0000-0000-0000-000000000001'
  );

select pg_temp.assert_true(
  (
    select count(distinct bl_number) = 2
      and bool_and(bl_number ~ '^SARI-HBL-[0-9]{8}-[0-9]{3,}$')
    from public.bills_of_lading
    where id in (
      '6b500000-0000-0000-0000-000000000001',
      '6b500000-0000-0000-0000-000000000002'
    )
  ),
  'El trigger debe asignar numeros HBL unicos con el formato canonico'
);

select pg_temp.expect_denied(
  $$update public.bills_of_lading
    set status = 'Emitido'
    where id = '6b500000-0000-0000-0000-000000000001'$$,
  'El estado no debe poder cambiarse por update directo'
);

select pg_temp.expect_denied(
  format(
    $$select public.transition_bill_of_lading(
      '6b500000-0000-0000-0000-000000000002',
      'HBL Draft', U&'Pendiente Aprobaci\00F3n Cliente', %L::timestamptz
    )$$,
    (select updated_at from public.bills_of_lading
     where id = '6b500000-0000-0000-0000-000000000002')
  ),
  'No debe avanzar un HBL incompleto'
);

select pg_temp.expect_denied(
  format(
    $$select public.transition_bill_of_lading(
      '6b500000-0000-0000-0000-000000000003',
      'MBL Draft', 'MBL Validado', %L::timestamptz
    )$$,
    (select updated_at from public.bills_of_lading
     where id = '6b500000-0000-0000-0000-000000000003')
  ),
  'No debe validar un MBL sin el draft del agente'
);

update public.bills_of_lading
set draft_file_url = 'booking/bl-drafts/master-6b.pdf',
    updated_at = clock_timestamp()
where id = '6b500000-0000-0000-0000-000000000003';

select public.transition_bill_of_lading(
  '6b500000-0000-0000-0000-000000000003',
  'MBL Draft',
  'MBL Validado',
  (select updated_at from public.bills_of_lading
   where id = '6b500000-0000-0000-0000-000000000003')
);

select pg_temp.assert_true(
  (
    select bl.status = 'MBL Validado' and b.master_bl = bl.bl_number
    from public.bills_of_lading bl
    join public.bookings b on b.id = bl.booking_id
    where bl.id = '6b500000-0000-0000-0000-000000000003'
  ),
  'Validar el MBL debe exigir draft y sincronizar master_bl'
);

select public.transition_bill_of_lading(
  '6b500000-0000-0000-0000-000000000001',
  'HBL Draft',
  U&'Pendiente Aprobaci\00F3n Cliente',
  (select updated_at from public.bills_of_lading
   where id = '6b500000-0000-0000-0000-000000000001')
);

select public.transition_bill_of_lading(
  '6b500000-0000-0000-0000-000000000001',
  U&'Pendiente Aprobaci\00F3n Cliente',
  'Aprobado por Cliente',
  (select updated_at from public.bills_of_lading
   where id = '6b500000-0000-0000-0000-000000000001')
);

select public.transition_bill_of_lading(
  '6b500000-0000-0000-0000-000000000001',
  'Aprobado por Cliente',
  'Emitido',
  (select updated_at from public.bills_of_lading
   where id = '6b500000-0000-0000-0000-000000000001')
);

select pg_temp.assert_true(
  (
    select bl.status = 'Emitido'
      and bl.issue_date is not null
      and b.house_bl = bl.bl_number
    from public.bills_of_lading bl
    join public.bookings b on b.id = bl.booking_id
    where bl.id = '6b500000-0000-0000-0000-000000000001'
  ),
  'Emitir debe fechar el HBL y sincronizar el resumen canonico del booking'
);

select pg_temp.expect_denied(
  $$update public.bills_of_lading
    set consignee = 'Cambio posterior'
    where id = '6b500000-0000-0000-0000-000000000001'$$,
  'Un HBL emitido no debe admitir cambios documentales'
);

select pg_temp.expect_denied(
  $$insert into public.bl_containers (bl_id, container_number)
    values ('6b500000-0000-0000-0000-000000000001', 'CONT-LOCKED')$$,
  'Los contenedores de un HBL emitido deben ser inmutables'
);

select public.transition_bill_of_lading(
  '6b500000-0000-0000-0000-000000000001',
  'Emitido',
  'Liberado',
  (select updated_at from public.bills_of_lading
   where id = '6b500000-0000-0000-0000-000000000001')
);

select pg_temp.assert_true(
  (
    select status = 'Liberado' and release_date is not null
    from public.bills_of_lading
    where id = '6b500000-0000-0000-0000-000000000001'
  ),
  'La liberacion debe ser la unica transicion posterior a la emision'
);

select pg_temp.assert_true(
  (
    select count(*) = 4
    from public.bl_amendments
    where bl_id = '6b500000-0000-0000-0000-000000000001'
  ),
  'Cada transicion debe registrar una enmienda en la misma transaccion'
);

select pg_temp.assert_true(
  (
    select count(*) >= 4
    from public.activity_logs
    where entity_id = '6b500000-0000-0000-0000-000000000001'
      and action = 'status_change'
  ),
  'Cada transicion debe registrar actividad del BL'
);

\o
\echo 'bill_of_lading_document_integrity: OK'
rollback;

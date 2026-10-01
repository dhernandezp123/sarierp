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
  '7e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'operations-7e@test.local', '{}'::jsonb
);

update public.profiles
set nombre = 'Operador', apellido = 'Excepciones',
    rol = 'Operaciones'::public.user_role, status = 'Aprobado', is_active = true
where id = '7e000000-0000-0000-0000-000000000001';

insert into public.clientes (id, nombre)
values ('7e100000-0000-0000-0000-000000000001', 'Cliente Excepciones');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '7e200000-0000-0000-0000-000000000001',
  '7e100000-0000-0000-0000-000000000001',
  '7e000000-0000-0000-0000-000000000001',
  'Ganada', 'Q-7E-BL', 'other_origin_fcl', 'FCL', 'Maritimo',
  'FOB', 'Shanghai', 'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status
) values (
  '7e300000-0000-0000-0000-000000000001', 'RT-7E-BL',
  '7e200000-0000-0000-0000-000000000001',
  '7e100000-0000-0000-0000-000000000001',
  '7e000000-0000-0000-0000-000000000001',
  'Validada', 'Booking Confirmado', 'Booking Confirmado'
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier, vessel_name, voyage,
  shipment_status, created_by
) values (
  '7e400000-0000-0000-0000-000000000001',
  '7e300000-0000-0000-0000-000000000001',
  'BOOKING-7E', 'MAERSK', 'VESSEL 7E', '001S', 'Booking Confirmado',
  '7e000000-0000-0000-0000-000000000001'
);

insert into public.bills_of_lading (
  id, booking_id, shipping_instruction_id, bl_type, bl_number, status,
  shipper, consignee, port_of_loading, port_of_discharge,
  carrier, vessel_name, voyage, description_of_goods, gross_weight_kg,
  draft_file_url, created_by
) values (
  '7e500000-0000-0000-0000-000000000001',
  '7e400000-0000-0000-0000-000000000001',
  '7e300000-0000-0000-0000-000000000001',
  'MBL', 'MASTER-7E', 'MBL Draft', 'Agente', 'Sari Express',
  'Shanghai', 'Puerto Cortes', 'COSCO', 'VESSEL 7E', '001S', 'Repuestos', 100,
  'booking/bl-drafts/master-7e.pdf',
  '7e000000-0000-0000-0000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '7e000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select pg_temp.expect_denied(
  $$insert into public.bl_validation_exceptions (
      bl_id, field_name, document_value, source_value, source_label,
      reason, created_by, created_by_name
    ) values (
      '7e500000-0000-0000-0000-000000000001', 'carrier', 'COSCO', 'MAERSK',
      'Booking', 'Inserción directa prohibida',
      '7e000000-0000-0000-0000-000000000001', 'Operador Excepciones'
    )$$,
  'La tabla debe ser de solo lectura para usuarios autenticados'
);

select public.acknowledge_bl_validation_exception(
  '7e500000-0000-0000-0000-000000000001',
  'carrier', 'COSCO', 'MAERSK', 'Booking / Shipping Instruction',
  'Switch BL confirmado por el cliente'
);

select pg_temp.assert_true(
  (
    select status = 'ACTIVE'
      and created_by_name = 'Operador Excepciones'
      and reason = 'Switch BL confirmado por el cliente'
    from public.bl_validation_exceptions
    where bl_id = '7e500000-0000-0000-0000-000000000001'
  ),
  'La justificación debe guardar valores, autor y motivo'
);

select public.acknowledge_bl_validation_exception(
  '7e500000-0000-0000-0000-000000000001',
  'carrier', 'COSCO', 'HAPAG-LLOYD', 'Booking / Shipping Instruction',
  'Fuente actualizada y nuevamente confirmada'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
      and count(*) filter (where status = 'ACTIVE') = 1
      and count(*) filter (where status = 'SUPERSEDED') = 1
    from public.bl_validation_exceptions
    where bl_id = '7e500000-0000-0000-0000-000000000001'
      and field_name = 'carrier'
  ),
  'Una nueva justificación debe conservar y cerrar la versión anterior'
);

select public.revoke_bl_validation_exception(
  (
    select id
    from public.bl_validation_exceptions
    where bl_id = '7e500000-0000-0000-0000-000000000001'
      and field_name = 'carrier'
      and status = 'ACTIVE'
  ),
  'La diferencia debe volver a revisarse'
);

select pg_temp.assert_true(
  (
    select count(*) filter (where status = 'ACTIVE') = 0
      and count(*) filter (where status = 'REVOKED') = 1
    from public.bl_validation_exceptions
    where bl_id = '7e500000-0000-0000-0000-000000000001'
  ),
  'Revocar debe cerrar la excepción sin eliminar el historial'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.activity_logs
    where entity_id = '7e500000-0000-0000-0000-000000000001'
      and action in (
        'validation_exception_acknowledged',
        'validation_exception_revoked'
      )
  ),
  'Cada alta, reemplazo y revocación debe quedar en activity_logs'
);

select pg_temp.expect_denied(
  format(
    $$select public.transition_bill_of_lading(
      '7e500000-0000-0000-0000-000000000001',
      'MBL Draft', 'MBL Validado', %L::timestamptz
    )$$,
    (select updated_at from public.bills_of_lading
     where id = '7e500000-0000-0000-0000-000000000001')
  ),
  'La base debe impedir validar un MBL con diferencias sin justificar'
);

select public.acknowledge_bl_validation_exception(
  '7e500000-0000-0000-0000-000000000001',
  'carrier', 'COSCO', 'MAERSK', 'Booking / Shipping Instruction',
  'Switch BL confirmado antes de validar el documento'
);

select public.transition_bill_of_lading(
  '7e500000-0000-0000-0000-000000000001',
  'MBL Draft', 'MBL Validado',
  (select updated_at from public.bills_of_lading
   where id = '7e500000-0000-0000-0000-000000000001')
);

select pg_temp.assert_true(
  (
    select status = 'MBL Validado'
    from public.bills_of_lading
    where id = '7e500000-0000-0000-0000-000000000001'
  ),
  'Una excepción exacta debe permitir la transición final'
);

\o
rollback;

select 'bl_validation_exceptions: ok' as result;

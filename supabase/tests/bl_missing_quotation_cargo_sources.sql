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
    rol = 'Admin'::public.user_role, status = 'Aprobado', is_active = true,
    tenant_id='00000000-0000-4000-8000-000000000001',is_platform_admin=false
where id = '7e000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims','{"sub":"7e000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

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
  'Shanghai', 'Puerto Cortes', 'MAERSK', 'VESSEL 7E', '001S', 'Repuestos', 100,
  'booking/bl-drafts/master-7e.pdf',
  '7e000000-0000-0000-0000-000000000001'
);


-- Unknown quotation cargo must not contradict the real MBL quantities.
update public.quotations set peso_kg=0,gross_weight=0,volumen_cbm=0,cantidad_bultos=0
where id='7e200000-0000-0000-0000-000000000001';
update public.bills_of_lading set measurement_cbm=2,number_of_packages=5
where id='7e500000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not exists(select 1 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')
  where field_name in ('gross_weight_kg','measurement_cbm','number_of_packages')),
  'Zero quotation placeholders are unknown, not source mismatches');

-- Genuine positive sources must still block validation until corrected/justified.
update public.quotations set peso_kg=90,gross_weight=80,volumen_cbm=3,cantidad_bultos=6
where id='7e200000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*)=3 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')
  where field_name in ('gross_weight_kg','measurement_cbm','number_of_packages')),
  'Positive source mismatches remain enforced');
set local role authenticated;
select pg_temp.expect_denied(format($cmd$select public.transition_bill_of_lading(
  '7e500000-0000-0000-0000-000000000001','MBL Draft','MBL Validado',%L::timestamptz)$cmd$,
  (select updated_at from public.bills_of_lading where id='7e500000-0000-0000-0000-000000000001')),
  'Positive differences cannot be bypassed by Admin');
select public.acknowledge_bl_validation_exception('7e500000-0000-0000-0000-000000000001',
  'gross_weight_kg','100','90','Booking / Shipping Instruction','Synthetic confirmed cargo difference');
select public.acknowledge_bl_validation_exception('7e500000-0000-0000-0000-000000000001',
  'measurement_cbm','2','3','Booking / Shipping Instruction','Synthetic confirmed cargo difference');
select public.acknowledge_bl_validation_exception('7e500000-0000-0000-0000-000000000001',
  'number_of_packages','5','6','Booking / Shipping Instruction','Synthetic confirmed cargo difference');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')),
  'Exact active exceptions still resolve genuine differences');
update public.quotations set peso_kg=91 where id='7e200000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*)=1 and min(field_name)='gross_weight_kg'
  from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')),
  'Changing source invalidates a previously exact justification');

-- A positive gross_weight fallback remains authoritative when peso_kg is zero.
update public.quotations set peso_kg=0,gross_weight=100,volumen_cbm=2,cantidad_bultos=5
where id='7e200000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not exists(select 1 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')),
  'Matching positive fallback sources produce no differences');
update public.quotations set gross_weight=95 where id='7e200000-0000-0000-0000-000000000001';
select pg_temp.assert_true(exists(select 1 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')
  where field_name='gross_weight_kg' and source_value::numeric=95),
  'Positive gross_weight fallback is not discarded');

update public.quotations set peso_kg=null,gross_weight=null,volumen_cbm=null,cantidad_bultos=null
where id='7e200000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not exists(select 1 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000001')),
  'Null quotation sources remain unknown');

-- The HBL still compares its cargo against its parent MBL.
insert into public.bills_of_lading(id,booking_id,shipping_instruction_id,bl_type,parent_bl_id,status,
  gross_weight_kg,measurement_cbm,number_of_packages,created_by)
values('7e500000-0000-0000-0000-000000000002','7e400000-0000-0000-0000-000000000001',
  '7e300000-0000-0000-0000-000000000001','HBL','7e500000-0000-0000-0000-000000000001','HBL Draft',
  110,4,7,'7e000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*)=3 from public.get_unresolved_bl_source_differences('7e500000-0000-0000-0000-000000000002')
  where field_name in ('gross_weight_kg','measurement_cbm','number_of_packages') and source_label='MBL padre'),
  'HBL differences against a positive parent MBL remain enforced');

-- Unknown quotation sources never waive the document's mandatory positive weight.
update public.quotations set peso_kg=0,gross_weight=0,volumen_cbm=0,cantidad_bultos=0
where id='7e200000-0000-0000-0000-000000000001';
update public.bills_of_lading set gross_weight_kg=0 where id='7e500000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.expect_denied(format($cmd$select public.transition_bill_of_lading(
  '7e500000-0000-0000-0000-000000000001','MBL Draft','MBL Validado',%L::timestamptz)$cmd$,
  (select updated_at from public.bills_of_lading where id='7e500000-0000-0000-0000-000000000001')),
  'The MBL itself must retain its mandatory positive weight');
reset role;
update public.bills_of_lading set gross_weight_kg=100 where id='7e500000-0000-0000-0000-000000000001';
set local role authenticated;
select public.transition_bill_of_lading('7e500000-0000-0000-0000-000000000001','MBL Draft','MBL Validado',
  (select updated_at from public.bills_of_lading where id='7e500000-0000-0000-0000-000000000001'));
select pg_temp.assert_true((select status='MBL Validado' and gross_weight_kg=100 and measurement_cbm=2 and number_of_packages=5
  from public.bills_of_lading where id='7e500000-0000-0000-0000-000000000001'),
  'Admin validates the MBL with zero quotation sources without changing its real cargo');
reset role;
rollback;
\echo 'bl_missing_quotation_cargo_sources.sql: OK'

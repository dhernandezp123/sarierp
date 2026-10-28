\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.expect_error(command text, expected text)
returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if position(expected in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'ASSERTION FAILED: esperaba %', expected;
end;
$$;
insert into public.tenants(id, slug, name) values
  ('be260000-0000-4000-8000-000000000100', 'billing26', 'Facturación aislada'),
  ('be260000-0000-4000-8000-000000000200', 'billing26-other', 'Otra empresa aislada');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
values ('be260000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'billing26@test.local', '{}');
update public.profiles set rol = 'Contabilidad', status = 'Aprobado', is_active = true,
  tenant_id = 'be260000-0000-4000-8000-000000000100'
where id = 'be260000-0000-4000-8000-000000000001';
insert into public.company_settings(tenant_id, legal_name, billing_points_of_sale)
values
  ('be260000-0000-4000-8000-000000000100', 'Empresa prueba', array['San Pedro Sula', 'Tegucigalpa']),
  ('be260000-0000-4000-8000-000000000200', 'Otra empresa', array['Otra empresa']);
insert into public.billing_offices(tenant_id,name,establishment_code,emission_point_code) values('be260000-0000-4000-8000-000000000200','Otra empresa','099','001');
insert into public.cai_ranges(id, tenant_id, cai, point_of_sale, rango_desde, rango_hasta, fecha_limite_emision, is_active)
values ('be262000-0000-4000-8000-000000000099', 'be260000-0000-4000-8000-000000000200', 'CAI-OTRA', 'Otra empresa', '099-001-01-00000001', '099-001-01-00000100', current_date + 30, false);
insert into public.clientes(id, nombre, rtn, condicion_pago, tenant_id)
values ('be261000-0000-4000-8000-000000000001', 'Cliente prueba fiscal', '08011999123456', 'Contado', 'be260000-0000-4000-8000-000000000100');
update public.company_settings set rtn='08019999123456',address='Domicilio fiscal';
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values
('be263000-0000-4000-8000-000000000001','be260000-0000-4000-8000-000000000100','San Pedro Sula','Dirección SPS','11111111','sps@test.local','001','001'),
('be263000-0000-4000-8000-000000000002','be260000-0000-4000-8000-000000000100','Tegucigalpa','Dirección TGU','22222222','tgu@test.local','002','001');
update public.clientes set billing_office_id='be263000-0000-4000-8000-000000000001' where id='be261000-0000-4000-8000-000000000001';
-- The CAI setup persona is explicitly designated; financial roles alone cannot configure CAI.
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) select tenant_id,id,'Despliegue autorizado' from public.profiles where id='be260000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"be260000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true(public.get_billing_points_of_sale() = array['San Pedro Sula', 'Tegucigalpa'], 'Lee oficinas del tenant');
select pg_temp.expect_error($cmd$select public.activate_cai_range('be262000-0000-4000-8000-000000000099')$cmd$, 'no existe');
insert into public.cai_ranges(id, cai, point_of_sale, document_type, rango_desde, rango_hasta, fecha_limite_emision, is_active, next_number) values
  ('be262000-0000-4000-8000-000000000001', 'CAI-TEST-SPS', 'San Pedro Sula', 'Factura', '001-001-01-00000001', '001-001-01-00000100', current_date + 30, false, null),
  ('be262000-0000-4000-8000-000000000002', 'CAI-TEST-TGU', 'Tegucigalpa', 'Factura', '002-001-01-00000001', '002-001-01-00000100', current_date + 30, false, null),
  ('be262000-0000-4000-8000-000000000003', 'CAI-TEST-TGU-NC', 'Tegucigalpa', 'Nota de Crédito', '002-001-06-00000001', '002-001-06-00000100', current_date + 30, false, null),
  ('be262000-0000-4000-8000-000000000004', 'CAI-TEST-SPS-NUEVO', 'San Pedro Sula', 'Factura', '001-001-01-00000101', '001-001-01-00000200', current_date + 60, false, 150);
select public.activate_cai_range('be262000-0000-4000-8000-000000000001');
select public.activate_cai_range('be262000-0000-4000-8000-000000000002');
select public.activate_cai_range('be262000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select count(*) = 3 from public.cai_ranges where id::text like 'be262000-%' and is_active), 'Ambas oficinas y NC conservan CAI activos simultáneos');

create temporary table issued on commit drop as
select * from public.create_manual_invoice_with_items(
  jsonb_build_object('invoice_type', 'Factura', 'cliente_id', 'be261000-0000-4000-8000-000000000001', 'point_of_sale', 'San Pedro Sula'),
  '[{"description":"Servicio prueba","quantity":1,"unit_price":100,"isv_rate":15}]');
update public.clientes set billing_office_id='be263000-0000-4000-8000-000000000002' where id='be261000-0000-4000-8000-000000000001';
insert into issued select * from public.create_manual_invoice_with_items(
  jsonb_build_object('invoice_type', 'Factura', 'cliente_id', 'be261000-0000-4000-8000-000000000001', 'point_of_sale', 'Tegucigalpa'),
  '[{"description":"Servicio prueba","quantity":1,"unit_price":100,"isv_rate":15}]');
update public.clientes set billing_office_id='be263000-0000-4000-8000-000000000001' where id='be261000-0000-4000-8000-000000000001';
insert into issued select * from public.create_manual_invoice_with_items(
  jsonb_build_object('invoice_type', 'Factura', 'cliente_id', 'be261000-0000-4000-8000-000000000001'),
  '[{"description":"Oficina predeterminada","quantity":1,"unit_price":100,"isv_rate":0}]');
select pg_temp.assert_true((select array_agg(invoice_number order by invoice_number) = array['001-001-01-00000001', '001-001-01-00000002', '002-001-01-00000001'] from issued), 'Correlativos separados según oficina del cliente');
select pg_temp.assert_true((select count(*) = 2 from public.invoices where id in (select invoice_id from issued) and point_of_sale = 'San Pedro Sula' and cai = 'CAI-TEST-SPS'), 'Snapshot SPS y CAI corresponden');
select pg_temp.assert_true((select count(*) = 1 and min(total) = 115 from public.invoices where id in (select invoice_id from issued) and point_of_sale = 'Tegucigalpa' and cai = 'CAI-TEST-TGU'), 'Snapshot TGU, CAI e impuesto corresponden');
select pg_temp.expect_error($cmd$update public.invoices set point_of_sale = 'Tegucigalpa' where id in (select invoice_id from issued where invoice_number = '001-001-01-00000001')$cmd$, 'flujo autorizado');
insert into issued select * from public.create_manual_invoice_with_items(
  jsonb_build_object('invoice_type', 'Nota de Crédito', 'cliente_id', 'be261000-0000-4000-8000-000000000001',
    'parent_invoice_id', (select invoice_id from issued where invoice_number = '002-001-01-00000001'), 'motivo', 'Prueba'),
  '[{"description":"Ajuste prueba","quantity":1,"unit_price":10,"isv_rate":15}]');
select pg_temp.assert_true(exists(select 1 from issued where invoice_number = '002-001-06-00000001'), 'NC hereda la oficina de su factura aunque el default sea SPS');

select pg_temp.expect_error($cmd$select * from public.create_manual_invoice_with_items(
  jsonb_build_object('invoice_type', 'Nota de Crédito', 'cliente_id', 'be261000-0000-4000-8000-000000000001', 'point_of_sale', 'San Pedro Sula',
    'parent_invoice_id', (select invoice_id from issued where invoice_number = '002-001-01-00000001'), 'motivo', 'Prueba'),
  '[{"description":"Ajuste","quantity":1,"unit_price":10,"isv_rate":0}]')$cmd$, 'La nota debe emitirse en el punto de venta');
select pg_temp.expect_error($cmd$select * from public.create_manual_invoice_with_items(
  '{"invoice_type":"Factura","cliente_id":"be261000-0000-4000-8000-000000000001","point_of_sale":"Otra empresa"}',
  '[{"description":"Prueba","quantity":1,"unit_price":10,"isv_rate":0}]')$cmd$, 'punto de venta configurado');
select pg_temp.expect_error($cmd$update public.company_settings set billing_points_of_sale = array['San Pedro Sula'] where tenant_id = 'be260000-0000-4000-8000-000000000100'$cmd$, 'No puedes quitar o renombrar');
select pg_temp.expect_error($cmd$insert into public.cai_ranges(cai, point_of_sale, rango_desde, rango_hasta, fecha_limite_emision) values ('TEST', 'Otra', '003-001-01-00000001', '003-001-01-00000100', current_date + 30)$cmd$, 'no está configurado');

select public.activate_cai_range('be262000-0000-4000-8000-000000000004');
select pg_temp.assert_true((select is_active from public.cai_ranges where id = 'be262000-0000-4000-8000-000000000002'), 'Rotar SPS no desactiva TGU');
select pg_temp.assert_true((select next_number = 2 from public.cai_ranges where id = 'be262000-0000-4000-8000-000000000002'), 'Rotar SPS no altera correlativo TGU');
select pg_temp.assert_true((select not is_active and next_number = 3 from public.cai_ranges where id = 'be262000-0000-4000-8000-000000000001'), 'CAI SPS anterior conserva consumo');

update public.clientes set billing_office_id='be263000-0000-4000-8000-000000000002' where id='be261000-0000-4000-8000-000000000001';
-- Exhaustion is a fixture state, not an application permission to edit counters.
reset role;
update public.cai_ranges set next_number = range_end + 1 where id = 'be262000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.expect_error($cmd$select * from public.create_manual_invoice_with_items(
  '{"invoice_type":"Factura","cliente_id":"be261000-0000-4000-8000-000000000001","point_of_sale":"Tegucigalpa"}',
  '[{"description":"Prueba","quantity":1,"unit_price":10,"isv_rate":0}]')$cmd$, 'agotado');
update public.clientes set billing_office_id='be263000-0000-4000-8000-000000000001' where id='be261000-0000-4000-8000-000000000001';
insert into issued select * from public.create_manual_invoice_with_items(
  '{"invoice_type":"Factura","cliente_id":"be261000-0000-4000-8000-000000000001","point_of_sale":"San Pedro Sula"}',
  '[{"description":"SPS sigue operando","quantity":1,"unit_price":10,"isv_rate":0}]');
select pg_temp.assert_true(exists(select 1 from issued where invoice_number = '001-001-01-00000150'), 'Agotar TGU no bloquea SPS y respeta próximo correlativo registrado');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.get_billing_points_of_sale()', 'execute'), 'No expone oficinas sin autenticación');
rollback;

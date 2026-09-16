\set ON_ERROR_STOP on
\o /dev/null
begin;
create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end; $$;
create or replace function pg_temp.expect_error(command text, expected_state text, expected_message text default null)
returns void language plpgsql as $$ declare actual_state text; actual_message text; begin
  begin execute command;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected %, got % for %', expected_state, actual_state, command;
  end if;
  if expected_message is not null and position(expected_message in coalesce(actual_message, '')) = 0 then
    raise exception 'Unexpected message: %', actual_message;
  end if;
end; $$;

insert into auth.users(id, aud, role, email, raw_user_meta_data) values
('7f000000-0000-0000-0000-000000000001','authenticated','authenticated','integral-admin@test.local','{}'),
('7f000000-0000-0000-0000-000000000002','authenticated','authenticated','integral-sales@test.local','{}'),
('7f000000-0000-0000-0000-000000000003','authenticated','authenticated','integral-client@test.local','{}'),
('7f000000-0000-0000-0000-000000000004','authenticated','authenticated','integral-ops@test.local','{}');
update public.profiles set status = 'Aprobado', is_active = true,
rol = case id when '7f000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
when '7f000000-0000-0000-0000-000000000002' then 'Ventas'::public.user_role
when '7f000000-0000-0000-0000-000000000004' then 'Operaciones'::public.user_role
else 'Cliente'::public.user_role end
where id::text like '7f000000-%';
insert into public.clientes(id, nombre, rtn, direccion, email_1) values
('7f100000-0000-0000-0000-000000000001','Cliente integral','08011999123456','Tegucigalpa','integral@test.local');
insert into public.quotations(id, cliente_id, created_by, quotation_number, status, service_product, quote_type, tipo_transporte, commodity) values
('7f200000-0000-0000-0000-000000000001','7f100000-0000-0000-0000-000000000001','7f000000-0000-0000-0000-000000000002','Q-INT-LCL','Ganada','miami_lcl','LCL','Marítimo','Carga'),
('7f200000-0000-0000-0000-000000000002','7f100000-0000-0000-0000-000000000001','7f000000-0000-0000-0000-000000000002','Q-INT-AIR','Ganada','miami_air','Consolidado','Aéreo','Carga'),
('7f200000-0000-0000-0000-000000000003','7f100000-0000-0000-0000-000000000001','7f000000-0000-0000-0000-000000000002','Q-INT-FCL','Ganada','other_origin_fcl','FCL','Marítimo','Carga'),
('7f200000-0000-0000-0000-000000000004','7f100000-0000-0000-0000-000000000001','7f000000-0000-0000-0000-000000000002','Q-INT-EDIT','Borrador','miami_lcl','LCL','Marítimo','Original');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7f000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select public.save_quotation_edit('7f200000-0000-0000-0000-000000000004','Borrador',
  '{"commodity":"Guardada","contact_name":"Contacto correcto","peso_lbs":20,"total_sale":100}',
  false,'[]',true,'[{"package_type":"Caja","quantity":2,"weight_lbs":10,"ft3":1,"cbm":0.0283}]',
  true,'[{"description":"Flete Miami","quantity":1,"sale_amount":100,"cost_amount":50}]',true);
select pg_temp.assert_true((select commodity = 'Guardada' and contact_name = 'Contacto correcto' and status = 'Pendiente de Fijar Precios'
  from public.quotations where id = '7f200000-0000-0000-0000-000000000004'),'header + status saved');
select pg_temp.assert_true((select count(*) = 1 from public.quotation_cargo_lines where quotation_id = '7f200000-0000-0000-0000-000000000004'),'cargo saved');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('7f200000-0000-0000-0000-000000000004','Pendiente de Fijar Precios',
  '{"commodity":"Must rollback","total_sale":999}',false,'[]',true,'[{"package_type":"Caja","quantity":4}]',
  true,'[{"description":"Bad pricing","quantity":-1}]',false)$cmd$,'P0001');
select pg_temp.assert_true((select commodity = 'Guardada' and total_sale = 100 from public.quotations where id = '7f200000-0000-0000-0000-000000000004'),'rollback header');
select pg_temp.assert_true((select quantity = 2 from public.quotation_cargo_lines where quotation_id = '7f200000-0000-0000-0000-000000000004'),'rollback cargo');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('7f200000-0000-0000-0000-000000000004','Borrador','{}')$cmd$,'40001');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('7f200000-0000-0000-0000-000000000004','Pendiente de Fijar Precios','{"created_by":"7f000000-0000-0000-0000-000000000001"}')$cmd$,'23514');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('7f200000-0000-0000-0000-000000000001','Ganada','{}',false,'[]',false,'[]',false,'[]',true)$cmd$,'23514');

select set_config('request.jwt.claims','{"sub":"7f000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000001');
select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000001');
select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000002');
select pg_temp.assert_true((select count(*) = 2 from public.shipments where quotation_id in ('7f200000-0000-0000-0000-000000000001','7f200000-0000-0000-0000-000000000002')),'Miami creates exactly one shipment per default key');
select pg_temp.expect_error($cmd$select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000003')$cmd$,'23514');
insert into public.agent_quotes(quotation_id, agente_nombre, carrier, is_selected)
values ('7f200000-0000-0000-0000-000000000003','Agente integral','Naviera FCL',true);
select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000003');
select pg_temp.assert_true((select carrier = 'Naviera FCL' from public.shipping_instructions where quotation_id = '7f200000-0000-0000-0000-000000000003'),'non-Miami retains selected carrier');
select pg_temp.expect_error($cmd$select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000004')$cmd$,'23514');
select pg_temp.expect_error($cmd$insert into public.cai_ranges(cai,rango_desde,rango_hasta,fecha_limite_emision,is_active) values ('INT-BAD','000-001-01-00000001','000-001-01-00000100','20260-09-14',false)$cmd$,'23514');
select pg_temp.expect_error($cmd$insert into public.cai_ranges(cai,rango_desde,rango_hasta,fecha_limite_emision,is_active) values ('INT-BAD','000-001-01-00000001','000-001-01-00000100','infinity',false)$cmd$,'23514');
insert into public.cai_ranges(id,cai,rango_desde,rango_hasta,fecha_limite_emision,is_active) values
('7f300000-0000-0000-0000-000000000001','INT-VALID','000-001-01-00000001','000-001-01-00000100','2028-02-29',false);
select pg_temp.expect_error($cmd$update public.cai_ranges set fecha_limite_emision = '20260-09-14' where id = '7f300000-0000-0000-0000-000000000001'$cmd$,'23514');

-- Simular únicamente en esta transacción local un rango histórico corrupto.
reset role;
update public.cai_ranges set is_active = false where is_active and document_type = 'Factura';
alter table public.cai_ranges disable trigger guard_cai_calendar_date;
update public.cai_ranges set fecha_limite_emision = '20260-09-14', is_active = true where id = '7f300000-0000-0000-0000-000000000001';
alter table public.cai_ranges enable trigger guard_cai_calendar_date;
set local role authenticated;
select pg_temp.expect_error($cmd$select public.create_invoice_with_items(
jsonb_build_object('invoice_type','Factura','cliente_id','7f100000-0000-0000-0000-000000000001','issue_date',current_date,'currency','USD','exchange_rate',25.3),
'[{"description":"Servicio","quantity":1,"unit_price":100,"isv_rate":0}]')$cmd$,'23514','fecha límite del CAI');
select pg_temp.assert_true((select next_number = 1 from public.cai_ranges where id = '7f300000-0000-0000-0000-000000000001'),'failed invoice does not consume number');
update public.cai_ranges set is_active = false where id = '7f300000-0000-0000-0000-000000000001';
select pg_temp.expect_error($cmd$select public.activate_cai_range('7f300000-0000-0000-0000-000000000001')$cmd$,'23514');
update public.cai_ranges set fecha_limite_emision = current_date + 30 where id = '7f300000-0000-0000-0000-000000000001';
select public.activate_cai_range('7f300000-0000-0000-0000-000000000001');
select public.create_invoice_with_items(
jsonb_build_object('invoice_type','Factura','cliente_id','7f100000-0000-0000-0000-000000000001','issue_date',current_date,'currency','USD','exchange_rate',25.3),
'[{"description":"Servicio","quantity":1,"unit_price":100,"isv_rate":0}]');
select pg_temp.assert_true((select next_number = 2 from public.cai_ranges where id = '7f300000-0000-0000-0000-000000000001'),'valid date can issue and consume one number');

select set_config('request.jwt.claims','{"sub":"7f000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
insert into public.garantias_navieras(id,naviera,monto,moneda,fecha_deposito,created_by)
values ('7f400000-0000-0000-0000-000000000001','Naviera local',100,'USD',current_date,auth.uid());
select pg_temp.assert_true((select count(*) = 1 from public.garantias_navieras where id = '7f400000-0000-0000-0000-000000000001'),'operations can read guarantee');
update public.garantias_navieras set status = 'Recuperada', fecha_recuperacion = current_date where id = '7f400000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select status = 'Recuperada' from public.garantias_navieras where id = '7f400000-0000-0000-0000-000000000001'),'operations can recover guarantee');
select set_config('request.jwt.claims','{"sub":"7f000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*) = 0 from public.garantias_navieras where id = '7f400000-0000-0000-0000-000000000001'),'client cannot read guarantee');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('7f200000-0000-0000-0000-000000000004','Pendiente de Fijar Precios','{}')$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.create_shipment_from_quotation('7f200000-0000-0000-0000-000000000001')$cmd$,'42501');
rollback;
\o
\echo 'Integral SQL: assertions passed; transaction rolled back.'

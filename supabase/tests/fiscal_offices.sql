\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_error(command text, expected text)
returns void language plpgsql as $$ begin
  begin execute command; exception when others then
    if position(expected in sqlerrm)>0 then return; end if; raise;
  end; raise exception 'Expected error: %',expected;
end $$;
insert into public.tenants(id,slug,name) values
('be270000-0000-4000-8000-000000000100','fiscal27','Empresa prueba'),
('be270000-0000-4000-8000-000000000200','fiscal27-other','Empresa ajena');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('be270000-0000-4000-8000-000000000001','authenticated','authenticated','fiscal27@test.local','{}');
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,
tenant_id='be270000-0000-4000-8000-000000000100'
where id='be270000-0000-4000-8000-000000000001';
insert into public.company_settings(tenant_id,legal_name,rtn,address,billing_points_of_sale) values
('be270000-0000-4000-8000-000000000100','Empresa prueba','08019999123456','Domicilio matriz',array['SPS','TGU']);
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values
('be270100-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000100','SPS','Dirección SPS','11111111','sps@test.local','001','001'),
('be270100-0000-4000-8000-000000000002','be270000-0000-4000-8000-000000000100','TGU','Dirección TGU','22222222','tgu@test.local','002','001'),
('be270100-0000-4000-8000-000000000003','be270000-0000-4000-8000-000000000200','Otra','Otra','','','003','001');
insert into public.clientes(id,nombre,rtn,condicion_pago,tenant_id,billing_office_id) values
('be270200-0000-4000-8000-000000000001','Cliente TGU','08019999123456','Contado','be270000-0000-4000-8000-000000000100','be270100-0000-4000-8000-000000000002'),
('be270200-0000-4000-8000-000000000002','Sin oficina','08019999123456','Contado','be270000-0000-4000-8000-000000000100',null);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=2 from public.billing_offices),'Solo oficinas propias');
select pg_temp.expect_error($c$update public.clientes set billing_office_id='be270100-0000-4000-8000-000000000003' where id='be270200-0000-4000-8000-000000000001'$c$,'foreign key');
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values
('be270300-0000-4000-8000-000000000001','TEST-TGU','TGU','Factura','002-001-01-00000001','002-001-01-00000100',current_date+30,false,null),
('be270300-0000-4000-8000-000000000002','TEST-TGU-NC','TGU','Nota de Crédito','002-001-06-00000001','002-001-06-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000001');
select public.activate_cai_range('be270300-0000-4000-8000-000000000002');
select pg_temp.expect_error($c$insert into public.cai_ranges(cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision)
values('TEST','TGU','Nota de Crédito','002-001-02-00000001','002-001-02-00000100',current_date+30)$c$,'Formato SAR');
select pg_temp.expect_error($c$select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000002","currency":"HNL"}',
'[{"description":"Servicio","quantity":1,"unit_price":100,"isv_rate":15}]')$c$,'Asigna una oficina');
select pg_temp.expect_error($c$select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","point_of_sale":"SPS"}',
'[{"description":"Servicio","quantity":1,"unit_price":100,"isv_rate":15}]')$c$,'oficina asignada');
create temporary table issued on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
'[{"description":"Servicio","quantity":1,"unit_price":100,"isv_rate":15}]');
select pg_temp.assert_true((select invoice_number='002-001-01-00000001' from issued),'CAI asignado del cliente');
select pg_temp.assert_true((select total=115 and issuer_snapshot->>'phone'='22222222' and issuer_snapshot->>'address'='Dirección TGU'
from public.invoices where id=(select invoice_id from issued)),'Snapshot e importes');
update public.billing_offices set phone='33333333',address='Nueva dirección' where id='be270100-0000-4000-8000-000000000002';
update public.clientes set billing_office_id='be270100-0000-4000-8000-000000000001' where id='be270200-0000-4000-8000-000000000001';
select pg_temp.assert_true((select issuer_snapshot->>'phone'='22222222' from public.invoices where id=(select invoice_id from issued)),'Reconfigurar no cambia histórico');
select pg_temp.expect_error($c$update public.invoices set issuer_snapshot='{}' where id=(select invoice_id from issued)$c$,'flujo autorizado');
insert into issued select * from public.create_manual_invoice_with_items(
jsonb_build_object('invoice_type','Nota de Crédito','cliente_id','be270200-0000-4000-8000-000000000001',
'currency','HNL','parent_invoice_id',(select invoice_id from issued limit 1),'motivo','Ajuste'),
'[{"description":"Ajuste","quantity":1,"unit_price":10,"isv_rate":15}]');
select pg_temp.assert_true(exists(select 1 from issued where invoice_number='002-001-06-00000001'),'NC conserva oficina original');
select pg_temp.assert_true(not has_table_privilege('anon','public.billing_offices','SELECT'),'Anon sin oficinas');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set rol='Ventas' where id='be270000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.expect_error($c$insert into public.billing_offices(name) values('No permitido')$c$,'row-level security');
rollback;

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
-- The CAI setup persona is explicitly designated; financial roles alone cannot configure CAI.
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) select tenant_id,id,'Despliegue autorizado' from public.profiles where id='be270000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=2 from public.billing_offices),'Solo oficinas propias');
select pg_temp.expect_error($c$update public.clientes set billing_office_id='be270100-0000-4000-8000-000000000003' where id='be270200-0000-4000-8000-000000000001'$c$,'foreign key');
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values
('be270300-0000-4000-8000-000000000001','TEST-TGU','TGU','Factura','002-001-01-00000001','002-001-01-00000100',current_date+30,false,null),
('be270300-0000-4000-8000-000000000002','TEST-TGU-NC','TGU','Nota de Crédito','002-001-06-00000001','002-001-06-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000001');
select public.activate_cai_range('be270300-0000-4000-8000-000000000002');

insert into storage.objects(bucket_id,name) values('fiscal-support','be270000-0000-4000-8000-000000000100/oc.pdf');
create temporary table exonerated on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exonerada","orden_compra_exenta":"OCE-TEST","no_constancia_exonerado":"REG-TEST","exoneration_documents":[{"path":"be270000-0000-4000-8000-000000000100/oc.pdf"}],"reference_equivalence":{"currency":"USD","rate":25,"operation":"divide"}}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":15},{"description":"Servicio","quantity":1,"unit_price":50,"isv_rate":18}]');
select pg_temp.assert_true((select total=150 and tax_amount=0 and importe_exonerado=150 and importe_exento=0
  and (reference_equivalence->>'amount')::numeric=6 from public.invoices where id=(select invoice_id from exonerated)),'Exoneración y equivalencia persistidas');
select pg_temp.assert_true((select bool_and(isv_rate=0 and tax_treatment='Exonerada') from public.invoice_items where invoice_id=(select invoice_id from exonerated)),'Líneas sin ISV');
select pg_temp.expect_error($c$select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exonerada"}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":15}]')$c$,'Completa OCE');
select pg_temp.expect_error($c$select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","reference_equivalence":{"currency":"USD","rate":0,"operation":"divide"}}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":15}]')$c$,'Equivalencia inválida');
create temporary table converted_amount on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","conversion":{"source_currency":"USD","rate":25,"operation":"multiply"}}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":0}]');
select pg_temp.assert_true((select total=2500 and conversion_snapshot->>'source_currency'='USD' from public.invoices where id=(select invoice_id from converted_amount)),'Conversión explícita conserva origen');
create temporary table proforma on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Proforma","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exenta"}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":0}]');
update public.invoices set status='Aprobada' where id=(select invoice_id from proforma);
select * from public.register_invoice_payment_v2((select invoice_id from proforma),40,'HNL',current_date,'No aplica','TGU','Transferencia','TEST');
create temporary table final_invoice on commit drop as select public.convert_proforma_to_invoice((select invoice_id from proforma),'{"fiscal_mode":"Exenta"}') as id;
select pg_temp.assert_true((select public.convert_proforma_to_invoice((select invoice_id from proforma),'{"fiscal_mode":"Exenta"}')=id from final_invoice),'Conversión idempotente');
select pg_temp.assert_true((select count(*)=1 and sum(amount)=40 from public.invoice_payments where invoice_id=(select id from final_invoice) and original_proforma_id=(select invoice_id from proforma)),'Anticipo trasladado una vez');
select pg_temp.assert_true((select balance=60 from public.invoice_receivables where invoice_id=(select id from final_invoice)),'Saldo factura final');
select pg_temp.expect_error($c$select * from public.register_invoice_payment_v2((select invoice_id from proforma),10,'HNL',current_date,'No aplica','TGU','Transferencia','TEST2')$c$,'proforma ya se convirtió');
select pg_temp.expect_error($c$update public.invoices set total=1 where id=(select id from final_invoice)$c$,'flujo autorizado');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.create_invoice_with_items(jsonb,jsonb)','EXECUTE'),'No entrada sin validar origen');
rollback;

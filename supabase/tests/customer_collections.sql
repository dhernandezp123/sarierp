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

insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values
('be270300-0000-4000-8000-000000000003','TEST-TGU-ND','TGU','Nota de Débito','002-001-07-00000001','002-001-07-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000003');
create temporary table first_invoice on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exenta"}',
'[{"description":"Servicio A","quantity":1,"unit_price":100,"isv_rate":0}]');
create temporary table second_invoice on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exenta"}',
'[{"description":"Servicio B","quantity":1,"unit_price":100,"isv_rate":0}]');
update public.invoices set status='Aprobada' where id in(select invoice_id from first_invoice union all select invoice_id from second_invoice);
create temporary table debit_note on commit drop as select * from public.create_manual_invoice_with_items(
jsonb_build_object('invoice_type','Nota de Débito','cliente_id','be270200-0000-4000-8000-000000000001','currency','HNL','fiscal_mode','Exenta',
'parent_invoice_id',(select invoice_id from first_invoice),'motivo','Servicio adicional'),
'[{"description":"Servicio adicional","quantity":1,"unit_price":50,"isv_rate":0}]');
update public.invoices set status='Aprobada' where id=(select invoice_id from debit_note);
create temporary table receipt on commit drop as select public.register_customer_receipt('be270400-0000-4000-8000-000000000001',
'be270200-0000-4000-8000-000000000001',180,'HNL',current_date,'Transferencia','REF-TEST','',
jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from first_invoice),'amount',60),
jsonb_build_object('document_id',(select invoice_id from debit_note),'amount',30),
jsonb_build_object('document_id',(select invoice_id from second_invoice),'amount',40))) as id;
select pg_temp.assert_true((select applied_amount=130 and unapplied_amount=50 from public.customer_receipt_balances where id=(select id from receipt)),'Remanente explícito');
select pg_temp.assert_true((select balance=40 from public.customer_document_balances where id=(select invoice_id from first_invoice)),'Factura parcial 40');
select pg_temp.assert_true((select balance=20 from public.customer_document_balances where id=(select invoice_id from debit_note)),'ND parcial 20');
select pg_temp.assert_true((select balance=60 from public.invoice_receivables where invoice_id=(select invoice_id from first_invoice)),'Agregado sin doble ND');
select pg_temp.assert_true((select sum(debit-credit)=70 from public.customer_movements),'Estado cliente descuenta el recibo completo una vez');
select pg_temp.assert_true((select count(*)=1 from public.customer_movements where receipt_id=(select id from receipt)),'Recibo una sola entrada');
select pg_temp.assert_true(public.register_customer_receipt('be270400-0000-4000-8000-000000000001','be270200-0000-4000-8000-000000000001',180,'HNL',current_date,'Transferencia','REF-TEST','','[]')=(select id from receipt),'Reintento no duplica cobro');
select pg_temp.expect_error($c$select public.allocate_customer_receipt((select id from receipt),'be270400-0000-4000-8000-000000000002',
jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from debit_note),'amount',21)))$c$,'saldo insuficiente');
select pg_temp.assert_true((select unapplied_amount=50 from public.customer_receipt_balances where id=(select id from receipt)),'Error conserva anticipo');
select public.allocate_customer_receipt((select id from receipt),'be270400-0000-4000-8000-000000000002',
jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from second_invoice),'amount',50)));
select pg_temp.assert_true((select unapplied_amount=0 from public.customer_receipt_balances where id=(select id from receipt)),'Anticipo aplicado');
select pg_temp.assert_true((select sum(debit-credit)=70 from public.customer_movements),'Aplicar anticipo no cobra otra vez');
create temporary table credit_note on commit drop as select * from public.create_manual_invoice_with_items(
jsonb_build_object('invoice_type','Nota de Crédito','cliente_id','be270200-0000-4000-8000-000000000001','currency','HNL','fiscal_mode','Exenta',
'parent_invoice_id',(select invoice_id from first_invoice),'motivo','Descuento'),
'[{"description":"Descuento","quantity":1,"unit_price":50,"isv_rate":0}]');
update public.invoices set status='Aprobada' where id=(select invoice_id from credit_note);
select pg_temp.assert_true((select balance=0 from public.customer_document_balances where id=(select invoice_id from first_invoice)),'NC reduce factura');
select pg_temp.assert_true((select balance=10 from public.customer_document_balances where id=(select invoice_id from debit_note)),'NC excedente reduce ND sin perder su pago');
select pg_temp.assert_true((select sum(balance)=20 from public.customer_document_balances),'Saldos conciliados');
select pg_temp.assert_true((select sum(balance)=20 from public.finance_documents_at('receivable',current_date)),'Corte financiero no duplica ND y conserva pagos dirigidos');
select pg_temp.assert_true((select balance=10 from public.finance_documents_at('receivable',current_date) where id=(select invoice_id from debit_note)),'NC excedente respeta el abono reservado a la ND');
select pg_temp.assert_true((select sum(debit-credit)=20 from public.customer_movements),'NC incluida en estado');
select pg_temp.expect_error($c$select * from public.reverse_invoice_payment((select id from public.invoice_payments where receipt_id=(select id from receipt) limit 1),'Prueba')$c$,'recibo completo');
select public.reverse_customer_receipt((select id from receipt),'Reverso de prueba');
select pg_temp.assert_true((select count(*)=4 from public.invoice_payments where receipt_id=(select id from receipt) and status='Reversado'),'Reverso atómico de aplicaciones');
select pg_temp.assert_true((select sum(debit-credit)=200 from public.customer_movements),'Reverso restaura saldo');
select pg_temp.assert_true((select sum(balance)=200 from public.customer_document_balances),'Documentos restauran saldo');
select pg_temp.expect_error($c$insert into public.customer_movements(tenant_id) values(public.current_tenant_id())$c$,'permission denied');
-- Exonerar una proforma ya pagada libera el ISV como anticipo, sin otro cobro.
insert into storage.objects(bucket_id,name) values('fiscal-support','be270000-0000-4000-8000-000000000100/oc.pdf');
create temporary table prepaid_proforma on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Proforma","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":15}]');
update public.invoices set status='Aprobada' where id=(select invoice_id from prepaid_proforma);
select * from public.register_invoice_payment_v2((select invoice_id from prepaid_proforma),115,'HNL',current_date,'No aplica','TGU','Transferencia','ADVANCE');
create temporary table prepaid_final on commit drop as select public.convert_proforma_to_invoice((select invoice_id from prepaid_proforma),
'{"fiscal_mode":"Exonerada","orden_compra_exenta":"OCE-TEST","no_constancia_exonerado":"REG-TEST","exoneration_documents":[{"path":"be270000-0000-4000-8000-000000000100/oc.pdf"}]}') as id;
select pg_temp.assert_true((select total=100 and tax_amount=0 and status='Pagada' from public.invoices where id=(select id from prepaid_final)),'Factura exonerada final pagada');
select pg_temp.assert_true((select amount=115 and unapplied_amount=15 and applied_amount=100 from public.customer_receipt_balances where origin_payment_id is not null),'ISV anticipado disponible');
select pg_temp.assert_true((select sum(debit-credit)=185 from public.customer_movements),'No se duplica el ingreso al reclasificar anticipo');
select pg_temp.assert_true((select balance=0 from public.customer_document_balances where id=(select id from prepaid_final)),'Factura final conserva aplicaciones');
select pg_temp.assert_true(public.convert_proforma_to_invoice((select invoice_id from prepaid_proforma),'{}')=(select id from prepaid_final),'Conversión con remanente idempotente');
reset role;
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('be270000-0000-4000-8000-000000000002','authenticated','authenticated','fiscal27other@test.local','{}');
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,tenant_id='be270000-0000-4000-8000-000000000200' where id='be270000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.customer_movements),'Historial aislado por tenant');
select pg_temp.assert_true((select count(*)=0 from public.customer_receipts),'Recibos aislados por tenant');
select pg_temp.expect_error($c$select public.reverse_customer_receipt((select id from receipt),'Ajeno')$c$,'no disponible');
rollback;

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

select public.import_accounting_accounts('[
{"code":"1","name":"Activos","kind":"Activo","postable":false},
{"code":"1101","name":"Bancos","kind":"Activo","parent_code":"1"},
{"code":"1102","name":"Clientes","kind":"Activo","parent_code":"1"},
{"code":"1103","name":"ISV crédito","kind":"Activo","parent_code":"1"},
{"code":"2101","name":"Proveedores","kind":"Pasivo"},
{"code":"2102","name":"Anticipos clientes","kind":"Pasivo"},
{"code":"2103","name":"ISV débito","kind":"Pasivo"},
{"code":"4101","name":"Servicios","kind":"Ingreso"},
{"code":"5101","name":"Compras","kind":"Gasto"}]');
select pg_temp.expect_error($c$select public.import_accounting_accounts('[{"code":"999","name":"Temporal","kind":"Activo"},{"code":"1101","name":"Repetida","kind":"Activo"}]')$c$,'duplicate key');
select pg_temp.assert_true(not exists(select 1 from public.accounting_accounts where code='999'),'Importación atómica');
select public.manage_accounting_period(current_date-1,current_date-1);
select public.manage_accounting_period(current_date,current_date);
select pg_temp.expect_error($c$select public.manage_accounting_period(current_date-1,current_date)$c$,'límites');
select public.save_accounting_settings(true,current_date-1,(select jsonb_object_agg(purpose,id) from (select id,case code
when '1101' then 'cash' when '1102' then 'receivable' when '1103' then 'purchase_tax' when '2101' then 'payable'
when '2102' then 'customer_advances' when '2103' then 'sales_tax' when '4101' then 'sales' when '5101' then 'purchases' end purpose
from public.accounting_accounts where postable) a));
select public.save_accounting_account('{"code":"5102","name":"Aseo de jardín","kind":"Gasto"}');
select public.save_accounting_account('{"code":"4102","name":"Flete marítimo","kind":"Ingreso"}');
select public.save_accounting_account('{"code":"2104","name":"Retenciones por pagar","kind":"Pasivo"}');
select public.save_accounting_settings(true,current_date-1,jsonb_build_object('withholding_payable',(select id from public.accounting_accounts where code='2104')));
insert into public.proveedores(id,tenant_id,nombre,tipo,rtn,moneda) values('be270600-0000-4000-8000-000000000001',public.current_tenant_id(),'Proveedor prueba','Otro','08019999123456','HNL');
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values
('be270300-0000-4000-8000-000000000004','TEST-TGU-BOLETA','TGU','Boleta de Compra','002-001-11-00000001','002-001-11-00000100',current_date+30,false,null),
('be270300-0000-4000-8000-000000000005','TEST-TGU-RET','TGU','Comprobante de Retención','002-001-05-00000001','002-001-05-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000004');
select public.activate_cai_range('be270300-0000-4000-8000-000000000005');
create temporary table purchase as select public.create_purchase_document('be270700-0000-4000-8000-000000000001',
jsonb_build_object('document_type','Boleta de Compra','supplier_id','be270600-0000-4000-8000-000000000001','office_id','be270100-0000-4000-8000-000000000002','currency','HNL','issue_date',current_date,'supplier_identity','08019999123456','supplier_address','Domicilio prueba','supplier_phone','22222222'),
jsonb_build_array(jsonb_build_object('description','Servicio','quantity',1,'unit_price',100,'tax_rate',15,'tax_credit',false,'account_id',(select id from public.accounting_accounts where code='5101')),
jsonb_build_object('description','Jardín','quantity',1,'unit_price',50,'tax_rate',0,'account_id',(select id from public.accounting_accounts where code='5102')))) as id;
select pg_temp.assert_true((select document_number='002-001-11-00000001' and total=165 and issuer_snapshot->>'phone'='22222222' from public.purchase_documents where id=(select id from purchase)),'Boleta con CAI y oficina propia');
select pg_temp.assert_true((select sum(debit)=50 from public.journal_lines where account_code='5102'),'Gasto jardín a su cuenta');
select pg_temp.assert_true(not exists(select 1 from public.journal_lines where account_code='1103'),'Boleta no genera ISV acreditable');
create temporary table retention as select public.create_withholding_document('be270700-0000-4000-8000-000000000002',
(select payable_id from public.purchase_documents where id=(select id from purchase)),'be270100-0000-4000-8000-000000000002',current_date,
'[{"description":"Concepto de retención de prueba","base":100,"rate":1}]') as id;
select pg_temp.assert_true((select document_number='002-001-05-00000001' and total=1 from public.withholding_documents where id=(select id from retention)),'Retención usa su propio CAI');
select pg_temp.assert_true((select pending_balance=164 from public.supplier_payable_balances where id=(select payable_id from public.purchase_documents where id=(select id from purchase))),'Retención reduce CxP');
select pg_temp.assert_true((select sum(credit)=1 from public.journal_lines where account_code='2104'),'Retención acredita pasivo fiscal');
select pg_temp.assert_true(not exists(select 1 from public.journal_lines where account_code='1101'),'Retención no crea salida de caja');
select public.register_supplier_payment((select payable_id from public.purchase_documents where id=(select id from purchase)),
'be270700-0000-4000-8000-000000000003',50,'HNL',current_date,'Transferencia','PAY-TEST','');
select pg_temp.assert_true((select sum(credit)=50 from public.journal_lines where account_code='1101'),'Pago de compra contabilizado');
create temporary table invoice as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
jsonb_build_array(jsonb_build_object('description','Flete marítimo','quantity',1,'unit_price',100,'isv_rate',15,'income_account_id',(select id from public.accounting_accounts where code='4102'))));
update public.invoices set status='Aprobada' where id=(select invoice_id from invoice);
select pg_temp.assert_true((select sum(credit)=100 from public.journal_lines where account_code='4102'),'Ingreso por flete a su cuenta');
create temporary table receipt as select public.register_customer_receipt('be270700-0000-4000-8000-000000000004','be270200-0000-4000-8000-000000000001',120,'HNL',current_date,'Transferencia','RECEIPT-TEST','',
jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from invoice),'amount',70))) as id;
select pg_temp.assert_true((select sum(credit-debit)=50 from public.journal_lines where account_code='2102'),'Anticipo no aplicado en pasivo');
select pg_temp.assert_true((select sum(debit-credit)=45 from public.journal_lines where account_code='1102'),'CxC contable coincide con documento');
select public.allocate_customer_receipt((select id from receipt),'be270700-0000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from invoice),'amount',45)));
select pg_temp.assert_true((select sum(credit-debit)=5 from public.journal_lines where account_code='2102'),'Remanente contable 5');
select pg_temp.assert_true((select sum(debit-credit)=0 from public.journal_lines where account_code='1102'),'Factura pagada saldo contable cero');
select public.reverse_customer_receipt((select id from receipt),'Corrección prueba');
select pg_temp.assert_true((select sum(credit-debit)=0 from public.journal_lines where account_code='2102'),'Reverso elimina anticipo');
select pg_temp.assert_true((select sum(debit-credit)=115 from public.journal_lines where account_code='1102'),'Reverso restaura CxC');
select pg_temp.expect_error($c$select public.reverse_supplier_payment((select id from public.pagos_proveedor where withholding_document_id=(select id from retention)),'Corrección retención')$c$,'aprobada por Contabilidad');
select public.review_fiscal_void(public.request_fiscal_void('withholding_documents',(select id from retention),gen_random_uuid(),'Corrección retención'),true,'Corrección aprobada de prueba',true);
select pg_temp.assert_true((select status='Anulada' from public.withholding_documents where id=(select id from retention)),'Revertir retención conserva documento anulado');
select pg_temp.assert_true((select sum(credit-debit)=0 from public.journal_lines where account_code='2104'),'Retención reversada en diario');
select pg_temp.expect_error($c$select public.create_purchase_document(gen_random_uuid(),jsonb_build_object('document_type','Boleta de Compra','supplier_id','be270600-0000-4000-8000-000000000001','currency','HNL','issue_date',current_date),jsonb_build_array(jsonb_build_object('description','ISV indebido','quantity',1,'unit_price',100,'tax_rate',15,'tax_credit',true,'account_id',(select id from public.accounting_accounts where code='5101'))))$c$,'no respalda crédito fiscal');
create temporary table supplier_invoice as select public.create_purchase_document(gen_random_uuid(),
jsonb_build_object('document_type','Factura de proveedor','document_number','SUPPLIER-TEST','supplier_id','be270600-0000-4000-8000-000000000001','currency','HNL','source_cai','CAI-SUPPLIER-TEST','issue_date',current_date),
jsonb_build_array(jsonb_build_object('description','Compra con respaldo','quantity',1,'unit_price',100,'tax_rate',15,'tax_credit',true,'account_id',(select id from public.accounting_accounts where code='5101')))) id;
select pg_temp.assert_true((select sum(debit)=15 from public.journal_lines where account_code='1103'),'Factura de proveedor sí admite crédito fiscal explícito');
select pg_temp.expect_error($c$select public.create_purchase_document(gen_random_uuid(),jsonb_build_object('document_type','Factura de proveedor','document_number','SUPPLIER-TEST','supplier_id','be270600-0000-4000-8000-000000000001','currency','HNL','issue_date',current_date),jsonb_build_array(jsonb_build_object('description','Duplicada','quantity',1,'unit_price',1,'tax_rate',0,'account_id',(select id from public.accounting_accounts where code='5101'))))$c$,'Ya existe');

create temporary table discount_invoice as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
'[{"description":"Gravado con descuento","quantity":2,"unit_price":100,"discount_amount":10,"isv_rate":15},{"description":"Exento con descuento","quantity":1,"unit_price":50,"discount_amount":5,"isv_rate":0}]');
select pg_temp.assert_true((select discount_amount=15 and subtotal=235 and total=263.5 and tax_amount=28.5 and importe_exento=45 from public.invoices where id=(select invoice_id from discount_invoice)),'Descuento fiscal guardado en bases e impuestos');
select pg_temp.assert_true((select sum(amount)=235 and sum(discount_amount)=15 from public.invoice_items where invoice_id=(select invoice_id from discount_invoice)),'Precio original y neto de líneas conservados');
update public.invoices set status='Aprobada' where id=(select invoice_id from discount_invoice);
select pg_temp.assert_true((select sum(debit)=263.5 and sum(credit)=263.5 from public.journal_lines l join public.journal_entries e on e.id=l.entry_id where e.source_id=(select invoice_id from discount_invoice)),'Asiento usa total después de descuento');
select pg_temp.expect_error($c$select public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Inválida","quantity":1,"unit_price":100,"discount_amount":101,"isv_rate":15}]')$c$,'Descuento inválido');
create temporary table discount_note as select * from public.create_manual_invoice_with_items(
jsonb_build_object('invoice_type','Nota de Crédito','cliente_id','be270200-0000-4000-8000-000000000001','currency','HNL','parent_invoice_id',(select invoice_id from discount_invoice),'motivo','Descuento comercial'),
'[{"description":"Ajuste","quantity":1,"unit_price":20,"discount_amount":5,"isv_rate":15}]');
select pg_temp.assert_true((select parent_fiscal_snapshot->>'invoice_number'=(select invoice_number from discount_invoice) and parent_fiscal_snapshot->>'cai'='TEST-TGU' and cai='TEST-TGU-NC' and parent_fiscal_snapshot->>'issue_date'=current_date::text and total=17.25 from public.invoices where id=(select invoice_id from discount_note)),'NC congela CAI/fecha/numero original, CAI propio distinto y descuento');
select pg_temp.expect_error($c$update public.invoices set parent_fiscal_snapshot='{}' where id=(select invoice_id from discount_note)$c$,'flujo autorizado');
create temporary table discounted_proforma as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Proforma","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
'[{"description":"Anticipo","quantity":1,"unit_price":100,"discount_amount":10,"isv_rate":15}]');
create temporary table discounted_final as select public.convert_proforma_to_invoice((select invoice_id from discounted_proforma),'{"fiscal_mode":"Exenta"}') id;
select pg_temp.assert_true((select total=90 and discount_amount=10 from public.invoices where id=(select id from discounted_final)),'Conversión de proforma conserva descuento');
create temporary table discounted_purchase as select public.create_purchase_document(gen_random_uuid(),jsonb_build_object('document_type','Factura de proveedor','document_number','DISCOUNT-SUPPLIER','supplier_id','be270600-0000-4000-8000-000000000001','currency','HNL','issue_date',current_date),jsonb_build_array(jsonb_build_object('description','Gasto con descuento','quantity',1,'unit_price',100,'discount_amount',10,'tax_rate',15,'tax_credit',true,'account_id',(select id from public.accounting_accounts where code='5101')))) id;
select pg_temp.assert_true((select total=103.5 and discount_amount=10 and subtotal=90 and tax_amount=13.5 from public.purchase_documents where id=(select id from discounted_purchase)),'Compra guarda descuento antes de ISV');
select pg_temp.assert_true((select sum(l.debit)=103.5 and sum(l.credit)=103.5 from public.journal_lines l join public.journal_entries e on e.id=l.entry_id where e.source_id=(select payable_id from public.purchase_documents where id=(select id from discounted_purchase))),'Compra descontada concilia diario');
create temporary table discounted_conversion as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","conversion":{"source_currency":"USD","rate":25,"operation":"multiply"}}',
'[{"description":"USD con descuento","quantity":2,"unit_price":100,"discount_amount":10,"isv_rate":15}]');
select pg_temp.assert_true((select total=5462.5 and discount_amount=250 and subtotal=4750 from public.invoices where id=(select invoice_id from discounted_conversion)),'Precio y descuento se convierten una vez');
set constraints all immediate;
reset role;
insert into public.quotations(id,cliente_id,created_by,tenant_id,status,financial_validation_status,service_product,quote_type,tipo_transporte)
values('be270800-0000-4000-8000-000000000001','be270200-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000100','Ganada','Pendiente','other_origin_fcl','FCL','Marítimo');
insert into public.pricing_items(id,quotation_id,tenant_id,description,item_type,quantity,cost_amount,sale_amount,total_amount,currency,taxable,tax_rate)
values('be270900-0000-4000-8000-000000000001','be270800-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000100','Flete de prueba','Flete',2,50,100,200,'USD',true,15);
insert into public.shipping_instructions(id,quotation_id,client_id,created_by,tenant_id,operational_status,shipment_status)
values('be270a00-0000-4000-8000-000000000001','be270800-0000-4000-8000-000000000001','be270200-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000100','Finalizado','Finalizado');
update public.shipments set operational_status='Finalizado',closed_at=now() where quotation_id='be270800-0000-4000-8000-000000000001';
insert into public.provider_invoice_items(quotation_id,pricing_item_id,supplier,invoice_number,description,currency,unit_cost,quantity,total_cost,tenant_id)
values('be270800-0000-4000-8000-000000000001','be270900-0000-4000-8000-000000000001','Proveedor ficticio','SUPPLIER-RATE-TEST','Flete de prueba','USD',50,2,100,'be270000-0000-4000-8000-000000000100');
update public.quotations set financial_validation_status='Validado' where id='be270800-0000-4000-8000-000000000001';
set local role authenticated;
create temporary table quote_discount as select * from public.create_invoice_from_quotation(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL","conversion":{"source_currency":"USD","rate":25,"operation":"multiply"},"line_discounts":{"be270900-0000-4000-8000-000000000001":10}}',
'be270800-0000-4000-8000-000000000001');
select pg_temp.assert_true((select total=5462.5 and discount_amount=250 from public.invoices where id=(select invoice_id from quote_discount)),'Cotización usa descuento explícito sin editar su tarifa');
select pg_temp.assert_true((select currency='USD' and sale_amount=100 and quantity=2 from public.pricing_items where id='be270900-0000-4000-8000-000000000001'),'Cotización conserva moneda y precio');
select pg_temp.expect_error($c$select public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Sin importe","quantity":1,"unit_price":100,"discount_amount":100,"isv_rate":15}]')$c$,'importe positivo');
set constraints all immediate;
rollback;

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
do $$begin if (select environment from public.platform_environment where singleton)='demo'
and exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_demo_user') then
 execute $demo$update public.profiles set is_demo_user=true,demo_expires_at=now()+interval '1 day',demo_access_grant_id='be279900-0000-4000-8000-000000000099' where id='be270000-0000-4000-8000-000000000001'$demo$;
end if;end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"be279900-0000-4000-8000-000000000099"}}',true);
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
-- ACC-SERVICE-01: every account, user, service and transaction below is fictitious.
select public.save_accounting_account('{"code":"41991","name":"Servicio duplicado ficticio","kind":"Ingreso","account_level":"Auxiliar"}');
select public.save_accounting_account('{"code":"41992","name":"Servicio duplicado ficticio","kind":"Ingreso","account_level":"Auxiliar"}');
select public.save_accounting_account('{"code":"52991","name":"Costo ficticio de prueba","kind":"Costo","account_level":"Auxiliar"}');
select public.save_accounting_account('{"code":"41990","name":"Mayor no auxiliar de prueba","kind":"Ingreso","account_level":"Mayor"}');
reset role;
insert into public.client_rate_catalog(tenant_id,code,label,category) values
('be270000-0000-4000-8000-000000000100','fixture_docs','Documentación ficticia','origin'),
('be270000-0000-4000-8000-000000000100','other_origin_fcl','Cargo accesorio ficticio','origin');
insert into public.service_products(tenant_id,value,label) values('be270000-0000-4000-8000-000000000100','other_origin_fcl','Familia de flete ficticia') on conflict(tenant_id,value) do update set active=true;
insert into public.accounting_accounts(id,tenant_id,code,name,kind,account_level) values('be279900-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000200','41999','Ingreso ajeno ficticio','Ingreso','Auxiliar');
insert into public.service_accounting_profiles(id,tenant_id,source_kind,source_code,updated_by) values('be279900-0000-4000-8000-000000000002','be270000-0000-4000-8000-000000000200','service','foreign_fixture','be270000-0000-4000-8000-000000000001');
insert into public.proveedores(id,tenant_id,nombre,tipo,rtn,moneda) values('be279900-0000-4000-8000-000000000003','be270000-0000-4000-8000-000000000100','Proveedor ficticio de servicios','Otro','08019999123456','HNL');
set local role authenticated;
create temp table service_input as select jsonb_build_array(
 jsonb_build_object('tax_variant','I','income_applicable',true,'expense_applicable',true,'income_account_id',(select id from public.accounting_accounts where code='41991'),'expense_account_id',null),
 jsonb_build_object('tax_variant','E','income_applicable',true,'expense_applicable',true,'income_account_id',(select id from public.accounting_accounts where code='41992'),'expense_account_id',null),
 jsonb_build_object('tax_variant','Exonerada','income_applicable',true,'expense_applicable',false,'income_account_id',null,'expense_account_id',null)) variants;
select pg_temp.assert_true(public.save_service_accounting('service','fixture_docs',0,(select variants from service_input),'Preparación ficticia con costos pendientes')=1,'First revision');
select pg_temp.assert_true((select count(*)=1 from public.service_accounting_profiles),'RLS hides other tenant profiles');
select pg_temp.assert_true((select count(*)=3 and count(distinct income_account_id)=2 and count(expense_account_id)=0 from public.service_accounting_variants),'I/E independent and no guessed cost or exonerated income');
create temp table service_variant_ids as select id,tax_variant from public.service_accounting_variants;
select pg_temp.expect_error($c$select public.save_service_accounting('service','fixture_docs',0,(select variants from service_input),'Versión vieja')$c$,'recarga');
select pg_temp.expect_error($c$select public.save_service_accounting('service','foreign_fixture',0,'[]','Otro tenant')$c$,'no disponible');
select pg_temp.expect_error($c$select public.save_service_accounting('service','fixture_docs',1,jsonb_set((select variants from service_input),'{0,income_account_id}','"be279900-0000-4000-8000-000000000001"'),'Cuenta ajena')$c$,'auxiliar activa');
select pg_temp.expect_error($c$select public.save_service_accounting('service','fixture_docs',1,jsonb_set((select variants from service_input),'{0,income_account_id}',to_jsonb((select id::text from public.accounting_accounts where code='52991'))),'Naturaleza incorrecta')$c$,'auxiliar activa');
select pg_temp.expect_error($c$select public.save_service_accounting('service','fixture_docs',1,jsonb_set((select variants from service_input),'{0,income_account_id}',to_jsonb((select id::text from public.accounting_accounts where code='41990'))),'Mayor no auxiliar')$c$,'auxiliar activa');
select pg_temp.expect_error($c$select public.save_service_accounting('service','fixture_docs',1,(select variants||jsonb_build_array(variants->0) from service_input),'Duplicada')$c$,'Variantes inválidas');
select pg_temp.expect_error($c$update public.service_accounting_profiles set revision=99$c$,'permission denied');
select pg_temp.expect_error($c$delete from public.service_accounting_variants$c$,'permission denied');
select pg_temp.assert_true((select revision=1 from public.service_accounting_profiles),'Invalid changes are atomic');
select pg_temp.assert_true(not has_function_privilege('anon','public.save_service_accounting(text,text,integer,jsonb,text)','execute') and not has_function_privilege('authenticated','public.resolve_service_account(text,text,text,text)','execute'),'RPC and internal-helper privileges');
reset role;
delete from public.invoice_master_settings where tenant_id='be270000-0000-4000-8000-000000000100';
select set_config('request.jwt.claims','{}',true);
update public.profiles set rol='Admin' where id='be270000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"be279900-0000-4000-8000-000000000099"}}',true);
set local role authenticated;
savepoint admin_service_check;
select pg_temp.assert_true(public.save_service_accounting('service','fixture_docs',1,(select variants from service_input),'Admin sin designacion individual')=2,'Admin administra cuentas de servicios');
rollback to savepoint admin_service_check;
release savepoint admin_service_check;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set rol='Contabilidad' where id='be270000-0000-4000-8000-000000000001';
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) values('be270000-0000-4000-8000-000000000100','be270000-0000-4000-8000-000000000001','Despliegue autorizado');
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"be279900-0000-4000-8000-000000000099"}}',true);
set local role authenticated;
select public.save_service_accounting('product','other_origin_fcl',0,jsonb_build_array((select variants->1 from service_input)),'Familia de flete definida independientemente');
select public.save_service_accounting('service','other_origin_fcl',0,jsonb_build_array((select variants->0 from service_input)),'Cargo homónimo no hereda la familia');
select pg_temp.assert_true((select count(*)=2 from public.service_accounting_profiles where source_code='other_origin_fcl'),'Same code in distinct catalogs stays distinct');
update service_input set variants=jsonb_set(jsonb_set(variants,'{0,expense_account_id}',to_jsonb((select id::text from public.accounting_accounts where code='52991'))),'{1,expense_account_id}',to_jsonb((select id::text from public.accounting_accounts where code='52991')));
select pg_temp.assert_true(public.save_service_accounting('service','fixture_docs',1,(select variants from service_input),'Costo ficticio aprobado')=2,'Master completes partial assignment');
select pg_temp.assert_true(not exists(select 1 from service_variant_ids old left join public.service_accounting_variants current using(id,tax_variant) where current.id is null),'Each variant retains its identity across edits');
create temp table service_invoice as select * from public.create_manual_invoice_with_items(
 '{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
 '[{"description":"Servicio gravado ficticio","quantity":1,"unit_price":100,"isv_rate":15,"service_catalog_kind":"service","service_catalog_code":"fixture_docs"},{"description":"Servicio exento ficticio","quantity":1,"unit_price":50,"isv_rate":0,"service_catalog_kind":"service","service_catalog_code":"fixture_docs"}]');
update public.invoices set status='Aprobada' where id=(select invoice_id from service_invoice);
select pg_temp.assert_true((select count(*)=2 and count(distinct income_account_id)=2 and bool_and(service_catalog_code='fixture_docs') from public.invoice_items where invoice_id=(select invoice_id from service_invoice)),'Invoice freezes exact service and independent account IDs');
select pg_temp.assert_true((select sum(l.credit)=100 from public.journal_lines l join public.accounting_accounts a on a.id=l.account_id join public.journal_entries e on e.id=l.entry_id where e.source_id=(select invoice_id from service_invoice) and a.code='41991'),'Taxable income posts into assigned account');
select pg_temp.assert_true((select sum(l.credit)=50 from public.journal_lines l join public.accounting_accounts a on a.id=l.account_id join public.journal_entries e on e.id=l.entry_id where e.source_id=(select invoice_id from service_invoice) and a.code='41992'),'Exempt income posts into its separate account');
select pg_temp.assert_true((select sum(debit)=165 and sum(credit)=165 from public.journal_lines where entry_id in(select id from public.journal_entries where source_id=(select invoice_id from service_invoice))),'Journal balanced with final taxes');
create temp table service_purchase as select public.create_purchase_document('be279900-0000-4000-8000-000000000004',jsonb_build_object('document_type','Factura de proveedor','supplier_id','be279900-0000-4000-8000-000000000003','currency','HNL','issue_date',current_date,'document_number','TEST-SERVICE-PURCHASE'),
 '[{"description":"Costo ficticio","quantity":1,"unit_price":80,"tax_rate":0,"service_catalog_kind":"service","service_catalog_code":"fixture_docs","service_tax_variant":"E"}]') id;
select pg_temp.assert_true((select items->0->>'account_id'=(select id::text from public.accounting_accounts where code='52991') and items->0->>'service_catalog_code'='fixture_docs' and items->0->>'service_tax_variant'='E' from public.purchase_documents where id=(select id from service_purchase)),'Purchase freezes expense account and exact service variant');
select pg_temp.assert_true((select sum(l.debit)=80 from public.journal_lines l join public.accounting_accounts a on a.id=l.account_id join public.journal_entries e on e.id=l.entry_id where e.source_type='Compra' and a.code='52991'),'Purchase posts assigned cost');
create temp table service_before as select to_jsonb(i) value from public.invoice_items i where invoice_id=(select invoice_id from service_invoice);
select public.save_service_accounting('service','fixture_docs',2,jsonb_set((select variants from service_input),'{0,income_account_id}',to_jsonb((select id::text from public.accounting_accounts where code='41992'))),'Cambio futuro ficticio');
select pg_temp.assert_true(not exists(select 1 from service_before b full join (select to_jsonb(i) value from public.invoice_items i where invoice_id=(select invoice_id from service_invoice))n using(value) where b.value is null or n.value is null),'Changing configuration does not rewrite issued lines');
select public.save_accounting_settings(false,current_date-1,(select jsonb_object_agg(purpose,account_id) from public.accounting_mappings));
create temp table pending_service_invoice as select * from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
 '[{"description":"Servicio con variante pendiente","quantity":1,"unit_price":10,"isv_rate":0,"service_catalog_kind":"service","service_catalog_code":"other_origin_fcl"}]');
update public.invoices set status='Aprobada' where id=(select invoice_id from pending_service_invoice);
select pg_temp.expect_error($c$select public.post_invoice_journal((select invoice_id from pending_service_invoice))$c$,'sin cuenta de ingreso guardada');
select public.save_service_accounting('service','other_origin_fcl',1,(select variants from service_input),'Preparación futura sin reclasificar el documento pendiente');
select pg_temp.assert_true((select income_account_id is null from public.invoice_items where invoice_id=(select invoice_id from pending_service_invoice)),'New mapping cannot retroactively classify a missing invoice snapshot');
select pg_temp.expect_error($c$select public.post_invoice_journal((select invoice_id from pending_service_invoice))$c$,'sin cuenta de ingreso guardada');
select pg_temp.assert_true(not exists(select 1 from public.journal_entries where source_id=(select invoice_id from pending_service_invoice)),'No silent fallback to the global income account');
reset role;
select pg_temp.assert_true(public.resolve_service_account('service','fixture_docs','Exonerada','income') is null,'Exoneration never inherits exempt account');
insert into public.quotations(id,tenant_id,quotation_number,cliente_id,created_by,status,quote_type,service_product) values('be279100-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000100','TEST-SERVICE-QUOTE','be270200-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000001','Borrador','FCL','other_origin_fcl');
insert into public.pricing_items(id,tenant_id,quotation_id,description,quantity,sale_amount,item_type,rate_code,currency) values
('be279100-0000-4000-8000-000000000002','be270000-0000-4000-8000-000000000100','be279100-0000-4000-8000-000000000001','Cargo',1,10,'origin_charge','origin_charge:fixture_docs:id','HNL'),
('be279100-0000-4000-8000-000000000003','be270000-0000-4000-8000-000000000100','be279100-0000-4000-8000-000000000001','Flete',1,10,'freight','fixture_freight','HNL'),
('be279100-0000-4000-8000-000000000004','be270000-0000-4000-8000-000000000100','be279100-0000-4000-8000-000000000001','Cargo desconocido',1,10,'freight','destination_charge:unknown','HNL');
select pg_temp.assert_true(public.pricing_service_reference('be279100-0000-4000-8000-000000000002','be279100-0000-4000-8000-000000000001')->>'service_catalog_code'='fixture_docs','Pricing source resolves exact charge');
select pg_temp.assert_true(public.pricing_service_reference('be279100-0000-4000-8000-000000000003','be279100-0000-4000-8000-000000000001')->>'service_catalog_kind'='product','Only genuine freight uses family');
select pg_temp.assert_true(public.pricing_service_reference('be279100-0000-4000-8000-000000000004','be279100-0000-4000-8000-000000000001')='{}','Unknown accessory never inherits freight family');
update public.accounting_accounts set active=false where tenant_id='be270000-0000-4000-8000-000000000100' and code='41992';
select pg_temp.assert_true(public.resolve_service_account('service','fixture_docs','I','income') is null,'Inactive default is never used');
update public.client_rate_catalog set active=false where tenant_id='be270000-0000-4000-8000-000000000100' and code='fixture_docs';
set local role authenticated;
create temp table explicit_service_invoice as select * from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
 jsonb_build_array(jsonb_build_object('description','Cuenta explícita válida','quantity',1,'unit_price',10,'isv_rate',0,'service_catalog_kind','service','service_catalog_code','fixture_docs','income_account_id',(select id from public.accounting_accounts where code='41991'))));
select pg_temp.assert_true((select income_account_id=(select id from public.accounting_accounts where code='41991') from public.invoice_items where invoice_id=(select invoice_id from explicit_service_invoice)),'Valid explicit snapshot survives stale defaults and a retired concept');
select pg_temp.assert_true((select count(*)=6 and bool_and(user_id='be270000-0000-4000-8000-000000000001') from public.activity_logs where entity_type='service_accounting_profiles'),'All successful changes audited with actual actor');
reset role;
set constraints all immediate;
rollback;

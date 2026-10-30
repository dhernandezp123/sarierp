\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERT: %',m;end if;end $$;
create function pg_temp.reject(c text) returns void language plpgsql as $$begin begin execute c;exception when others then return;end;raise exception 'Expected rejection: %',c;end $$;
insert into public.tenants(id,slug,name) values('5b300000-0000-4000-8000-000000000100','supplier-default-test','Default fixture'),('5b300000-0000-4000-8000-000000000200','supplier-default-other','Other fixture');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('5b300000-0000-4000-8000-000000000001','authenticated','authenticated','supplier-default@test.local','{}');
update public.profiles set rol='Admin',status='Aprobado',is_active=true,tenant_id='5b300000-0000-4000-8000-000000000100' where id='5b300000-0000-4000-8000-000000000001';
do $$begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_demo_user') then execute $d$update public.profiles set is_demo_user=true,demo_expires_at=now()+interval '1 day',demo_access_grant_id='5b309900-0000-4000-8000-000000000099' where id='5b300000-0000-4000-8000-000000000001'$d$;end if;end $$;
insert into public.accounting_accounts(id,tenant_id,code,name,kind,postable,active,account_level) values
('5b301000-0000-4000-8000-000000000001','5b300000-0000-4000-8000-000000000100','G1','Expense 1','Gasto',true,true,'Auxiliar'),
('5b301000-0000-4000-8000-000000000002','5b300000-0000-4000-8000-000000000100','G2','Expense 2','Gasto',true,true,'Auxiliar'),
('5b301000-0000-4000-8000-000000000003','5b300000-0000-4000-8000-000000000100','G3','Cost 3','Costo',true,true,'Auxiliar'),
('5b301000-0000-4000-8000-000000000004','5b300000-0000-4000-8000-000000000200','G4','Foreign','Gasto',true,true,'Auxiliar'),
('5b301000-0000-4000-8000-000000000005','5b300000-0000-4000-8000-000000000100','G5','Grouping','Gasto',false,true,'SubCuenta'),
('5b301000-0000-4000-8000-000000000006','5b300000-0000-4000-8000-000000000100','G6','Income','Ingreso',true,true,'Auxiliar'),
('5b301000-0000-4000-8000-000000000007','5b300000-0000-4000-8000-000000000100','G7','Inactive','Gasto',true,false,'Auxiliar');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
insert into public.proveedores(id,nombre,tipo,moneda,terminos_pago,default_expense_account_id) values('5b302000-0000-4000-8000-000000000001','Supplier fixture','Otro','HNL',0,'5b301000-0000-4000-8000-000000000001');
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000004' where id='5b302000-0000-4000-8000-000000000001'$q$);
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000005' where id='5b302000-0000-4000-8000-000000000001'$q$);
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000006' where id='5b302000-0000-4000-8000-000000000001'$q$);
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000007' where id='5b302000-0000-4000-8000-000000000001'$q$);
create temp table test_results(n text,id uuid);
insert into test_results select 'supplier',public.create_purchase_document('5b303000-0000-4000-8000-000000000001',jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','document_type','Factura de proveedor','document_number','DEFAULT-1','currency','HNL','issue_date',current_date),'[{"description":"Line","quantity":1,"unit_price":10,"tax_rate":0}]');
select pg_temp.ok((select items->0->>'account_id'='5b301000-0000-4000-8000-000000000001' from public.purchase_documents where id=(select id from test_results where n='supplier')),'Supplier default used by server');
insert into test_results select 'document',public.create_purchase_document('5b303000-0000-4000-8000-000000000002',jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','expense_account_id','5b301000-0000-4000-8000-000000000002','document_type','Factura de proveedor','document_number','DEFAULT-2','currency','HNL','issue_date',current_date),'[{"description":"Line","quantity":1,"unit_price":10,"tax_rate":0},{"description":"Override","quantity":1,"unit_price":20,"tax_rate":0,"account_id":"5b301000-0000-4000-8000-000000000003"}]');
select pg_temp.ok((select items->0->>'account_id'='5b301000-0000-4000-8000-000000000002' and items->1->>'account_id'='5b301000-0000-4000-8000-000000000003' from public.purchase_documents where id=(select id from test_results where n='document')),'Document default and line override');
select pg_temp.reject($q$select public.create_purchase_document(gen_random_uuid(),jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','expense_account_id',null,'document_type','Factura de proveedor','document_number','NO-DEFAULT','currency','HNL','issue_date',current_date),'[{"description":"Line","quantity":1,"unit_price":10,"tax_rate":0}]')$q$);
update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000002' where id='5b302000-0000-4000-8000-000000000001';
select pg_temp.ok((select items->0->>'account_id'='5b301000-0000-4000-8000-000000000001' from public.purchase_documents where id=(select id from test_results where n='supplier')),'Supplier edit never rewrites old document');
select pg_temp.ok(public.create_purchase_document('5b303000-0000-4000-8000-000000000001','{}','[]')=(select id from test_results where n='supplier'),'Retry remains idempotent after default changes');
insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,moneda,tipo_cambio,fecha_factura,created_by) values('5b304000-0000-4000-8000-000000000001','5b302000-0000-4000-8000-000000000001','Manual payable',10,'HNL',1,current_date,auth.uid());
select pg_temp.ok((select expense_account_id='5b301000-0000-4000-8000-000000000002' from public.cuentas_pagar where id='5b304000-0000-4000-8000-000000000001'),'Manual payable inherits supplier default');
select pg_temp.ok((select count(*)>=2 from public.activity_logs where entity_type='proveedor' and entity_id='5b302000-0000-4000-8000-000000000001'),'Default changes audited');

-- No identity is required for a purchase slip; its issuer and CAI remain required; supplier contact is optional.
reset role;
insert into public.company_settings(tenant_id,legal_name,rtn,address,billing_points_of_sale) values('5b300000-0000-4000-8000-000000000100','Fixture company','08019999123456','Fiscal address',array['SPS']);
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values('5b305000-0000-4000-8000-000000000001','5b300000-0000-4000-8000-000000000100','SPS','Office address','99990000','office@test.local','001','001');
insert into public.cai_ranges(id,tenant_id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values('5b306000-0000-4000-8000-000000000001','5b300000-0000-4000-8000-000000000100','TEST-OPTIONAL-IDENTITY','SPS','Boleta de Compra','001-001-11-00000001','001-001-11-00000100',current_date+30,false,null);
set local role authenticated;
select public.activate_cai_range('5b306000-0000-4000-8000-000000000001');
create temp table optional_identity_doc as select public.create_purchase_document('5b307000-0000-4000-8000-000000000001',jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','office_id','5b305000-0000-4000-8000-000000000001','document_type','Boleta de Compra','currency','HNL','issue_date',current_date,'supplier_address','Supplier address','supplier_phone','88880000'),'[{"description":"Without identity","quantity":1,"unit_price":10,"tax_rate":0}]') id;
select pg_temp.ok((select supplier_snapshot->>'rtn' is null and document_number='001-001-11-00000001' and issuer_snapshot->>'email'='office@test.local' from public.purchase_documents where id=(select id from optional_identity_doc)),'Purchase slip allows absent identity without inventing an identifier');
create temp table no_contact_doc as select public.create_purchase_document('5b307000-0000-4000-8000-000000000003',jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','office_id','5b305000-0000-4000-8000-000000000001','document_type','Boleta de Compra','currency','HNL','issue_date',current_date),'[{"description":"Without supplier contact","quantity":1,"unit_price":10,"tax_rate":0}]') id;
select pg_temp.ok((select coalesce(supplier_snapshot->>'address','')='' and coalesce(supplier_snapshot->>'phone','')='' and supplier_snapshot->>'rtn' is null and fiscal_snapshot->>'cai'='TEST-OPTIONAL-IDENTITY' from public.purchase_documents where id=(select id from no_contact_doc)),'Purchase slip permits absent supplier contact and retains issuer CAI');
create temp table identity_doc as select public.create_purchase_document('5b307000-0000-4000-8000-000000000002',jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','office_id','5b305000-0000-4000-8000-000000000001','document_type','Boleta de Compra','currency','HNL','issue_date',current_date,'supplier_identity','08011999123456','supplier_address','Supplier address','supplier_phone','88880000'),'[{"description":"With identity","quantity":1,"unit_price":10,"tax_rate":0}]') id;
select pg_temp.ok((select supplier_snapshot->>'rtn'='08011999123456' from public.purchase_documents where id=(select id from identity_doc)),'Provided identity is retained');

rollback;

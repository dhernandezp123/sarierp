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
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
insert into public.proveedores(id,nombre,tipo,moneda,terminos_pago,default_expense_account_id) values('5b302000-0000-4000-8000-000000000001','Supplier fixture','Otro','HNL',0,'5b301000-0000-4000-8000-000000000001');
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000004' where id='5b302000-0000-4000-8000-000000000001'$q$);
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000005' where id='5b302000-0000-4000-8000-000000000001'$q$);
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000006' where id='5b302000-0000-4000-8000-000000000001'$q$);
select pg_temp.reject($q$update public.proveedores set default_expense_account_id='5b301000-0000-4000-8000-000000000007' where id='5b302000-0000-4000-8000-000000000001'$q$);

reset role;
select set_config('request.jwt.claims','{}',true);
insert into public.company_settings(tenant_id,legal_name,rtn,address) values('5b300000-0000-4000-8000-000000000100','Fixture purchasing','08019999123456','Fixture fiscal address');
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values('5b304000-0000-4000-8000-000000000001','5b300000-0000-4000-8000-000000000100','SPS','Fixture office','11111111','office@test.local','001','001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
create temp table wf_inputs(doc jsonb,items jsonb);
insert into wf_inputs values(jsonb_build_object('kind','Solicitud','supplier_id','5b302000-0000-4000-8000-000000000001','office_id','5b304000-0000-4000-8000-000000000001','issue_date',current_date,'due_date',current_date+30,'currency','HNL','exchange_rate',1,'fiscal_mode','Mixta','payment_condition','Credito','payment_method','Cheque','commercial_notes','Public fixture','internal_notes','PRIVATE FIXTURE'),
'[{"id":"5b305000-0000-4000-8000-000000000001","description":"Synthetic purchase","quantity":3,"unit_price":100,"discount_amount":1,"tax_rate":15,"tax_treatment":"Gravada","account_id":"5b301000-0000-4000-8000-000000000001"}]');
create temp table wf_results(n text primary key,id uuid);
select pg_temp.ok(public.can_manage_purchase_workflow(),'Active Admin can manage');
insert into wf_results select 'request',public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000001','save',null,0,(select doc from wf_inputs),(select items from wf_inputs));
select pg_temp.ok((select total=343.85 and status='Borrador' and document_number='SC-000001' from public.purchase_workflow_documents where id=(select id from wf_results where n='request')),'Server calculates discount and tax');
select pg_temp.ok(public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000001','save',null,0,(select doc from wf_inputs),(select items from wf_inputs))=(select id from wf_results where n='request'),'Save retry is idempotent');
select pg_temp.reject($c$select public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000001','save',null,0,'{}','[]')$c$);
select pg_temp.reject($c$update public.purchase_workflow_documents set total=1$c$);
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'approve',(select id from wf_results where n='request'),1)$c$);
select public.manage_purchase_workflow(gen_random_uuid(),'submit',(select id from wf_results where n='request'),1);
select public.manage_purchase_workflow(gen_random_uuid(),'approve',(select id from wf_results where n='request'),2);
select pg_temp.ok((select approved_by=auth.uid() and status='Aprobada' from public.purchase_workflow_documents where id=(select id from wf_results where n='request')),'Creator can approve own document and actor is audited');
select pg_temp.ok(not exists(select 1 from public.cuentas_pagar where tenant_id=public.current_tenant_id()),'Request approval never creates debt');
select pg_temp.ok(not exists(select 1 from public.journal_entries where tenant_id=public.current_tenant_id()),'Request approval never posts journal');
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'save',(select id from wf_results where n='request'),1,(select doc from wf_inputs),(select items from wf_inputs))$c$);
insert into wf_results select 'order',public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000002','order',(select id from wf_results where n='request'),3);
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'order',(select id from wf_results where n='request'),4)$c$);
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'cancel',(select id from wf_results where n='request'),4,'{}','[]','Cannot orphan order')$c$);
select public.manage_purchase_workflow(gen_random_uuid(),'submit',(select id from wf_results where n='order'),1);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set rol='Contabilidad' where id='5b300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
select pg_temp.ok(public.can_manage_purchase_workflow(),'Active Contabilidad can manage');
select public.manage_purchase_workflow(gen_random_uuid(),'approve',(select id from wf_results where n='order'),2);
select pg_temp.ok(not exists(select 1 from public.cuentas_pagar where tenant_id=public.current_tenant_id()),'Order approval does not create debt');
insert into wf_results select 'invoice1',public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000003','invoice',(select id from wf_results where n='order'),3,jsonb_build_object('document_number','WF-1','issue_date',current_date,'due_date',current_date+30),'[{"id":"5b305000-0000-4000-8000-000000000001","quantity":1}]');
select pg_temp.ok((select status='Parcialmente facturada' and revision=4 from public.purchase_workflow_documents where id=(select id from wf_results where n='order')),'Partial invoice leaves remainder');
select pg_temp.ok((select items->0->>'discount_amount'='0.33' from public.purchase_documents where id=(select id from wf_results where n='invoice1')),'Partial discount is proportional');
select pg_temp.ok(public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000003','invoice',(select id from wf_results where n='order'),3,jsonb_build_object('document_number','WF-1','issue_date',current_date,'due_date',current_date+30),'[{"id":"5b305000-0000-4000-8000-000000000001","quantity":1}]')=(select id from wf_results where n='invoice1'),'Retry does not invoice twice');
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'invoice',(select id from wf_results where n='order'),4,jsonb_build_object('document_number','WF-BAD','issue_date',current_date),'[{"id":"5b305000-0000-4000-8000-000000000001","quantity":3}]')$c$);
insert into wf_results select 'invoice2',public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000004','invoice',(select id from wf_results where n='order'),4,jsonb_build_object('document_number','WF-2','issue_date',current_date,'due_date',current_date+30),'[{"id":"5b305000-0000-4000-8000-000000000001","quantity":2}]');
select pg_temp.ok((select status='Facturada' from public.purchase_workflow_documents where id=(select id from wf_results where n='order')),'Final invoice closes order');
select pg_temp.ok((select sum(quantity)=3 and sum(discount_amount)=1 from public.purchase_order_allocations),'No double quantities or lost discount cents');
select pg_temp.ok((select count(*)=2 from public.cuentas_pagar where tenant_id=public.current_tenant_id()),'Only actual invoices create payables');
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'cancel',(select id from wf_results where n='order'),5,'{}','[]','Cancel')$c$);

-- Use the real fiscal request/review workflow; do not bypass document guards.
select public.review_fiscal_void(public.request_fiscal_void('purchase_documents',(select id from wf_results where n='invoice2'),gen_random_uuid(),'Fixture correction'),true,'Fixture approved',true);
select pg_temp.ok((select status='Parcialmente facturada' and revision=6 from public.purchase_workflow_documents where id=(select id from wf_results where n='order')),'Voided invoice restores remaining quantities');
select pg_temp.ok((select sum(quantity)=1 from public.purchase_order_allocations where is_active),'Voided allocation is retained but no longer consumed');
select public.manage_purchase_workflow(gen_random_uuid(),'cancel',(select id from wf_results where n='order'),6,'{}','[]','Cancel unbilled remainder');
select pg_temp.ok((select status='Cancelada' from public.purchase_workflow_documents where id=(select id from wf_results where n='order')),'Partial remainder can be cancelled without deleting invoices');
select pg_temp.ok((select count(*)=2 from public.purchase_order_allocations),'Cancellation never erases allocation history');
-- A direct order is editable only before invoicing and editing invalidates approval.
insert into wf_results select 'direct',public.manage_purchase_workflow(gen_random_uuid(),'save',null,0,(select doc||'{"kind":"Orden"}'::jsonb from wf_inputs),(select items from wf_inputs));
select public.manage_purchase_workflow(gen_random_uuid(),'submit',(select id from wf_results where n='direct'),1);
select public.manage_purchase_workflow(gen_random_uuid(),'approve',(select id from wf_results where n='direct'),2);
select public.manage_purchase_workflow(gen_random_uuid(),'save',(select id from wf_results where n='direct'),3,(select doc from wf_inputs),(select items from wf_inputs));
select pg_temp.ok((select status='Borrador' and approved_by is null and approved_at is null and kind='Orden' from public.purchase_workflow_documents where id=(select id from wf_results where n='direct')),'Editing invalidates approval and cannot change document kind');
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'save',null,0,(select doc||'{"supplier_id":"5b302000-0000-4000-8000-000000000099"}'::jsonb from wf_inputs),(select items from wf_inputs))$c$);
select public.manage_purchase_workflow(gen_random_uuid(),'submit',(select id from wf_results where n='direct'),4);
select public.manage_purchase_workflow(gen_random_uuid(),'approve',(select id from wf_results where n='direct'),5);
select public.create_purchase_document('5b306000-0000-4000-8000-000000000005',jsonb_build_object('supplier_id','5b302000-0000-4000-8000-000000000001','document_type','Factura de proveedor','document_number','UNRELATED-WF','currency','HNL','issue_date',current_date),'[{"description":"Unrelated fixture","quantity":1,"unit_price":10,"tax_rate":0}]');
select pg_temp.reject($c$select public.manage_purchase_workflow('5b306000-0000-4000-8000-000000000005','invoice',(select id from wf_results where n='direct'),6,jsonb_build_object('document_number','WF-COLLISION','issue_date',current_date),'[{"id":"5b305000-0000-4000-8000-000000000001","quantity":1}]')$c$);
select pg_temp.ok((select count(*)=2 from public.purchase_order_allocations),'Unrelated purchase cannot consume order quantities');

reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set rol='Finanzas' where id='5b300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
select pg_temp.ok(not public.can_manage_purchase_workflow(),'Finanzas is not granted purchasing approval');
select pg_temp.ok(not exists(select 1 from public.purchase_workflow_documents),'RLS hides purchasing from unauthorized roles');
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'save',null,0,(select doc from wf_inputs),(select items from wf_inputs))$c$);
reset role;
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('5b300000-0000-4000-8000-000000000002','authenticated','authenticated','foreign-purchase@test.local','{}');
update public.profiles set rol='Admin',status='Aprobado',is_active=true,tenant_id='5b300000-0000-4000-8000-000000000200' where id='5b300000-0000-4000-8000-000000000002';
do $$begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_demo_user') then execute $d$update public.profiles set is_demo_user=true,demo_expires_at=now()+interval '1 day',demo_access_grant_id='5b309900-0000-4000-8000-000000000099' where id='5b300000-0000-4000-8000-000000000002'$d$;end if;end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
select pg_temp.ok(not exists(select 1 from public.purchase_workflow_documents),'RLS hides other tenant documents');
select pg_temp.reject($c$select public.manage_purchase_workflow(gen_random_uuid(),'submit',(select id from wf_results where n='request'),4)$c$);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set rol='Admin',is_active=false where id='5b300000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5b300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5b309900-0000-4000-8000-000000000099"}}',true);
select pg_temp.ok(not public.can_manage_purchase_workflow(),'Inactive Admin denied');
rollback;

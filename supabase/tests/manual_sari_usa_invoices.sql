\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %', message; end if; end; $$;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  begin execute command; exception when others then blocked := true; end;
  if not blocked then raise exception 'ASSERTION FAILED: mutation was allowed'; end if;
end; $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('fa120000-0000-4000-8000-000000000001','authenticated','authenticated','manual-admin@test.local','{}'),
 ('fa120000-0000-4000-8000-000000000002','authenticated','authenticated','manual-sales@test.local','{}'),
 ('fa120000-0000-4000-8000-000000000003','authenticated','authenticated','manual-foreign@test.local','{}');
insert into public.tenants(id,slug,name,status) values ('fa120000-0000-4000-8000-000000000004','manual-test','Other tenant','Activo');
update public.profiles set rol = 'Admin', status = 'Aprobado', is_active = true, is_platform_admin = false,
  tenant_id = '00000000-0000-4000-8000-000000000001'
where id in ('fa120000-0000-4000-8000-000000000001','fa120000-0000-4000-8000-000000000002');
update public.profiles set rol = 'Ventas' where id = 'fa120000-0000-4000-8000-000000000002';
update public.profiles set rol = 'Admin', status = 'Aprobado', is_active = true, is_platform_admin = false,
  tenant_id = 'fa120000-0000-4000-8000-000000000004' where id = 'fa120000-0000-4000-8000-000000000003';
create temp table manual_fixture as select jsonb_build_object(
 'invoice_number','131326','issue_date','2026-09-28','due_date','2026-09-28','bill_to_name','Test client',
 'bill_to_address','','bill_to_city','','file_number','','customer_reference','','shipper','SARI EXPRESS CONSOLIDATORS',
 'consignee','','carrier','','goods_description','','hbl','HBL-87574','mbl','MBL-31706','origin','PORT EVERGLADES, FL',
 'destination','PUERTO CORTES/HONDURAS','charges_term','COLLECT','pieces','1','weight_lb','44,984',
 'booking_number','','container_size','','container_number','','consol_number','HDR7948',
 'items','[{"description":"Freight","amount":"3,300.00"},{"description":"Loading","amount":"470.00"},{"description":"Documentation","amount":"75.00"}]'::jsonb,
 'warehouse_receipts','["456308"]'::jsonb) as data;
grant select on manual_fixture to authenticated;

select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(public.can_use_manual_invoices(),'Admin can use module');
insert into public.manual_invoices(id,invoice_number,client_name,total,data)
select 'fa120000-0000-4000-8000-000000000005','spoofed','spoofed',1,data from manual_fixture;
select pg_temp.assert_true((select total = 3845 and invoice_number = '131326' and client_name = 'Test client'
  from public.manual_invoices where id = 'fa120000-0000-4000-8000-000000000005'),'Server derives summary values');
select pg_temp.expect_denied($q$update public.manual_invoices set total = 1$q$);
select pg_temp.expect_denied($q$delete from public.manual_invoices$q$);
select pg_temp.expect_denied($q$insert into public.manual_invoices(tenant_id,invoice_number,client_name,total,data)
 select 'fa120000-0000-4000-8000-000000000004','x','x',1,data from manual_fixture$q$);
select pg_temp.expect_denied($q$insert into public.manual_invoices(created_by,invoice_number,client_name,total,data)
 select 'fa120000-0000-4000-8000-000000000002','x','x',1,data from manual_fixture$q$);
select pg_temp.expect_denied($q$insert into public.manual_invoices(invoice_number,client_name,total,data)
 select 'x','x',1,jsonb_set(data,'{issue_date}','"2026-02-30"') from manual_fixture$q$);
select pg_temp.expect_denied($q$insert into public.manual_invoices(invoice_number,client_name,total,data)
 select 'x','x',1,jsonb_set(data,'{items,0,amount}','"-20"') from manual_fixture$q$);
select pg_temp.assert_true((select bool_and(public.claim_manual_invoice_ocr()) from generate_series(1,20)), 'First 20 OCR attempts allowed');
select pg_temp.assert_true(not public.claim_manual_invoice_ocr(),'Attempt 21 denied');
select pg_temp.expect_denied($q$update public.manual_invoice_ocr_usage set attempts = 1$q$);

reset role;
select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert_true(not public.can_use_manual_invoices(),'Sales cannot access');
select pg_temp.assert_true((select count(*) = 0 from public.manual_invoices),'Sales cannot read invoices');
select pg_temp.expect_denied($q$select public.claim_manual_invoice_ocr()$q$);
select pg_temp.expect_denied($q$insert into public.manual_invoices(invoice_number,client_name,total,data)
 select 'x','x',1,data from manual_fixture$q$);

reset role;
select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.assert_true(not public.can_use_manual_invoices(),'Other tenant cannot use SARI template');
select pg_temp.assert_true((select count(*) = 0 from public.manual_invoices),'Other tenant cannot read SARI documents');
select pg_temp.expect_denied($q$select public.claim_manual_invoice_ocr()$q$);

reset role;
select set_config('request.jwt.claim.sub','',true);
update public.profiles set rol = 'Operaciones' where id = 'fa120000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(public.can_use_manual_invoices(),'Operations allowed');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.profiles set rol = 'Finanzas' where id = 'fa120000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(public.can_use_manual_invoices(),'Finance allowed');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.profiles set rol = 'Contabilidad' where id = 'fa120000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(public.can_use_manual_invoices(),'Accounting allowed');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.profiles set is_active = false where id = 'fa120000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','fa120000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(not public.can_use_manual_invoices(),'Suspended profile denied');
select pg_temp.assert_true((select count(*) = 0 from public.manual_invoices),'Suspended profile cannot read');
reset role;
select pg_temp.assert_true(not has_table_privilege('anon','public.manual_invoices','SELECT'),'No anonymous reads');
select pg_temp.assert_true(not has_function_privilege('anon','public.claim_manual_invoice_ocr()','EXECUTE'),'No anonymous paid OCR');
rollback;

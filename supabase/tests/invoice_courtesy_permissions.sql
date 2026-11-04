\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message;end if;end $$;
create function pg_temp.denied(command text) returns void language plpgsql as $$
begin begin execute command;exception when insufficient_privilege then return;end;raise exception 'Expected permission denial';end $$;
create function pg_temp.rejected(command text) returns void language plpgsql as $$
begin begin execute command;exception when others then return;end;raise exception 'Expected rejection';end $$;
insert into public.tenants(id,slug,name) values('fc010000-0000-4000-8000-000000000099','courtesy-other','Courtesy other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('fc010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','courtesy-'||n||'@test.local','{}'::jsonb from generate_series(1,7)n;
update public.profiles set status='Aprobado',is_active=true,is_platform_admin=false,tenant_id='00000000-0000-4000-8000-000000000001',
 rol=case when id in ('fc010000-0000-4000-8000-000000000001','fc010000-0000-4000-8000-000000000004','fc010000-0000-4000-8000-000000000006') then 'Admin'::public.user_role
 when id='fc010000-0000-4000-8000-000000000002' then 'Contabilidad'::public.user_role
 when id='fc010000-0000-4000-8000-000000000005' then 'Cliente'::public.user_role else 'Finanzas'::public.user_role end
where id::text like 'fc010000-%';
update public.profiles set tenant_id='fc010000-0000-4000-8000-000000000099' where id='fc010000-0000-4000-8000-000000000006';
update public.profiles set status='Pendiente' where id='fc010000-0000-4000-8000-000000000007';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Admin without designation cannot review courtesy');
select public.set_invoice_master('fc010000-0000-4000-8000-000000000002','Master para prueba de cortesia');
select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000001',true,'Gerencia autorizada por caso');
select pg_temp.assert_true(public.can_approve_invoice_courtesy(),'Explicitly designated Admin can review');
select pg_temp.assert_true((select count(*)=2 from public.list_invoice_courtesy_approvers()),'Explicit Admin and current accounting master listed');
select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000001',true,'Reintento de la misma designacion');
select pg_temp.assert_true((select count(*)=1 from public.invoice_courtesy_permission_events),'Repeated grant is idempotent');
select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000003',true,'Designacion temporal controlada');
select pg_temp.rejected($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000005',true,'Cliente no debe revisar')$q$);
select pg_temp.rejected($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000007',true,'Usuario pendiente no puede')$q$);
select pg_temp.rejected($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000006',true,'Usuario de otra empresa')$q$);
select pg_temp.rejected($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000004',true,'')$q$);
select pg_temp.denied($q$delete from public.invoice_courtesy_approvers$q$);
select pg_temp.denied($q$update public.invoice_courtesy_permission_events set reason='Cambiar historial'$q$);
select pg_temp.denied($q$insert into public.invoice_courtesy_approvers(tenant_id,profile_id,reason) values('00000000-0000-4000-8000-000000000001','fc010000-0000-4000-8000-000000000004','Intento directo')$q$);

select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(public.can_approve_invoice_courtesy(),'Current designated accounting master can review');
select pg_temp.denied($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000004',true,'Master no administra autorizadores')$q$);
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true(public.can_approve_invoice_courtesy(),'Explicit internal reviewer is eligible');
select pg_temp.denied($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000004',true,'Finanzas no administra autorizadores')$q$);
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Other Admin does not inherit review authority');
select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000003',false,'Retirar designacion temporal');
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Revocation takes effect immediately');
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Other tenant cannot inherit authority');
select pg_temp.assert_true((select count(*)=0 from public.invoice_courtesy_approvers),'RLS hides other company grants');
select pg_temp.assert_true((select count(*)=0 from public.invoice_courtesy_permission_events),'RLS hides other company events');
select pg_temp.assert_true((select count(*)=0 from public.list_invoice_courtesy_approvers()),'RPC does not leak other company reviewers');
select pg_temp.rejected($q$select public.set_invoice_courtesy_approver('fc010000-0000-4000-8000-000000000001',true,'Cross tenant change')$q$);
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Portal customer cannot review');
select pg_temp.denied('select public.list_invoice_courtesy_approvers()');
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Pending user cannot review');

select set_config('request.jwt.claims','{}',true);
reset role;
update public.profiles set is_active=false where id='fc010000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Inactive explicit reviewer is denied');
select pg_temp.denied('select public.list_invoice_courtesy_approvers()');
select set_config('request.jwt.claims','{}',true);
reset role;
update public.profiles set is_active=true where id='fc010000-0000-4000-8000-000000000001';
update public.profiles set rol='Ventas' where id='fc010000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Master who loses eligible role cannot review');
select set_config('request.jwt.claims','{}',true);
reset role;
update public.profiles set rol='Contabilidad' where id='fc010000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_invoice_master(null,'Retirar master para verificar revocacion');
select set_config('request.jwt.claims','{"sub":"fc010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_approve_invoice_courtesy(),'Former master does not retain courtesy authority');
reset role;
select pg_temp.assert_true(not has_table_privilege('anon','public.invoice_courtesy_approvers','SELECT'),'Anonymous cannot read grants');
select pg_temp.assert_true(not has_function_privilege('anon','public.can_approve_invoice_courtesy()','EXECUTE'),'Anonymous cannot query reviewer permission');
select pg_temp.assert_true(not has_function_privilege('anon','public.set_invoice_courtesy_approver(uuid,boolean,text)','EXECUTE'),'Anonymous cannot grant authority');
rollback;

\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message;end if;end $$;
create function pg_temp.as_user(actor uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);end $$;
create function pg_temp.expect_denied(command text,message text) returns void language plpgsql as $$
declare affected integer;begin
 begin execute command;get diagnostics affected=row_count;
 exception when insufficient_privilege then return;end;
 if affected<>0 then raise exception 'ASSERTION FAILED: %',message;end if;
end $$;

insert into public.tenants(id,slug,name) values('ac710000-0000-4000-8000-000000000100','rate-audit-other','Rate audit other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
 select ('ac710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'rate-audit-'||n||'@test.local','{}' from generate_series(1,7) n;
update public.profiles set
 rol=case right(id::text,3) when '001' then 'Admin'::public.user_role
   when '004' then 'Pricing'::public.user_role when '005' then 'Ventas'::public.user_role
   when '007' then 'Operaciones'::public.user_role else 'Contabilidad'::public.user_role end,
 status='Aprobado',is_active=true,nombre='Usuario',apellido=right(id::text,3),
 tenant_id=case when right(id::text,3)='006' then 'ac710000-0000-4000-8000-000000000100'::uuid
   else '00000000-0000-4000-8000-000000000001'::uuid end
 where id::text like 'ac710000-%';
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source)
 values('00000000-0000-4000-8000-000000000001','ac710000-0000-4000-8000-000000000002','Despliegue autorizado'),
 ('ac710000-0000-4000-8000-000000000100','ac710000-0000-4000-8000-000000000006','Despliegue autorizado')
 on conflict(tenant_id) do update set profile_id=excluded.profile_id;
insert into public.clientes(id,nombre,tenant_id) values
 ('ac711000-0000-4000-8000-000000000001','Cliente de tarifas','00000000-0000-4000-8000-000000000001'),
 ('ac711000-0000-4000-8000-000000000002','Cliente otra empresa','ac710000-0000-4000-8000-000000000100');
insert into public.client_rates(cliente_id,tenant_id,rate_code,rate_label,category,amount,miami_rate_destination)
 values('ac711000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','AUDIT','Flete prueba','Flete',6,'SPS');
insert into public.client_rate_editors(tenant_id,profile_id)
 values('00000000-0000-4000-8000-000000000001','ac710000-0000-4000-8000-000000000002');

set local role authenticated;
select pg_temp.as_user('ac710000-0000-4000-8000-000000000003');
select pg_temp.assert_true(not public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Contabilidad sin designacion sigue sin permiso');
select pg_temp.expect_denied($cmd$insert into public.client_rate_editors(tenant_id,profile_id) values('00000000-0000-4000-8000-000000000001','ac710000-0000-4000-8000-000000000003')$cmd$,'No se puede autoconceder acceso');
select pg_temp.expect_denied($cmd$update public.client_rates set amount=999 where cliente_id='ac711000-0000-4000-8000-000000000001'$cmd$,'Sin designacion no actualiza');
select pg_temp.expect_denied($cmd$select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','[]','[]','[]')$cmd$,'Sin designacion no usa RPC');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000006');
select pg_temp.assert_true(not public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Otro tenant no administra tarifas');
select pg_temp.expect_denied($cmd$select * from public.get_client_rate_history('ac711000-0000-4000-8000-000000000001')$cmd$,'Otro tenant no lee auditoria');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000007');
select pg_temp.assert_true(not public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Operaciones sin permiso de tarifas');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000001');
select pg_temp.assert_true(public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Admin conserva permiso');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000004');
select pg_temp.assert_true(public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Pricing conserva permiso');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000005');
select pg_temp.assert_true(public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Ventas conserva permiso');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Master de Contabilidad autorizado');
select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','["AUDIT"]','[]',
 '[{"rate_code":"AUDIT","rate_label":"Flete prueba","category":"Flete","amount":10,"miami_rate_destination":"SPS"}]');
select pg_temp.assert_true((select amount=10 from public.client_rates where cliente_id='ac711000-0000-4000-8000-000000000001'),'Master guarda por RPC');
select pg_temp.assert_true((select count(*)=1 from public.get_client_rate_history('ac711000-0000-4000-8000-000000000001')
 where actor_id='ac710000-0000-4000-8000-000000000002' and actor_name='Usuario 002'
 and (before_values->>'amount')::numeric=6 and (after_values->>'amount')::numeric=10),'Reemplazo agrupa antes/despues y conserva autor real');

reset role;
create function pg_temp.fail_rate_audit() returns trigger language plpgsql as $$
begin
 if new.entity_id='ac711000-0000-4000-8000-000000000001' and new.metadata->>'source'='client_rates_trigger' then
  raise exception 'Fallo de auditoria simulado' using errcode='23514';
 end if;
 return new;
end $$;
create trigger test_fail_rate_audit before insert on public.activity_logs for each row execute function pg_temp.fail_rate_audit();
set local role authenticated;
do $$begin
 begin
  perform public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','["AUDIT"]','[]',
   '[{"rate_code":"AUDIT","rate_label":"Flete prueba","category":"Flete","amount":999,"miami_rate_destination":"SPS"}]');
  raise exception 'La escritura sin auditoria debio fallar';
 exception when check_violation then null;end;
end $$;
select pg_temp.assert_true((select amount=10 from public.client_rates where cliente_id='ac711000-0000-4000-8000-000000000001'),'Fallo de auditoria revierte el reemplazo completo');
reset role;
drop trigger test_fail_rate_audit on public.activity_logs;
set local role authenticated;
update public.client_rates set amount=0 where cliente_id='ac711000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select (after_values->>'amount')::numeric=0 from public.get_client_rate_history('ac711000-0000-4000-8000-000000000001')
 where actor_id='ac710000-0000-4000-8000-000000000002'),'Actualizacion directa auditada; cero se conserva');
select pg_temp.expect_denied($cmd$update public.activity_logs set description='Alterado' where entity_id='ac711000-0000-4000-8000-000000000001'$cmd$,'No altera auditoria');
select pg_temp.expect_denied($cmd$delete from public.activity_logs where entity_id='ac711000-0000-4000-8000-000000000001'$cmd$,'No borra auditoria');
select pg_temp.expect_denied($cmd$insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
 values('00000000-0000-4000-8000-000000000001','ac710000-0000-4000-8000-000000000002','clientes','client_rate_update','cliente',
 'ac711000-0000-4000-8000-000000000001','Falso','{}')$cmd$,'No falsifica una accion de auditoria');
select pg_temp.expect_denied($cmd$insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
 values('00000000-0000-4000-8000-000000000001','ac710000-0000-4000-8000-000000000002','clientes','otra_accion','cliente',
 'ac711000-0000-4000-8000-000000000001','Falso','{"source":"client_rates_trigger"}')$cmd$,'No falsifica el origen del trigger');

reset role;
-- Emulate a preceding HTTP transaction without committing test fixtures.
update public.activity_logs set metadata=jsonb_set(metadata,'{transaction_id}','"previous"')
 where entity_id='ac711000-0000-4000-8000-000000000001';
set local role authenticated;
select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','["AUDIT"]','[]',
 '[{"rate_code":"AUDIT","rate_label":"Flete prueba","category":"Flete","amount":0,"miami_rate_destination":"SPS"}]');
select pg_temp.assert_true((select count(*)=1 from public.get_client_rate_history('ac711000-0000-4000-8000-000000000001')
 where actor_id='ac710000-0000-4000-8000-000000000002'),'Guardar igual no simula un cambio de tarifa');
delete from public.client_rates where cliente_id='ac711000-0000-4000-8000-000000000001';
select pg_temp.assert_true(exists(select 1 from public.get_client_rate_history('ac711000-0000-4000-8000-000000000001')
 where actor_id='ac710000-0000-4000-8000-000000000002' and after_values is null),'Borrado directo auditado');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set is_active=false where id='ac710000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Master inactivo pierde permiso');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set is_active=true,status='Pendiente' where id='ac710000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
select pg_temp.assert_true(not public.can_manage_client_rates('ac711000-0000-4000-8000-000000000001'),'Master pendiente pierde permiso');
reset role;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.audit_client_rate_change()','execute'),'Trigger no invocable como RPC');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_client_rate_history(uuid,integer,integer)','execute'),'Anonimo no consulta auditoria');
rollback;

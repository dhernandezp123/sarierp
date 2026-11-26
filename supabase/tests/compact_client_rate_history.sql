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
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
insert into public.client_rates(cliente_id,tenant_id,rate_code,rate_label,category,amount,miami_rate_destination)
 values('ac711000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','AUDIT','Flete prueba','Flete',6,'SPS');
insert into public.client_rate_editors(tenant_id,profile_id)
 values('00000000-0000-4000-8000-000000000001','ac710000-0000-4000-8000-000000000002');


set local role authenticated;
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','["AUDIT","SECOND"]','[]',
 '[{"rate_code":"AUDIT","rate_label":"Flete prueba","category":"Flete","amount":0,"miami_rate_destination":"SPS"},
   {"rate_code":"SECOND","rate_label":"Entrega","category":"Flete","amount":20,"miami_rate_destination":"SPS"}]');
select pg_temp.assert_true((select count(*)=1 and max(jsonb_array_length(changes))=2 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001',1)), 'Un guardado no se divide entre paginas');
select pg_temp.assert_true((select count(*)=0 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001',1,1)), 'Offset pagina guardados completos');
select pg_temp.assert_true((select count(*)=1 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001',25,0,null,null,'usuario 002','entrega')), 'Filtros de autor y tarifa aplicados en servidor');
select pg_temp.assert_true((select count(*)=0 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001',25,0,null,null,'inexistente')), 'Autor sin coincidencias');
reset role;
-- Freeze preceding transaction and force a local-calendar boundary for date tests.
with ordered as (
 select id,row_number() over(order by created_at,id) as position from public.activity_logs
 where entity_id='ac711000-0000-4000-8000-000000000001'
)
update public.activity_logs a set metadata=jsonb_set(metadata,'{transaction_id}','"previous"'),
 created_at='2026-11-18T02:00:00Z'::timestamptz + o.position * interval '1 millisecond'
from ordered o where a.id=o.id;
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001',25,0,'2026-11-17','2026-11-17')), 'Fecha inclusiva usa Honduras');
select pg_temp.assert_true((select count(*)=0 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001',25,0,'2026-11-18')), 'Limite excluye dia anterior local');
select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','["AUDIT","SECOND"]','[]',
 '[{"rate_code":"AUDIT","rate_label":"Flete prueba","category":"Flete","amount":0,"miami_rate_destination":"SPS"},
   {"rate_code":"SECOND","rate_label":"Entrega","category":"Flete","amount":20,"miami_rate_destination":"SPS"}]');
select pg_temp.assert_true((select count(*)=1 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001')), 'Guardar igual no crea movimiento visible');
update public.client_rates set amount=25 where rate_code='SECOND' and cliente_id='ac711000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=2 and max(total_count)=2 from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001')), 'Dos guardados conservan total correcto');
select pg_temp.as_user('ac710000-0000-4000-8000-000000000006');
select pg_temp.expect_denied($cmd$select * from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001')$cmd$, 'Otro tenant no consulta');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set is_active=false where id='ac710000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
select pg_temp.expect_denied($cmd$select * from public.get_client_rate_history_batches('ac711000-0000-4000-8000-000000000001')$cmd$, 'Usuario inactivo no consulta');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','public.get_client_rate_history_batches(uuid,integer,integer,date,date,text,text)','execute'), 'Anonimo sin acceso');
rollback;

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



insert into public.client_rates(cliente_id,tenant_id,rate_code,rate_label,category,amount,miami_rate_destination,notes,valid_to)
values
('ac711000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','KEEP','Conservar','Flete',21,'SPS','Notas intactas','2027-01-01'),
('ac711000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','AUDIT','Otro destino','Flete',31,'TGU','TGU intacto','2027-01-01'),
('ac711000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','GLOBAL','Global','Flete',41,null,'Global intacto','2027-01-01');
create temporary table untouched as select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) fingerprint from public.client_rates r
where cliente_id='ac711000-0000-4000-8000-000000000001' and not(rate_code='AUDIT' and miami_rate_destination='SPS');
set local role authenticated;
select pg_temp.as_user('ac710000-0000-4000-8000-000000000002');
select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','["AUDIT"]','[]',
 '[{"rate_code":"AUDIT","rate_label":"Flete prueba","category":"Flete","amount":0,"miami_rate_destination":"SPS"}]');
reset role;
select pg_temp.assert_true((select fingerprint from untouched)=(select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) from public.client_rates r
where cliente_id='ac711000-0000-4000-8000-000000000001' and not(rate_code='AUDIT' and miami_rate_destination='SPS')), 'Subset conserva IDs, notas, vigencias, globales y TGU no tocados');
select pg_temp.assert_true((select count(*)=4 from public.client_rates where cliente_id='ac711000-0000-4000-8000-000000000001'), 'Subset no crea el resto del catalogo');
select pg_temp.assert_true((select amount=0 from public.client_rates where cliente_id='ac711000-0000-4000-8000-000000000001' and rate_code='AUDIT' and miami_rate_destination='SPS'), 'Cero explicito se conserva');
create temporary table audit_before as select count(*) n from public.activity_logs where entity_id='ac711000-0000-4000-8000-000000000001';
set local role authenticated;
select public.replace_client_rates('ac711000-0000-4000-8000-000000000001','SPS','[]','[]','[]');
reset role;
select pg_temp.assert_true((select n from audit_before)=(select count(*) from public.activity_logs where entity_id='ac711000-0000-4000-8000-000000000001'), 'No-op no escribe auditoria');
select pg_temp.assert_true((select count(*)=4 from public.client_rates where cliente_id='ac711000-0000-4000-8000-000000000001'), 'No-op no elimina tarifas');
rollback;

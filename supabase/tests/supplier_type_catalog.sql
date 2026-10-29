\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERT: %',m;end if;end $$;
create function pg_temp.expect_error(c text) returns void language plpgsql as $$begin begin execute c;exception when others then return;end;raise exception 'Expected rejection: %',c;end $$;
insert into public.tenants(id,slug,name) values
('5a290000-0000-4000-8000-000000000100','supplier-types-test','Catalogo ficticio'),
('5a290000-0000-4000-8000-000000000200','supplier-types-other','Otra empresa ficticia');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('5a290000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','supplier-types-'||n||'@test.local','{}'::jsonb from generate_series(1,4)n;
update public.profiles set rol=case when right(id::text,1) in ('1','4') then 'Admin'::public.user_role else 'Contabilidad'::public.user_role end,
 status='Aprobado',is_active=true,tenant_id=case when right(id::text,1)='4' then '5a290000-0000-4000-8000-000000000200'::uuid else '5a290000-0000-4000-8000-000000000100'::uuid end where id::text like '5a290000-%';
do $$begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_demo_user') then
 execute $q$update public.profiles set is_demo_user=true,demo_expires_at=now()+interval '1 day',demo_access_grant_id='5a299900-0000-4000-8000-000000000099' where id::text like '5a290000-%'$q$;
end if;end $$;
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) values('5a290000-0000-4000-8000-000000000100','5a290000-0000-4000-8000-000000000002','Despliegue autorizado');
select pg_temp.assert_true((select count(*)=14 from public.supplier_types where tenant_id::text like '5a290000-%'),'Nuevos tenants reciben catalogos separados');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a290000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"5a299900-0000-4000-8000-000000000099"}}',true);
create temp table custom_type as select public.save_supplier_type(null,0,'mantenimiento','Mantenimiento',true,80) data;
insert into public.proveedores(id,nombre,tipo,moneda,terminos_pago) values('5a294000-0000-4000-8000-000000000001','Proveedor ficticio','mantenimiento','HNL',0);
select public.save_supplier_type((data->>'id')::uuid,1,'mantenimiento','Mantenimiento',false,80) from custom_type;
update public.proveedores set telefono='99990000' where id='5a294000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select tipo='mantenimiento' and telefono='99990000' from public.proveedores where id='5a294000-0000-4000-8000-000000000001'),'Tipo inactivo conserva proveedor y permite otros cambios');
select pg_temp.expect_error($q$insert into public.proveedores(nombre,tipo) values('No asignable','mantenimiento')$q$);
select public.save_supplier_type((data->>'id')::uuid,2,'mantenimiento','Mantenimiento externo',false,90) from custom_type;
select pg_temp.assert_true((select tipo='mantenimiento' from public.proveedores where id='5a294000-0000-4000-8000-000000000001'),'Renombrar etiqueta conserva codigo');
select pg_temp.expect_error($q$select public.save_supplier_type((select(data->>'id')::uuid from custom_type),2,'mantenimiento','Obsoleto',true,90)$q$);
select pg_temp.expect_error($q$select public.save_supplier_type((select(data->>'id')::uuid from custom_type),3,'otro_codigo','Cambio de codigo',true,90)$q$);
select pg_temp.expect_error($q$select public.save_supplier_type(null,0,'duplicado','Agente',true,90)$q$);
select set_config('request.jwt.claims','{"sub":"5a290000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"5a299900-0000-4000-8000-000000000099"}}',true);
select public.save_supplier_type((data->>'id')::uuid,3,'mantenimiento','Mantenimiento externo',true,90) from custom_type;
select pg_temp.assert_true((select count(*)=4 from public.supplier_type_events),'Admin y master generan historial');
select pg_temp.expect_error($q$update public.supplier_type_events set after_value='{}'$q$);
select set_config('request.jwt.claims','{"sub":"5a290000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"demo_access_grant_id":"5a299900-0000-4000-8000-000000000099"}}',true);
select pg_temp.assert_true((select count(*)=8 from public.supplier_types),'Contabilidad consulta catalogo');
select pg_temp.expect_error($q$select public.save_supplier_type(null,0,'sin_permiso','Sin permiso',true,90)$q$);
select pg_temp.expect_error($q$update public.supplier_types set active=false$q$);
select set_config('request.jwt.claims','{"sub":"5a290000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"demo_access_grant_id":"5a299900-0000-4000-8000-000000000099"}}',true);
select pg_temp.assert_true((select count(*)=7 from public.supplier_types) and (select count(*)=0 from public.proveedores),'Aislamiento entre empresas');
select pg_temp.expect_error($q$select public.save_supplier_type((select(data->>'id')::uuid from custom_type),4,'mantenimiento','Ajeno',true,90)$q$);
select pg_temp.expect_error($q$insert into public.proveedores(nombre,tipo) values('Ajeno','mantenimiento')$q$);
select pg_temp.assert_true(not has_function_privilege('anon','public.save_supplier_type(uuid,integer,text,text,boolean,integer)','execute') and not has_function_privilege('authenticated','public.seed_supplier_types_internal(uuid)','execute'),'Sin accesos anonimos ni seed publico');
rollback;

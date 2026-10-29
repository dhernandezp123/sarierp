\set ON_ERROR_STOP on
begin;
reset role;
select set_config('request.jwt.claims','{}',true);
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
do $$begin if exists(select 1 from public.cai_ranges where tenant_id='00000000-0000-4000-8000-000000000001') then raise exception 'Requires empty disposable fiscal fixture';end if;end $$;
-- No real configuration is seeded into an empty installation.
-- APPLY_RESTORED_TGU_PREFIX_MIGRATION
insert into public.tenants(id,slug,name) values('00000000-0000-4000-8000-000000000001','tgu-restore-fixture','Empresa ficticia') on conflict(id) do nothing;
insert into public.company_settings(tenant_id,legal_name,billing_points_of_sale) values('00000000-0000-4000-8000-000000000001','Empresa ficticia',array['San Pedro Sula','Tegucigalpa']) on conflict(tenant_id) do nothing;
insert into public.billing_offices(tenant_id,name,establishment_code,emission_point_code) values
 ('00000000-0000-4000-8000-000000000001','San Pedro Sula','001','001'),
 ('00000000-0000-4000-8000-000000000001','Tegucigalpa','000','001')
 on conflict(tenant_id,name) do update set establishment_code=excluded.establishment_code,emission_point_code=excluded.emission_point_code;
insert into auth.users(id,aud,role,email,raw_user_meta_data) select ('ce290000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','restore-'||n||'@test.local','{}'::jsonb from generate_series(1,2)n;
update public.profiles set tenant_id='00000000-0000-4000-8000-000000000001',rol='Contabilidad',status='Aprobado',is_active=true where id::text like 'ce290000-%';
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) values('00000000-0000-4000-8000-000000000001','ce290000-0000-4000-8000-000000000001','Despliegue autorizado');
insert into public.cai_ranges(tenant_id,cai,point_of_sale,document_type,rango_desde,rango_hasta,next_number,fecha_limite_emision,is_active) values
 ('00000000-0000-4000-8000-000000000001','TEST-RESTORE-SPS','San Pedro Sula','Factura','001-001-01-00000001','001-001-01-00000100',42,current_date+30,true),
 ('00000000-0000-4000-8000-000000000001','TEST-RESTORE-TGU','Tegucigalpa','Factura','000-001-01-00000001','000-001-01-00000100',53,current_date+30,true),
 ('00000000-0000-4000-8000-000000000001','TEST-RESTORE-ND','Tegucigalpa','Nota de Débito','000-001-07-00000001','000-001-07-00000100',12,current_date+30,true),
 ('00000000-0000-4000-8000-000000000001','TEST-RESTORE-BC','Tegucigalpa','Boleta de Compra','000-001-11-00000001','000-001-11-00000100',1,current_date+30,true);
-- Reproduce the exact binding mismatch introduced by the previous confirmation.
-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION
create temp table restore_before as select id,to_jsonb(c) data from public.cai_ranges c;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce290000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true(public.is_invoice_master(),'Master individually designated');
select pg_temp.expect_error($q$select public.set_cai_range_active(id,revision,true,'Intento antes de restaurar') from public.cai_ranges where cai='TEST-RESTORE-TGU'$q$,'prefijo SAR');
reset role;
select set_config('request.jwt.claims','{}',true);
-- APPLY_RESTORED_TGU_PREFIX_MIGRATION
select pg_temp.assert_true(exists(select 1 from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa' and establishment_code='000' and emission_point_code='001'),'TGU restored to original 000-001');
select pg_temp.assert_true(exists(select 1 from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name='San Pedro Sula' and establishment_code='001' and emission_point_code='001'),'SPS preserved');
select pg_temp.assert_true(not exists(select 1 from restore_before b full join public.cai_ranges c using(id) where b.data is distinct from to_jsonb(c)),'All CAI fields including active, revision, dates and serials unchanged');
select pg_temp.assert_true(not exists(select 1 from public.cai_ranges where point_of_sale='Tegucigalpa' and is_active),'Only the master chooses reactivation');
select pg_temp.assert_true(exists(select 1 from public.activity_logs where user_id is null and metadata->>'source_migration'='20261029170000' and metadata->'after'->>'emission_point_code'='001' and metadata->>'automatic_reactivation'='false'),'Repair audited without impersonation');
create temp table restore_audit_count as select count(*) n from public.activity_logs where metadata->>'source_migration'='20261029170000';
-- APPLY_RESTORED_TGU_PREFIX_MIGRATION
select pg_temp.assert_true((select n from restore_audit_count)=(select count(*) from public.activity_logs where metadata->>'source_migration'='20261029170000'),'Repair is idempotent');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce290000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_error($q$select public.set_cai_range_active(id,revision,true,'Intento sin master') from public.cai_ranges where cai='TEST-RESTORE-TGU'$q$,'máster');
select set_config('request.jwt.claims','{"sub":"ce290000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_cai_range_active(id,revision,true,'Reactivación decidida por master') from public.cai_ranges where point_of_sale='Tegucigalpa';
select pg_temp.assert_true((select count(*)=3 from public.cai_ranges where point_of_sale='Tegucigalpa' and is_active),'Master can reactivate each fiscal document independently');
select pg_temp.assert_true((select next_number=53 from public.cai_ranges where cai='TEST-RESTORE-TGU') and (select next_number=12 from public.cai_ranges where cai='TEST-RESTORE-ND') and (select next_number=1 from public.cai_ranges where cai='TEST-RESTORE-BC'),'Reactivation preserves all serials');
reset role;
select pg_temp.assert_true(not exists(select 1 from restore_before b join public.cai_ranges c using(id) where b.data-array['is_active','revision'] is distinct from to_jsonb(c)-array['is_active','revision']),'No CAI identity, bounds, dates or consumption rewritten');
select pg_temp.assert_true(exists(select 1 from pg_trigger where tgrelid='public.billing_offices'::regclass and tgname='zz_fiscal_office_codes' and tgenabled='O'),'Office-code guard stays enabled');
set constraints all immediate;
rollback;

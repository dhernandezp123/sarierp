\set ON_ERROR_STOP on
begin;
reset role;
select set_config('request.jwt.claims','{}',true);
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
do $$begin if exists(select 1 from public.cai_ranges where tenant_id='00000000-0000-4000-8000-000000000001') then raise exception 'Disposable Sari fixture must have no fiscal ranges';end if;end $$;
insert into public.tenants(id,slug,name) values('00000000-0000-4000-8000-000000000001','tgu-confirm-fixture','Empresa ficticia') on conflict(id) do nothing;
insert into public.company_settings(tenant_id,legal_name,billing_points_of_sale) values('00000000-0000-4000-8000-000000000001','Empresa ficticia',array['San Pedro Sula','Tegucigalpa']) on conflict(tenant_id) do nothing;
insert into public.billing_offices(tenant_id,name,establishment_code,emission_point_code) values
 ('00000000-0000-4000-8000-000000000001','San Pedro Sula','001','001'),
 ('00000000-0000-4000-8000-000000000001','Tegucigalpa','000','001')
 on conflict(tenant_id,name) do update set establishment_code=excluded.establishment_code,emission_point_code=excluded.emission_point_code;
insert into public.cai_ranges(tenant_id,cai,point_of_sale,document_type,rango_desde,rango_hasta,next_number,fecha_limite_emision,is_active) values
 ('00000000-0000-4000-8000-000000000001','TEST-CONFIRM-SPS','San Pedro Sula','Factura','001-001-01-00000001','001-001-01-00000100',42,current_date+30,true),
 ('00000000-0000-4000-8000-000000000001','TEST-CONFIRM-TGU','Tegucigalpa','Factura','000-001-01-00000001','000-001-01-00000100',53,current_date+30,true),
 ('00000000-0000-4000-8000-000000000001','TEST-CONFIRM-TGU-INACTIVE','Tegucigalpa','Boleta de Compra','000-001-11-00000001','000-001-11-00000100',1,current_date+30,false);
create temp table before_tgu_confirmation as select id,to_jsonb(c) data from public.cai_ranges c;
select pg_temp.expect_error($sql$update public.billing_offices set emission_point_code='000' where name='Tegucigalpa' and tenant_id='00000000-0000-4000-8000-000000000001'$sql$,'rangos CAI registrados');
savepoint issued_document;
update public.company_settings set rtn='08019999123456',address='Domicilio ficticio' where tenant_id='00000000-0000-4000-8000-000000000001';
update public.billing_offices set address='Domicilio ficticio',phone='00000000',email='tgu@test.local' where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa';
insert into public.clientes(id,tenant_id,nombre,billing_office_id) select 'cf280000-0000-4000-8000-000000000001',tenant_id,'Cliente ficticio TGU',id from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa';
insert into public.invoices(tenant_id,cliente_id,invoice_type,invoice_number,point_of_sale,cai,subtotal,total)
 values('00000000-0000-4000-8000-000000000001','cf280000-0000-4000-8000-000000000001','Factura','000-001-01-00000053','Tegucigalpa','TEST-CONFIRM-TGU',100,100);
select pg_temp.expect_error($issued$
-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION
$issued$,'TGU ya tiene documentos fiscales emitidos');
select pg_temp.assert_true((select b.data=to_jsonb(c) from before_tgu_confirmation b join public.cai_ranges c using(id) where c.cai='TEST-CONFIRM-TGU'),'El bloqueo por documentos no cambia el CAI');
rollback to savepoint issued_document;
-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION
select pg_temp.assert_true(exists(select 1 from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa' and establishment_code='000' and emission_point_code='000'),'TGU toma 000-000 confirmado');
select pg_temp.assert_true(exists(select 1 from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name='San Pedro Sula' and establishment_code='001' and emission_point_code='001'),'SPS conserva 001-001');
select pg_temp.assert_true(not exists(select 1 from public.cai_ranges where point_of_sale='Tegucigalpa' and tenant_id='00000000-0000-4000-8000-000000000001' and is_active),'Series antiguas TGU quedan desactivadas');
select pg_temp.assert_true(not exists(select 1 from before_tgu_confirmation b join public.cai_ranges c using(id) where b.data-array['is_active','revision'] is distinct from to_jsonb(c)-array['is_active','revision']),'CAI, rangos, fechas, consumo y todos los demás campos se conservan');
select pg_temp.assert_true((select b.data=to_jsonb(c) from before_tgu_confirmation b join public.cai_ranges c using(id) where c.cai='TEST-CONFIRM-SPS'),'La serie SPS permanece íntegra');
select pg_temp.assert_true(exists(select 1 from public.cai_range_events where action='Desactivación' and reason like 'CAI-CONFIRM-02:%' and after_values->>'cai'='TEST-CONFIRM-TGU' and after_values->>'next_number'='53'),'Desactivación auditada con su correlativo');
select pg_temp.assert_true(exists(select 1 from public.activity_logs where user_id is null and metadata->>'source_migration'='20261028180000' and metadata->'before'->>'emission_point_code'='001' and metadata->'after'->>'emission_point_code'='000'),'Corrección de oficina auditada sin suplantar usuario');
select pg_temp.assert_true(exists(select 1 from pg_trigger where tgrelid='public.billing_offices'::regclass and tgname='zz_fiscal_office_codes' and tgenabled='O'),'Protección fiscal restaurada');
select pg_temp.expect_error($sql$update public.cai_ranges set is_active=true where cai='TEST-CONFIRM-TGU'$sql$,'prefijo SAR');
select pg_temp.expect_error($sql$update public.cai_ranges set rango_desde='000-000-01-00000001',rango_hasta='000-000-01-00000100' where cai='TEST-CONFIRM-TGU'$sql$,'Conserva el CAI');
insert into public.cai_ranges(tenant_id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active) values
 ('00000000-0000-4000-8000-000000000001','TEST-CONFIRM-NEW-TGU','Tegucigalpa','Factura','000-000-01-00000001','000-000-01-00000100',current_date+30,true);
create temp table after_tgu_confirmation as select jsonb_agg(to_jsonb(c) order by id) data from public.cai_ranges c;
create temp table after_tgu_audit as select count(*) n from public.activity_logs where metadata->>'source_migration'='20261028180000';
-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION
select pg_temp.assert_true((select data from after_tgu_confirmation)=(select jsonb_agg(to_jsonb(c) order by id) from public.cai_ranges c),'Reaplicar no cambia rangos ni consume números');
select pg_temp.assert_true((select n from after_tgu_audit)=(select count(*) from public.activity_logs where metadata->>'source_migration'='20261028180000'),'Reaplicar no duplica auditoría');
savepoint unexpected_code;
alter table public.billing_offices disable trigger zz_fiscal_office_codes;
update public.billing_offices set emission_point_code='002' where name='Tegucigalpa' and tenant_id='00000000-0000-4000-8000-000000000001';
alter table public.billing_offices enable trigger zz_fiscal_office_codes;
select pg_temp.expect_error($unexpected$
-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION
$unexpected$,'La oficina TGU cambió');
rollback to savepoint unexpected_code;
set constraints all immediate;
rollback;

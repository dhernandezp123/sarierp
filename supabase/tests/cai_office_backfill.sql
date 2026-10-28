\set ON_ERROR_STOP on
begin;
reset role;
select set_config('request.jwt.claims','{}',true);
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
-- Only a disposable fixture: never replay this test against a populated Sari DB.
do $$begin if exists(select 1 from public.cai_ranges where tenant_id='00000000-0000-4000-8000-000000000001') then raise exception 'Disposable Sari fixture must have no fiscal ranges';end if;end $$;
insert into public.tenants(id,slug,name) values('00000000-0000-4000-8000-000000000001','cai-backfill-fixture','Empresa ficticia') on conflict(id) do nothing;
insert into public.company_settings(tenant_id,legal_name,billing_points_of_sale) values('00000000-0000-4000-8000-000000000001','Empresa ficticia',array['San Pedro Sula','Tegucigalpa']) on conflict(tenant_id) do nothing;
-- Recreate the pre-migration guard state inside this rollback-only test.
drop trigger zzz_cai_office_binding on public.cai_ranges;
drop function public.guard_cai_office_binding();
drop trigger zz_fiscal_office_codes on public.billing_offices;
drop function public.guard_fiscal_office_codes();
insert into public.billing_offices(tenant_id,name,establishment_code,emission_point_code) values
 ('00000000-0000-4000-8000-000000000001','San Pedro Sula','001','001'),
 ('00000000-0000-4000-8000-000000000001','Tegucigalpa','000','000')
 on conflict(tenant_id,name) do update set establishment_code=excluded.establishment_code,emission_point_code=excluded.emission_point_code;
insert into public.cai_ranges(tenant_id,cai,point_of_sale,document_type,rango_desde,rango_hasta,next_number,fecha_limite_emision,is_active) values
 ('00000000-0000-4000-8000-000000000001','TEST-BACKFILL-SPS','San Pedro Sula','Factura','001-001-01-00000001','001-001-01-00000100',42,current_date+30,false),
 ('00000000-0000-4000-8000-000000000001','TEST-BACKFILL-TGU','Tegucigalpa','Factura','000-001-01-00000001','000-001-01-00000100',53,current_date+30,true);
create temp table before_cai_binding as select jsonb_agg(to_jsonb(c) order by id) data from public.cai_ranges c;
-- APPLY_CONFIRMED_OFFICE_BINDING_MIGRATION
select pg_temp.assert_true(exists(select 1 from public.billing_offices where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa' and establishment_code='000' and emission_point_code='001'),'Corrige únicamente el punto TGU confirmado');
select pg_temp.assert_true((select data from before_cai_binding)=(select jsonb_agg(to_jsonb(c) order by id) from public.cai_ranges c),'CAI, rango, fecha, estado, revisión y correlativo quedan íntegros');
select pg_temp.assert_true(exists(select 1 from public.activity_logs where tenant_id='00000000-0000-4000-8000-000000000001' and user_id is null and metadata->>'source_migration'='20261028150000' and metadata->'before'->>'emission_point_code'='000' and metadata->'after'->>'emission_point_code'='001'),'Audita reparación sin suplantar a un usuario');
alter table public.billing_offices disable trigger zz_fiscal_office_codes;
update public.billing_offices set emission_point_code='002' where tenant_id='00000000-0000-4000-8000-000000000001' and name='Tegucigalpa';
select pg_temp.expect_error($unconfirmed$
-- APPLY_CONFIRMED_OFFICE_BINDING_MIGRATION
$unconfirmed$,'requiere revisión');
set constraints all immediate;
rollback;

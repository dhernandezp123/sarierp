begin;

insert into public.clientes(id, tenant_id, codigo_cliente, nombre)
values ('10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001', 'ATLAS-DEMO', 'Atlas Forwarding Demo')
on conflict (id) do nothing;
update public.platform_environment
set dataset_version = 'atlas-forwarding-demo-v1', dataset_seeded_at = now(),
    dataset_client_id = '10000000-0000-4000-8000-000000000001'
where singleton;

create temp table quotation_catalog_original as
select * from public.client_rates;

-- APPLY_DEMO_QUOTATION_CATALOG_MIGRATION

create temp table quotation_catalog_counts as
select (select count(*) from public.container_types) as containers,
       (select count(*) from public.countries) as countries,
       (select count(*) from public.ports) as ports,
       (select count(*) from public.client_rates) as rates;

-- APPLY_DEMO_QUOTATION_CATALOG_MIGRATION

do $$
begin
  if exists (select * from quotation_catalog_original except select * from public.client_rates)
     or exists (
       select 1 from public.client_rates rate
       where rate.cliente_id <> '10000000-0000-4000-8000-000000000001'
         and not exists (select 1 from quotation_catalog_original old where old.id = rate.id)
     )
  then raise exception 'Existing rates must be preserved and new rates must belong to Atlas'; end if;

  if exists (
    select 1 from quotation_catalog_counts
    where containers <> (select count(*) from public.container_types)
       or countries <> (select count(*) from public.countries)
       or ports <> (select count(*) from public.ports)
       or rates <> (select count(*) from public.client_rates)
  ) then raise exception 'Reapplying the Demo seed created duplicates'; end if;
end $$;

insert into auth.users(id, email, raw_user_meta_data)
values ('de261100-0000-4000-8000-000000000001','demo-catalog-uat@example.invalid','{}');
update public.profiles set rol = 'Admin', status = 'Aprobado', is_active = true,
  tenant_id = '00000000-0000-4000-8000-000000000001', is_demo_user = true,
  demo_expires_at = now() + interval '1 day',
  demo_access_grant_id = 'de261100-0000-4000-8000-000000000099'
where id = 'de261100-0000-4000-8000-000000000001';

set local role authenticated;
do $$
declare
  destination text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"de261100-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"de261100-0000-4000-8000-000000000099"}}', true);
  if not public.is_demo_access_active() then raise exception 'Demo actor is not active'; end if;
  if (select count(*) from public.container_types where name in ('Breakbulk','20GP','40HC','Dry Van 53 ft') and active) <> 4
     or not exists (select 1 from public.countries where name = 'Honduras' and active)
     or (select count(distinct type) from public.ports where active) < 4
  then raise exception 'Demo actor cannot read complete quotation options'; end if;

  foreach destination in array array['SPS','TGU'] loop
    if (select count(distinct rate_code) from public.client_rates
        where cliente_id = '10000000-0000-4000-8000-000000000001'
          and (miami_rate_destination = destination or miami_rate_destination is null)
          and is_active and amount > 0
          and rate_code in ('consolidado_aereo_kg','lcl_maritimo_sps_ft3','lcl_maritimo_sps_lbs',
            'small_maritimo_min_lcl_1000_lbs_45_ft3','minimo_maritimo_2mil_lbs_90_ft3')) <> 5
    then raise exception 'Missing Demo freight rates for %', destination; end if;
  end loop;
end $$;
reset role;

select set_config('request.jwt.claims', '{}', true);
update public.profiles set demo_expires_at = now() - interval '1 minute'
where id = 'de261100-0000-4000-8000-000000000001';
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"de261100-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"de261100-0000-4000-8000-000000000099"}}', true);
  if public.is_demo_access_active()
    or exists (select 1 from public.container_types)
    or exists (select 1 from public.client_rates)
  then raise exception 'Expired Demo actor can read catalogue'; end if;
end $$;
reset role;

select 'PASS Demo quotation catalogs, rates, idempotency and temporary access' as result;
rollback;

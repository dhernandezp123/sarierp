-- DEMO-BILLING-01: configuration for demonstration documents without fiscal validity.
do $$
declare
  demo public.platform_environment%rowtype;
  atlas_tenant uuid;
  sps_office uuid;
  previous_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('demo_billing_fixtures', 0));
  select * into strict demo from public.platform_environment where singleton;
  if demo.environment is distinct from 'demo'
    or demo.project_ref is distinct from 'wlssekvxpfxhwedsjhpz'
    or demo.reset_enabled is distinct from false
  then raise exception 'Demo sentinel required'; end if;

  -- A clean disposable Demo database may not have any seeded customers.
  if demo.dataset_client_id is null and demo.dataset_seeded_at is null
    and demo.dataset_version is null
  then return; end if;

  if demo.dataset_version is distinct from 'atlas-forwarding-demo-v1'
    or demo.dataset_client_id is distinct from '10000000-0000-4000-8000-000000000001'::uuid
    or demo.dataset_seeded_at is null
  then raise exception 'Verified Atlas Demo dataset required'; end if;

  select c.tenant_id into strict atlas_tenant
  from public.clientes c
  join public.tenant_domains d on d.tenant_id = c.tenant_id
  join public.company_settings company on company.tenant_id = c.tenant_id
  where c.id = demo.dataset_client_id and c.codigo_cliente = 'ATLAS-DEMO'
    and c.rtn like 'DEMO-%' and company.rtn like 'DEMO-%'
    and d.hostname = 'demo.forwarders.app' and d.is_active;

  update public.billing_offices o
  set address = coalesce(nullif(btrim(o.address), ''), fixture.address),
      phone = coalesce(nullif(btrim(o.phone), ''), '0000-0000'),
      email = coalesce(nullif(btrim(o.email), ''), fixture.email),
      establishment_code = coalesce(nullif(o.establishment_code, ''), fixture.establishment),
      emission_point_code = coalesce(nullif(o.emission_point_code, ''), '001')
  from (values
    ('San Pedro Sula', 'Atlas Demo · Dirección ficticia, San Pedro Sula', 'sps@example.invalid', '901'),
    ('Tegucigalpa', 'Atlas Demo · Dirección ficticia, Tegucigalpa', 'tgu@example.invalid', '902')
  ) as fixture(office, address, email, establishment)
  where o.tenant_id = atlas_tenant and o.name = fixture.office and o.is_active
    and (btrim(o.address) = '' or btrim(o.phone) = '' or btrim(o.email) = ''
         or o.establishment_code = '' or o.emission_point_code = '');

  if (select count(*) from public.billing_offices o where o.tenant_id = atlas_tenant
    and o.is_active and o.name in ('San Pedro Sula','Tegucigalpa')) <> 2
  then raise exception 'Expected two active Atlas Demo offices'; end if;

  select id into strict sps_office from public.billing_offices
  where tenant_id = atlas_tenant and name = 'San Pedro Sula' and is_active;
  update public.clientes set billing_office_id = sps_office
  where id = demo.dataset_client_id and tenant_id = atlas_tenant and billing_office_id is null;

  previous_reason := current_setting('app.cai_change_reason', true);
  perform set_config('app.cai_change_reason', 'Rango ficticio Atlas Demo sin validez fiscal', true);
  insert into public.cai_ranges(
    tenant_id, cai, point_of_sale, document_type, rango_desde, rango_hasta,
    fecha_limite_emision, lugar_emision, is_active
  )
  select atlas_tenant, fixture.cai, o.name, 'Factura',
    o.establishment_code || '-' || o.emission_point_code || '-01-00000001',
    o.establishment_code || '-' || o.emission_point_code || '-01-00000100',
    (now() at time zone 'America/Tegucigalpa')::date + 365,
    o.name || ' · Ambiente Demo', true
  from (values
    ('San Pedro Sula', 'DEMO-SPS-SIN-VALIDEZ'),
    ('Tegucigalpa', 'DEMO-TGU-SIN-VALIDEZ')
  ) as fixture(office, cai)
  join public.billing_offices o on o.tenant_id = atlas_tenant and o.name = fixture.office and o.is_active
  where not exists (
    select 1 from public.cai_ranges existing
    where existing.tenant_id = atlas_tenant and existing.point_of_sale = o.name
      and existing.document_type = 'Factura'
  );
  perform set_config('app.cai_change_reason', coalesce(previous_reason, ''), true);
end $$;

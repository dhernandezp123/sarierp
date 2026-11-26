-- DEMO-CATALOG-01: reference data and fictitious rates for the shared sandbox.
do $$
declare
  demo public.platform_environment%rowtype;
  atlas_tenant uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('demo_quotation_catalogs', 0));
  select * into strict demo from public.platform_environment where singleton;
  if demo.environment is distinct from 'demo'
    or demo.project_ref is distinct from 'wlssekvxpfxhwedsjhpz'
    or demo.reset_enabled is distinct from false
  then
    raise exception 'Demo sentinel required';
  end if;

  insert into public.container_types(name, category, active)
  select fixture.name, fixture.category, true
  from (values
    ('20GP', 'FCL'), ('40GP', 'FCL'), ('40HC', 'FCL'), ('45HC', 'FCL'),
    ('20RF', 'FCL'), ('40RF', 'FCL'), ('20OT', 'FCL'), ('40OT', 'FCL'),
    ('20FR', 'FCL'), ('40FR', 'FCL'),
    ('Camión 26 ft', 'FTL'), ('Dry Van 53 ft', 'FTL'), ('Flatbed 48 ft', 'FTL')
  ) as fixture(name, category)
  where not exists (
    select 1 from public.container_types existing
    where lower(btrim(existing.name)) = lower(fixture.name)
  );

  insert into public.countries(name, active)
  select fixture.name, true
  from (values
    ('Honduras'), ('Estados Unidos'), ('China'), ('Guatemala'),
    ('El Salvador'), ('Nicaragua'), ('Costa Rica'), ('Panamá'),
    ('México'), ('Colombia')
  ) as fixture(name)
  where not exists (
    select 1 from public.countries existing
    where lower(btrim(existing.name)) = lower(fixture.name)
  );

  insert into public.ports(name, country_id, type, active)
  select fixture.name, country.id, fixture.kind, true
  from (values
    ('Puerto Cortés', 'Honduras', 'Puerto'),
    ('Aeropuerto Ramón Villeda Morales (SAP)', 'Honduras', 'Aeropuerto'),
    ('Aeropuerto Internacional de Palmerola (XPL)', 'Honduras', 'Aeropuerto'),
    ('San Pedro Sula', 'Honduras', 'Ciudad'),
    ('Tegucigalpa', 'Honduras', 'Ciudad'),
    ('El Florido', 'Honduras', 'Frontera'),
    ('Puerto de Miami', 'Estados Unidos', 'Puerto'),
    ('Aeropuerto Internacional de Miami (MIA)', 'Estados Unidos', 'Aeropuerto'),
    ('Miami, FL', 'Estados Unidos', 'Ciudad'),
    ('Houston, TX', 'Estados Unidos', 'Ciudad'),
    ('Los Ángeles', 'Estados Unidos', 'Puerto'),
    ('Shanghái', 'China', 'Puerto'),
    ('Ningbo', 'China', 'Puerto'),
    ('Aeropuerto Internacional de Shanghái-Pudong (PVG)', 'China', 'Aeropuerto'),
    ('Puerto Santo Tomás de Castilla', 'Guatemala', 'Puerto'),
    ('Ciudad de Guatemala', 'Guatemala', 'Ciudad'),
    ('San Salvador', 'El Salvador', 'Ciudad'),
    ('Managua', 'Nicaragua', 'Ciudad'),
    ('Puerto Limón', 'Costa Rica', 'Puerto'),
    ('Colón', 'Panamá', 'Puerto'),
    ('Manzanillo', 'México', 'Puerto'),
    ('Cartagena', 'Colombia', 'Puerto')
  ) as fixture(name, country_name, kind)
  join lateral (
    select id from public.countries
    where lower(btrim(name)) = lower(fixture.country_name)
    order by active desc nulls last, id limit 1
  ) country on true
  where not exists (
    select 1 from public.ports existing
    where existing.country_id = country.id
      and lower(btrim(existing.name)) = lower(fixture.name)
      and existing.type = fixture.kind
  );

  -- A clean Demo installation has the schema but may not have an Atlas dataset.
  if demo.dataset_client_id is null and demo.dataset_seeded_at is null
    and demo.dataset_version is null
  then
    return;
  end if;

  if demo.dataset_version is distinct from 'atlas-forwarding-demo-v1'
    or demo.dataset_client_id is distinct from '10000000-0000-4000-8000-000000000001'::uuid
    or demo.dataset_seeded_at is null
  then
    raise exception 'Verified Atlas Demo dataset required for fictitious rates';
  end if;

  select c.tenant_id into strict atlas_tenant
  from public.clientes c
  join public.tenant_domains d on d.tenant_id = c.tenant_id
  where c.id = demo.dataset_client_id and c.codigo_cliente = 'ATLAS-DEMO'
    and d.hostname = 'demo.forwarders.app' and d.is_active;

  -- These amounts are synthetic for demonstration. Preserve existing records,
  -- including an explicitly inactive rate or a global rate used as fallback.
  insert into public.client_rates(
    tenant_id, cliente_id, rate_code, rate_label, category, unit,
    currency, amount, is_active, miami_rate_destination, notes
  )
  select atlas_tenant, demo.dataset_client_id, fixture.code,
    replace(catalog.label, 'SPS', fixture.destination),
    catalog.category, catalog.unit, 'USD', fixture.amount, true, fixture.destination,
    'Tarifa ficticia para pruebas de Demo. Sin validez comercial.'
  from (values
    ('SPS', 'lcl_maritimo_sps_ft3', 4.25),
    ('SPS', 'lcl_maritimo_sps_lbs', 0.26),
    ('SPS', 'small_maritimo_min_lcl_1000_lbs_45_ft3', 165.00),
    ('SPS', 'minimo_maritimo_2mil_lbs_90_ft3', 325.00),
    ('SPS', 'consolidado_aereo_kg', 3.85),
    ('TGU', 'lcl_maritimo_sps_ft3', 4.65),
    ('TGU', 'lcl_maritimo_sps_lbs', 0.29),
    ('TGU', 'small_maritimo_min_lcl_1000_lbs_45_ft3', 185.00),
    ('TGU', 'minimo_maritimo_2mil_lbs_90_ft3', 360.00),
    ('TGU', 'consolidado_aereo_kg', 4.20)
  ) as fixture(destination, code, amount)
  join public.client_rate_catalog catalog on catalog.code = fixture.code and catalog.active
  where not exists (
    select 1 from public.client_rates existing
    where existing.cliente_id = demo.dataset_client_id and existing.rate_code = fixture.code
      and (existing.miami_rate_destination is null or existing.miami_rate_destination = fixture.destination)
  )
  on conflict (cliente_id, rate_code, miami_rate_destination)
    where miami_rate_destination is not null
  do nothing;
end $$;

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_failure(command text, message text)
returns void
language plpgsql
as $$
declare
  failed boolean := false;
begin
  begin
    execute command;
  exception when others then
    failed := true;
  end;

  if not failed then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_sqlstate(
  command text,
  expected_state text,
  message text
)
returns void
language plpgsql
as $$
declare
  observed_state text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics observed_state = returned_sqlstate;
    if observed_state is distinct from expected_state then
      raise exception
        'ASSERTION FAILED: % (SQLSTATE esperado %, recibido %)',
        message,
        expected_state,
        observed_state;
    end if;
    return;
  end;

  raise exception
    'ASSERTION FAILED: % (la sentencia no fue rechazada)',
    message;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 11
      and bool_and(permissive = 'RESTRICTIVE')
      and bool_and(cmd = 'DELETE')
      and bool_and('authenticated' = any (roles))
    from pg_policies
    where schemaname = 'public'
      and policyname = tablename || '_demo_root_delete_guard'
      and tablename in (
        'clientes',
        'quotations',
        'invoices',
        'shipping_instructions',
        'shipments',
        'bookings',
        'bills_of_lading',
        'miami_manifests',
        'miami_shipments',
        'miami_packages',
        'cuentas_pagar'
      )
  ),
  'Las once entidades raiz deben tener un guard DELETE restrictivo en demo'
);

-- El escenario parte del modo seguro por defecto. Cada identidad demo se
-- restringe por su perfil, sin convertir todo el proyecto local en demo.
update public.platform_environment
set environment = 'production',
    project_ref = null,
    reset_enabled = false,
    reset_armed_at = null,
    dataset_version = null,
    dataset_seeded_at = null,
    dataset_client_id = null
where singleton is true;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  (
    'a1000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'normal-admin-demo-foundation@test.local',
    '{}'::jsonb
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'demo-admin-demo-foundation@test.local',
    '{}'::jsonb
  ),
  (
    'a3000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'demo-client-demo-foundation@test.local',
    '{}'::jsonb
  ),
  (
    'a4000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'expired-demo-foundation@test.local',
    '{}'::jsonb
  ),
  (
    'a5000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'managed-user-demo-foundation@test.local',
    '{}'::jsonb
  ),
  (
    'a6000000-0000-0000-0000-000000000006',
    'authenticated',
    'authenticated',
    'platform-admin-demo-foundation@test.local',
    '{}'::jsonb
  );

insert into public.clientes (id, nombre, rtn, direccion, email_1)
values
  (
    'b1000000-0000-0000-0000-000000000001',
    'Cliente Demo Propio',
    '08011999111111',
    'San Pedro Sula, Honduras',
    'cliente-propio@test.local'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'Cliente Demo Ajeno',
    '08011999222222',
    'Tegucigalpa, Honduras',
    'cliente-ajeno@test.local'
  );

update public.profiles
set rol = case id
      when 'a1000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
      when 'a2000000-0000-0000-0000-000000000002' then 'Admin'::public.user_role
      when 'a3000000-0000-0000-0000-000000000003' then 'Cliente'::public.user_role
      when 'a4000000-0000-0000-0000-000000000004' then 'Operaciones'::public.user_role
      when 'a5000000-0000-0000-0000-000000000005' then 'Ventas'::public.user_role
      else 'Admin'::public.user_role
    end,
    nombre = case id
      when 'a1000000-0000-0000-0000-000000000001' then 'Admin normal'
      when 'a2000000-0000-0000-0000-000000000002' then 'Admin demo'
      when 'a3000000-0000-0000-0000-000000000003' then 'Cliente demo'
      when 'a4000000-0000-0000-0000-000000000004' then 'Demo vencido'
      when 'a5000000-0000-0000-0000-000000000005' then 'Usuario administrado'
      else 'Admin de plataforma'
    end,
    status = 'Aprobado',
    is_active = true,
    is_demo_user = id in (
      'a2000000-0000-0000-0000-000000000002',
      'a3000000-0000-0000-0000-000000000003',
      'a4000000-0000-0000-0000-000000000004'
    ),
    demo_expires_at = case
      when id in (
        'a2000000-0000-0000-0000-000000000002',
        'a3000000-0000-0000-0000-000000000003'
      ) then now() + interval '1 day'
      when id = 'a4000000-0000-0000-0000-000000000004'
        then now() - interval '1 minute'
      else null
    end,
    demo_access_grant_id = case
      when id = 'a2000000-0000-0000-0000-000000000002'
        then '92000000-0000-4000-8000-000000000002'::uuid
      when id = 'a3000000-0000-0000-0000-000000000003'
        then '93000000-0000-4000-8000-000000000003'::uuid
      when id = 'a4000000-0000-0000-0000-000000000004'
        then '94000000-0000-4000-8000-000000000004'::uuid
      else null
    end,
    is_platform_admin = id = 'a6000000-0000-0000-0000-000000000006',
    cliente_id = case
      when id = 'a3000000-0000-0000-0000-000000000003'
        then 'b1000000-0000-0000-0000-000000000001'::uuid
      when id = 'a4000000-0000-0000-0000-000000000004'
        then 'b2000000-0000-0000-0000-000000000002'::uuid
      else null
    end
where id in (
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002',
  'a3000000-0000-0000-0000-000000000003',
  'a4000000-0000-0000-0000-000000000004',
  'a5000000-0000-0000-0000-000000000005',
  'a6000000-0000-0000-0000-000000000006'
);

insert into public.company_settings (id, legal_name)
values (
  'c1000000-0000-0000-0000-000000000001',
  'Configuración inicial de prueba'
);

insert into public.agents (id, name, type)
values (
  'f1000000-0000-0000-0000-000000000001',
  'Agente maestro inicial',
  'Agente'
);

insert into public.agent_route_rates (
  id,
  agent_id,
  origin,
  destination,
  service_type,
  base_rate
)
values (
  'f2000000-0000-0000-0000-000000000002',
  'f1000000-0000-0000-0000-000000000001',
  'CNSHA',
  'HNPCR',
  'FCL 40HC',
  2500
);

insert into public.proveedores (id, nombre, tipo, agente_id)
values (
  'f3000000-0000-0000-0000-000000000003',
  'Proveedor maestro inicial',
  'Agente',
  'f1000000-0000-0000-0000-000000000001'
);

insert into public.cai_ranges (
  id,
  cai,
  document_type,
  rango_desde,
  rango_hasta,
  fecha_limite_emision,
  lugar_emision,
  is_active
)
values (
  'c2000000-0000-0000-0000-000000000002',
  'CAI-DEMO-FOUNDATION',
  'Factura',
  '000-001-01-00001001',
  '000-001-01-00001100',
  current_date + 30,
  'Ubicación inicial',
  false
);

insert into public.miami_manifests (id, manifest_number)
values
  (
    'd1000000-0000-0000-0000-000000000001',
    'MAN-DEMO-FOUNDATION-NORMAL'
  ),
  (
    'd2000000-0000-0000-0000-000000000002',
    'MAN-DEMO-FOUNDATION-BLOCKED'
  );

insert into public.miami_packages (
  id,
  tracking_number,
  cliente_id,
  tipo_carga,
  cargo_status,
  weight_lbs
)
values
  (
    'e1000000-0000-0000-0000-000000000001',
    'DEMO-CLIENT-OWN-PACKAGE',
    'b1000000-0000-0000-0000-000000000001',
    'Paquetería',
    'Recibido en Miami',
    1
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'DEMO-CLIENT-FOREIGN-PACKAGE',
    'b2000000-0000-0000-0000-000000000002',
    'Paquetería',
    'Recibido en Miami',
    1
  );

insert into public.leads (nombre, empresa, email, telefono)
values (
  'Lead Demo Foundation',
  'Empresa Demo Foundation',
  'lead-demo-foundation@test.local',
  '+504 9999-9999'
);

insert into public.countries (name)
values ('País Demo Foundation');

set local role authenticated;

-- Un Admin no-demo conserva las capacidades existentes del ERP. Los leads se
-- mantienen separados y requieren el privilegio adicional de plataforma.
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  public.current_user_role() = 'Admin',
  'El Admin normal debe conservar su rol operativo'
);
select pg_temp.assert_true(
  public.is_demo_access_active(),
  'El Admin normal debe conservar acceso activo'
);
select pg_temp.assert_true(
  not public.is_restricted_demo_context(),
  'El Admin normal no debe quedar restringido en production'
);
select pg_temp.assert_true(
  not public.is_platform_admin(),
  'Un Admin normal de cliente no debe convertirse en Admin de plataforma'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.leads
    where email = 'lead-demo-foundation@test.local'
  ),
  'Un Admin normal de cliente no debe leer los leads privados de Hernova'
);

with changed as (
  update public.company_settings
  set legal_name = 'Configuración actualizada por Admin normal'
  where id = 'c1000000-0000-0000-0000-000000000001'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 1 from changed),
  'El Admin normal debe modificar company_settings'
);

with changed as (
  update public.agents
  set name = 'Agente actualizado por Admin normal'
  where id = 'f1000000-0000-0000-0000-000000000001'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 1 from changed),
  'El Admin normal debe modificar el catálogo de agentes'
);

with changed as (
  update public.profiles
  set nombre = 'Usuario actualizado por Admin normal'
  where id = 'a5000000-0000-0000-0000-000000000005'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 1 from changed),
  'El Admin normal debe administrar perfiles'
);

select pg_temp.assert_true(
  public.activate_cai_range(
    'c2000000-0000-0000-0000-000000000002'
  ) = 'c2000000-0000-0000-0000-000000000002'::uuid,
  'El Admin normal debe activar rangos CAI'
);

select pg_temp.assert_true(
  (
    select result.manifest_number = 'MAN-DEMO-FOUNDATION-NORMAL'
      and result.deleted_packages = 0
    from public.delete_miami_manifest(
      'd1000000-0000-0000-0000-000000000001',
      'Control positivo de permisos del Admin normal'
    ) as result
  ),
  'El Admin normal debe conservar delete_miami_manifest'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a6000000-0000-0000-0000-000000000006","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  public.is_platform_admin(),
  'El Admin de plataforma no-demo debe conservar su privilegio privado'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.leads
    where email = 'lead-demo-foundation@test.local'
  ),
  'El Admin de plataforma debe leer los leads'
);

-- Al activar el sentinel demo, incluso una cuenta normal aprobada queda fuera.
-- Solo los perfiles marcados como demo y no vencidos reciben rol operativo.
reset role;

update public.platform_environment
set environment = 'demo',
    project_ref = 'wlssekvxpfxhwedsjhpz',
    reset_enabled = false,
    reset_armed_at = null,
    dataset_version = 'atlas-forwarding-demo-v1',
    dataset_seeded_at = clock_timestamp(),
    dataset_client_id = '10000000-0000-4000-8000-000000000001'::uuid
where singleton is true;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_failure(
  $$insert into public.leads (nombre, empresa, email, telefono)
    values (
      'Intento anonimo Demo',
      'Empresa no permitida',
      'spam-demo-foundation@test.local',
      '+504 0000-0000'
    )$$,
  'El endpoint anonimo de leads debe cerrarse dentro del proyecto demo'
);
reset role;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  public.current_user_role() is null
    and not public.is_demo_access_active()
    and public.is_restricted_demo_context(),
  'Una cuenta normal no debe operar dentro del proyecto demo'
);

-- El Admin Demo recorre datos operativos, pero no accede a leads ni cambia
-- configuración, permisos, CAI o manifiestos completos.
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"92000000-0000-4000-8000-000000000002"}}',
  true
);

select pg_temp.assert_true(
  public.current_user_role() = 'Admin'
    and public.current_user_is_demo()
    and public.is_demo_access_active()
    and public.is_restricted_demo_context(),
  'El Admin Demo activo debe conservar navegación con contexto restringido'
);
select pg_temp.assert_true(
  not public.is_platform_admin(),
  'Un Admin Demo nunca debe ser administrador de plataforma'
);
select pg_temp.assert_true(
  public.current_demo_access_grant_id()
    = '92000000-0000-4000-8000-000000000002'::uuid,
  'El Admin Demo debe exponer únicamente la concesión de su ventana actual'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"99000000-0000-4000-8000-000000000099"}}',
  true
);
select pg_temp.assert_true(
  public.current_user_role() is null
    and not public.is_demo_access_active(),
  'Un JWT de una concesion anterior no debe reutilizar el slot demo'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"92000000-0000-4000-8000-000000000002"}}',
  true
);

insert into public.demo_terms_acceptances (
  user_id,
  terms_version,
  access_grant_id,
  shared_sandbox_acknowledged
)
values (
  'a2000000-0000-0000-0000-000000000002',
  'demo-foundation-test-v1',
  '92000000-0000-4000-8000-000000000002',
  true
);

reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.demo_access_events
    where user_id = 'a2000000-0000-0000-0000-000000000002'
      and access_grant_id = '92000000-0000-4000-8000-000000000002'
      and event_type = 'terms_accepted'
  ),
  'La aceptación debe registrar la concesión exacta en la bitácora'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"99000000-0000-4000-8000-000000000099"}}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.demo_terms_acceptances
    where user_id = 'a2000000-0000-0000-0000-000000000002'
  ),
  'Un JWT anterior no debe leer aceptaciones del grant vigente'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"demo_access_grant_id":"92000000-0000-4000-8000-000000000002"}}',
  true
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.leads
    where email = 'lead-demo-foundation@test.local'
  ),
  'El Admin Demo no debe leer leads'
);

with changed as (
  update public.company_settings
  set legal_name = 'Cambio no permitido por Admin Demo'
  where id = 'c1000000-0000-0000-0000-000000000001'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from changed),
  'El Admin Demo no debe modificar company_settings'
);

with changed as (
  update public.agents
  set name = 'Cambio no permitido por Admin Demo'
  where id = 'f1000000-0000-0000-0000-000000000001'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from changed),
  'El Admin Demo no debe modificar agents'
);

with changed as (
  update public.agent_route_rates
  set base_rate = 9999
  where id = 'f2000000-0000-0000-0000-000000000002'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from changed),
  'El Admin Demo no debe modificar agent_route_rates'
);

with changed as (
  update public.proveedores
  set nombre = 'Cambio no permitido por Admin Demo'
  where id = 'f3000000-0000-0000-0000-000000000003'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from changed),
  'El Admin Demo no debe modificar proveedores'
);

with changed as (
  update public.profiles
  set nombre = 'Cambio no permitido por Admin Demo'
  where id = 'a5000000-0000-0000-0000-000000000005'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from changed),
  'El Admin Demo no debe modificar perfiles ajenos'
);

select pg_temp.expect_failure(
  $$update public.profiles
    set rol = 'Ventas'::public.user_role
    where id = 'a2000000-0000-0000-0000-000000000002'$$,
  'El Admin Demo no debe cambiar sus propios permisos'
);

select pg_temp.expect_failure(
  $$update public.profiles
    set nombre = 'Nombre alterado'
    where id = 'a2000000-0000-0000-0000-000000000002'$$,
  'El Admin Demo no debe cambiar su perfil compartido'
);

with changed as (
  update public.profiles
  set tutorial_completed = not tutorial_completed
  where id = 'a2000000-0000-0000-0000-000000000002'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 1 from changed),
  'El Admin Demo puede reiniciar su tutorial sin alterar identidad o permisos'
);

with changed as (
  update public.cai_ranges
  set lugar_emision = 'Cambio no permitido por Admin Demo'
  where id = 'c2000000-0000-0000-0000-000000000002'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from changed),
  'El Admin Demo no debe modificar cai_ranges'
);

select pg_temp.expect_sqlstate(
  $$select public.activate_cai_range(
      'c2000000-0000-0000-0000-000000000002'
    )$$,
  '42501',
  'El Admin Demo no debe ejecutar la RPC de activación CAI'
);

select pg_temp.expect_sqlstate(
  $$select *
    from public.create_invoice_with_items(
      '{"invoice_type":"Factura","cliente_id":"b1000000-0000-0000-0000-000000000001"}'::jsonb,
      '[{"description":"Intento fiscal demo","quantity":1,"unit_price":100,"isv_rate":15}]'::jsonb
    )$$,
  '42501',
  'El Admin Demo no debe emitir documentos fiscales ni consumir rangos CAI'
);

select pg_temp.expect_sqlstate(
  $$select *
    from public.delete_miami_manifest(
      'd2000000-0000-0000-0000-000000000002',
      'Intento no permitido desde Demo'
    )$$,
  '42501',
  'El Admin Demo no debe ejecutar delete_miami_manifest'
);

select pg_temp.expect_sqlstate(
  $$select *
    from public.delete_miami_manifest_package(
      'e1000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'El Admin Demo no debe ejecutar delete_miami_manifest_package'
);

with removed as (
  delete from public.miami_packages
  where id = 'e1000000-0000-0000-0000-000000000001'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from removed),
  'El Admin Demo no debe eliminar paquetes mediante DELETE directo'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.miami_manifests
    where id = 'd2000000-0000-0000-0000-000000000002'
  ),
  'El manifiesto debe permanecer después del intento del Admin Demo'
);

-- Un Cliente Demo mantiene su vínculo y solo ve sus propios datos del portal.
select set_config(
  'request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"demo_access_grant_id":"93000000-0000-4000-8000-000000000003"}}',
  true
);

select pg_temp.assert_true(
  public.current_user_role() = 'Cliente'
    and public.is_cliente()
    and public.is_demo_access_active(),
  'El Cliente Demo activo debe conservar acceso al portal'
);
select pg_temp.assert_true(
  public.current_user_cliente_id()
    = 'b1000000-0000-0000-0000-000000000001'::uuid,
  'El Cliente Demo debe conservar únicamente su vínculo de cliente'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(
        cliente_id = 'b1000000-0000-0000-0000-000000000001'::uuid
      )
      and min(tracking_number) = 'DEMO-CLIENT-OWN-PACKAGE'
    from public.miami_packages
    where id in (
      'e1000000-0000-0000-0000-000000000001',
      'e2000000-0000-0000-0000-000000000002'
    )
  ),
  'El Cliente Demo debe ver su paquete y no el de otro cliente'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.leads
    where email = 'lead-demo-foundation@test.local'
  ),
  'El Cliente Demo no debe leer leads'
);

-- El vencimiento elimina el rol y toda autorización operativa aunque el perfil
-- continúe aprobado y activo administrativamente.
select set_config(
  'request.jwt.claims',
  '{"sub":"a4000000-0000-0000-0000-000000000004","role":"authenticated","app_metadata":{"demo_access_grant_id":"94000000-0000-4000-8000-000000000004"}}',
  true
);

select pg_temp.assert_true(
  public.current_user_is_demo(),
  'La cuenta vencida debe seguir identificada como demo'
);
select pg_temp.assert_true(
  public.current_user_role() is null,
  'La cuenta demo vencida no debe tener rol operativo de texto'
);
select pg_temp.assert_true(
  public.get_current_user_role() is null,
  'La cuenta demo vencida no debe tener rol operativo tipado'
);
select pg_temp.assert_true(
  public.current_user_cliente_id() is null,
  'La cuenta demo vencida no debe conservar un vínculo operativo de cliente'
);
select pg_temp.assert_true(
  not public.is_demo_access_active(),
  'La cuenta demo vencida no debe conservar acceso activo'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.profiles
    where id = 'a2000000-0000-0000-0000-000000000002'
  ),
  'La cuenta demo vencida no debe leer perfiles de otros evaluadores'
);
select pg_temp.assert_true(
  not public.is_approved_active_user(),
  'La cuenta demo vencida no debe ser un usuario interno autorizado'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.countries
    where name = 'País Demo Foundation'
  ),
  'La cuenta demo vencida no debe leer tablas operativas'
);

reset role;
rollback;

\echo 'demo_environment_foundation.sql: OK'

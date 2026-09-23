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

create or replace function pg_temp.expect_denied(command text, message text)
returns void
language plpgsql
as $$
declare
  was_denied boolean := false;
begin
  begin
    execute command;
  exception when others then
    was_denied := true;
  end;

  if not was_denied then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  exists (
    select 1
    from public.tenants
    where id = '00000000-0000-4000-8000-000000000001'
      and slug = 'sari'
      and name = 'Sari Express'
      and status = 'Activo'
  ),
  'Sari debe existir como tenant inicial determinista'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.tenant_domains
    where tenant_id = '00000000-0000-4000-8000-000000000001'
      and hostname = 'sari.forwarders.app'
      and is_primary is true
      and is_active is true
  ),
  'sari.forwarders.app debe ser el dominio primario de Sari'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.profiles
    where tenant_id is null
      and coalesce(is_platform_admin, false) is false
  ),
  'Los perfiles operativos previos deben quedar vinculados a Sari'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.company_settings
    where tenant_id is null
  ),
  'La configuración corporativa previa debe quedar vinculada a Sari'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.tenants', 'SELECT'),
  'anon no debe consultar tenants'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.tenant_domains', 'SELECT'),
  'anon no debe consultar dominios de tenants'
);
select pg_temp.assert_true(
  has_table_privilege('authenticated', 'public.tenants', 'SELECT')
    and not has_table_privilege('authenticated', 'public.tenants', 'INSERT')
    and not has_table_privilege('authenticated', 'public.tenants', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.tenants', 'DELETE'),
  'authenticated solo debe tener SELECT sobre tenants'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.current_tenant_id()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.is_current_tenant(uuid)', 'EXECUTE'),
  'anon no debe ejecutar helpers internos de tenant'
);

select pg_temp.expect_denied(
  $$insert into public.tenants (slug, name) values ('admin', 'Reservado')$$,
  'Los slugs de infraestructura deben estar reservados'
);
select pg_temp.expect_denied(
  $$insert into public.tenants (slug, name) values ('Tenant-Invalido', 'Inválido')$$,
  'Los slugs deben ser minúsculos y seguros'
);
select pg_temp.expect_denied(
  $$insert into public.tenant_domains (tenant_id, hostname) values ('00000000-0000-4000-8000-000000000001', 'https://sari.forwarders.app')$$,
  'Los dominios no deben aceptar protocolo ni ruta'
);

insert into public.tenants (id, slug, name, status)
values (
  '00000000-0000-4000-8000-000000000002',
  'mya',
  'MYA Cargo Logistics',
  'Activo'
);

insert into public.tenant_domains (
  id,
  tenant_id,
  hostname,
  is_primary,
  is_active
)
values (
  '00000000-0000-4000-8001-000000000002',
  '00000000-0000-4000-8000-000000000002',
  'mya.forwarders.app',
  true,
  true
);

select pg_temp.expect_denied(
  $$insert into public.tenant_domains (tenant_id, hostname) values ('00000000-0000-4000-8000-000000000002', 'sari.forwarders.app')$$,
  'Un hostname no debe pertenecer a dos tenants'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'sari-tenant@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'mya-tenant@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000903', 'authenticated', 'authenticated', 'platform-tenant@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '00000000-0000-0000-0000-000000000901' then 'Admin'::public.user_role
    when '00000000-0000-0000-0000-000000000902' then 'Ventas'::public.user_role
    when '00000000-0000-0000-0000-000000000903' then 'Admin'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true,
  tenant_id = case id
    when '00000000-0000-0000-0000-000000000901' then '00000000-0000-4000-8000-000000000001'::uuid
    when '00000000-0000-0000-0000-000000000902' then '00000000-0000-4000-8000-000000000002'::uuid
    else null
  end,
  is_platform_admin = id = '00000000-0000-0000-0000-000000000903'
where id in (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000902',
  '00000000-0000-0000-0000-000000000903'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  public.current_tenant_id() = '00000000-0000-4000-8000-000000000001',
  'El Admin de Sari debe resolver el tenant Sari'
);
select pg_temp.assert_true(
  public.is_current_tenant('00000000-0000-4000-8000-000000000001')
    and not public.is_current_tenant('00000000-0000-4000-8000-000000000002'),
  'is_current_tenant debe distinguir Sari de MYA'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(slug = 'sari') from public.tenants),
  'RLS debe mostrar al usuario de Sari únicamente su tenant'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(hostname = 'sari.forwarders.app') from public.tenant_domains),
  'RLS debe mostrar al usuario de Sari únicamente sus dominios'
);
select pg_temp.expect_denied(
  $$insert into public.tenants (slug, name) values ('intruso', 'Intruso')$$,
  'Un Admin de tenant no debe crear empresas'
);
select pg_temp.expect_denied(
  $$update public.profiles set tenant_id = '00000000-0000-4000-8000-000000000002' where id = '00000000-0000-0000-0000-000000000901'$$,
  'Ni un Admin debe cambiar su tenant mediante el cliente'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  public.current_tenant_id() = '00000000-0000-4000-8000-000000000002',
  'El usuario de MYA debe resolver MYA'
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(slug = 'mya') from public.tenants),
  'RLS no debe filtrar Sari hacia MYA'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000903","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  public.current_tenant_id() is null,
  'El administrador exclusivo de plataforma no debe asumir un tenant operativo'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.tenants),
  'El administrador de plataforma debe consultar metadatos de tenants'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

update public.profiles
set is_active = false
where id = '00000000-0000-0000-0000-000000000902';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  public.current_tenant_id() is null,
  'Un perfil inactivo no debe resolver tenant'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.tenants),
  'Un perfil inactivo no debe consultar metadatos de tenant'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_denied(
  $$select * from public.tenants$$,
  'anon no debe leer tenants'
);
select pg_temp.expect_denied(
  $$select public.current_tenant_id()$$,
  'anon no debe ejecutar current_tenant_id'
);

reset role;
rollback;

\echo 'phase1_multitenant_foundation.sql: OK'

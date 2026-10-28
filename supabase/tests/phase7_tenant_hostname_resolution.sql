\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_denied(command text, message text)
returns void language plpgsql as $$
declare denied boolean := false;
begin
  begin execute command;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

insert into public.tenants (id, slug, name, status)
values ('00000000-0000-4000-8000-000000000017', 'mya-phase7', 'MYA Cargo Logistics', 'Activo');

insert into public.tenant_domains (tenant_id, hostname, is_primary, is_active)
values ('00000000-0000-4000-8000-000000000017', 'mya-phase7.forwarders.app', true, true);

insert into public.company_settings (
  tenant_id, legal_name, trade_name, logo_url, primary_color, secondary_color
) values (
  '00000000-0000-4000-8000-000000000017',
  'MYA Cargo Logistics S.A.', 'MYA Cargo Logistics',
  'https://assets.example.test/mya.png', '#14532D', '#052E16'
);

set local role anon;
select pg_temp.assert_true(
  (
    select tenant_id = '00000000-0000-4000-8000-000000000017'::uuid
      and slug = 'mya-phase7'
      and trade_name = 'MYA Cargo Logistics'
    from public.resolve_tenant_public_context('mya-phase7.forwarders.app')
  ),
  'anon debe resolver únicamente la identidad visual del dominio activo'
);
select pg_temp.assert_true(
  not exists (select 1 from public.resolve_tenant_public_context('unknown.forwarders.app')),
  'un dominio desconocido debe fallar cerrado'
);
reset role;

update public.tenant_domains set is_active = false
where hostname = 'mya-phase7.forwarders.app';
select pg_temp.assert_true(
  not exists (select 1 from public.resolve_tenant_public_context('mya-phase7.forwarders.app')),
  'un dominio inactivo no debe resolver'
);
update public.tenant_domains set is_active = true
where hostname = 'mya-phase7.forwarders.app';

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-000000000971',
  'authenticated', 'authenticated', 'mya-signup-p7@test.local',
  jsonb_build_object(
    'nombre', 'Public',
    'apellido', 'Signup',
    'tenant_hostname', 'mya-phase7.forwarders.app',
    'legal_acceptance', jsonb_build_object(
      'terms_accepted', true,
      'privacy_read', true,
      'audience', 'erp',
      'version', '2026-09-07'
    )
  )
);

select pg_temp.assert_true(
  exists (
    select 1 from public.profiles
    where id = '00000000-0000-0000-0000-000000000971'
      and tenant_id = '00000000-0000-4000-8000-000000000017'
      and status = 'Pendiente'
  ),
  'el alta pública debe heredar el tenant del hostname validado'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.signup_legal_acceptances
    where user_id = '00000000-0000-0000-0000-000000000971'
      and tenant_id = '00000000-0000-4000-8000-000000000017'
  ),
  'la aceptación legal debe heredar el tenant creado por el alta'
);

select pg_temp.expect_denied(
  $command$
    insert into auth.users (id, aud, role, email, raw_user_meta_data)
    values (
      '00000000-0000-0000-0000-000000000972',
      'authenticated', 'authenticated', 'invalid-signup-p7@test.local',
      '{"tenant_hostname":"unknown.forwarders.app"}'::jsonb
    )
  $command$,
  'un alta con dominio desconocido debe ser rechazada'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.tenants', 'SELECT')
    and not has_table_privilege('anon', 'public.tenant_domains', 'SELECT')
    and not has_table_privilege('anon', 'public.company_settings', 'SELECT'),
  'el RPC público no debe abrir lectura directa de tablas'
);

rollback;

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
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and e.enumlabel = 'Finanzas'
  ),
  'El rol Finanzas debe existir'
);
select pg_temp.assert_true(
  exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and e.enumlabel = 'Cliente'
  ),
  'El rol Cliente debe existir'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.agents', 'SELECT'),
  'anon no debe consultar agents'
);
select pg_temp.assert_true(
  has_table_privilege('anon', 'public.leads', 'INSERT'),
  'anon debe poder insertar leads'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
  'anon no debe ejecutar helpers internos'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pricing@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ventas@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'operaciones@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'contabilidad@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'finanzas@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'cliente@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '00000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    when '00000000-0000-0000-0000-000000000002' then 'Pricing'::public.user_role
    when '00000000-0000-0000-0000-000000000003' then 'Ventas'::public.user_role
    when '00000000-0000-0000-0000-000000000004' then 'Operaciones'::public.user_role
    when '00000000-0000-0000-0000-000000000005' then 'Contabilidad'::public.user_role
    when '00000000-0000-0000-0000-000000000006' then 'Finanzas'::public.user_role
    when '00000000-0000-0000-0000-000000000007' then 'Cliente'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true;

insert into public.agents (name) values ('Agente de prueba RLS');
insert into public.countries (name) values ('País de prueba RLS');

set local role authenticated;

-- Ventas consulta agentes/catálogos, pero no los administra.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true((select count(*) = 1 from public.agents), 'Ventas debe consultar agentes');
select pg_temp.assert_true((select count(*) = 1 from public.countries), 'Ventas debe consultar catálogos');
select pg_temp.expect_denied(
  $$insert into public.agents (name) values ('No permitido Ventas')$$,
  'Ventas no debe crear agentes'
);
select pg_temp.expect_denied(
  $$insert into public.countries (name) values ('No permitido Ventas')$$,
  'Ventas no debe administrar catálogos'
);

-- Pricing administra agentes y catálogos.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
insert into public.agents (name) values ('Permitido Pricing');
insert into public.countries (name) values ('Permitido Pricing');

-- Operaciones consulta agentes y administra garantías.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select pg_temp.assert_true((select count(*) = 2 from public.agents), 'Operaciones debe consultar agentes');
insert into public.garantias_navieras (naviera, monto, fecha_deposito)
values ('Naviera de prueba', 100, current_date);

-- Contabilidad consulta catálogos, pero no el catálogo de agentes.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
select pg_temp.assert_true((select count(*) = 2 from public.countries), 'Contabilidad debe consultar catálogos');
select pg_temp.assert_true((select count(*) = 0 from public.agents), 'Contabilidad no debe consultar agentes');

-- Cliente no es usuario interno y no ve catálogos ni pricing operativo.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000007","role":"authenticated"}',
  true
);
select pg_temp.assert_true(not public.is_approved_active_user(), 'Cliente no debe ser usuario interno');
select pg_temp.assert_true((select count(*) = 0 from public.agents), 'Cliente no debe consultar agentes');
select pg_temp.assert_true((select count(*) = 0 from public.countries), 'Cliente no debe consultar catálogos internos');
select pg_temp.expect_denied(
  $$update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000007'$$,
  'Cliente no debe modificar campos administrativos de su perfil'
);
update public.profiles
set nombre = 'Cliente actualizado'
where id = '00000000-0000-0000-0000-000000000007';

reset role;

-- anon solo crea leads y no puede leerlos.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into public.leads (nombre, empresa, email)
values ('Lead RLS', 'Empresa RLS', 'lead@test.local');
select pg_temp.expect_denied(
  $$select * from public.leads$$,
  'anon no debe leer leads'
);

reset role;
rollback;

\echo 'phase1_rls.sql: OK'

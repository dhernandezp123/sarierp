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

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('49410000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'agent360-pricing@test.local', '{}'::jsonb),
  ('49410000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'agent360-sales@test.local', '{}'::jsonb),
  ('49410000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'agent360-operations@test.local', '{}'::jsonb),
  ('49410000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'agent360-finance@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '49410000-0000-0000-0000-000000000001' then 'Pricing'::public.user_role
    when '49410000-0000-0000-0000-000000000002' then 'Ventas'::public.user_role
    when '49410000-0000-0000-0000-000000000003' then 'Operaciones'::public.user_role
    when '49410000-0000-0000-0000-000000000004' then 'Finanzas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true
where id in (
  '49410000-0000-0000-0000-000000000001',
  '49410000-0000-0000-0000-000000000002',
  '49410000-0000-0000-0000-000000000003',
  '49410000-0000-0000-0000-000000000004'
);

insert into public.agents (id, name)
values ('49410000-0000-0000-0000-000000000010', 'Agente Agent 360');

insert into public.agent_route_rates (
  id, agent_id, origin, destination, service_type, base_rate, currency
) values (
  '49410000-0000-0000-0000-000000000011',
  '49410000-0000-0000-0000-000000000010',
  'CNSHA', 'HNPCR', 'FCL 40HC', 1000, 'USD'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"49410000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.agent_route_rates where agent_id = '49410000-0000-0000-0000-000000000010'),
  'Ventas debe consultar lanes del agente'
);
update public.agent_route_rates
set base_rate = 1100
where id = '49410000-0000-0000-0000-000000000011';
select pg_temp.assert_true(
  (select base_rate = 1000 from public.agent_route_rates where id = '49410000-0000-0000-0000-000000000011'),
  'Ventas no debe modificar lanes aunque RLS responda con cero filas'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49410000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.agent_route_rates where agent_id = '49410000-0000-0000-0000-000000000010'),
  'Operaciones debe consultar lanes del agente'
);
delete from public.agent_route_rates
where id = '49410000-0000-0000-0000-000000000011';
select pg_temp.assert_true(
  (select count(*) = 1 from public.agent_route_rates where id = '49410000-0000-0000-0000-000000000011'),
  'Operaciones no debe eliminar lanes aunque RLS responda con cero filas'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49410000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
update public.agent_route_rates
set base_rate = 1200
where id = '49410000-0000-0000-0000-000000000011';
select pg_temp.assert_true(
  (select base_rate = 1200 from public.agent_route_rates where id = '49410000-0000-0000-0000-000000000011'),
  'Pricing debe conservar administración de lanes'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49410000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.agent_route_rates where agent_id = '49410000-0000-0000-0000-000000000010'),
  'Finanzas no debe obtener acceso al catálogo operativo por esta fase'
);

reset role;
rollback;

\echo 'phase4_agent_360_access.sql: OK'

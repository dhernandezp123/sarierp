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
  (select is_nullable = 'NO'
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'company_settings'
     and column_name = 'tenant_id'),
  'company_settings.tenant_id debe ser obligatorio'
);
select pg_temp.assert_true(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'company_settings'
      and indexname = 'company_settings_tenant_id_key'
      and indexdef ilike 'CREATE UNIQUE INDEX%'
  ),
  'Debe existir una sola configuración por tenant'
);
select pg_temp.assert_true(
  pg_get_function_result('public.get_current_company_branding()'::regprocedure)
    not ilike '%default_tax_rate%'
  and pg_get_function_result('public.get_current_company_branding()'::regprocedure)
    not ilike '%insurance_cost_rate_percent%',
  'El RPC de branding no debe exponer configuración financiera interna'
);

insert into public.tenants (id, slug, name, status)
values ('00000000-0000-4000-8000-000000000012', 'mya-phase2', 'MYA Phase 2', 'Activo');

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000911', 'authenticated', 'authenticated', 'sari-settings@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000912', 'authenticated', 'authenticated', 'mya-settings@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000913', 'authenticated', 'authenticated', 'sari-client-settings@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000914', 'authenticated', 'authenticated', 'platform-settings@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '00000000-0000-0000-0000-000000000913' then 'Cliente'::public.user_role
    else 'Admin'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true,
  tenant_id = case
    when id in (
      '00000000-0000-0000-0000-000000000911',
      '00000000-0000-0000-0000-000000000913'
    ) then '00000000-0000-4000-8000-000000000001'::uuid
    when id = '00000000-0000-0000-0000-000000000912'
      then '00000000-0000-4000-8000-000000000012'::uuid
    else null
  end,
  is_platform_admin = id = '00000000-0000-0000-0000-000000000914'
where id in (
  '00000000-0000-0000-0000-000000000911',
  '00000000-0000-0000-0000-000000000912',
  '00000000-0000-0000-0000-000000000913',
  '00000000-0000-0000-0000-000000000914'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000911","role":"authenticated"}',
  true
);

insert into public.company_settings (
  tenant_id, legal_name, trade_name, primary_color, secondary_color, default_tax_rate
)
values (
  '00000000-0000-4000-8000-000000000001',
  'SARI EXPRESS S DE R.L. DE C.V.',
  'Sari Express',
  '#0038BD',
  '#07111F',
  15
)
on conflict (tenant_id) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  default_tax_rate = excluded.default_tax_rate;

select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(trade_name = 'Sari Express')
   from public.get_current_company_settings()),
  'El personal de Sari debe cargar únicamente la configuración completa de Sari'
);
select pg_temp.expect_denied(
  $$insert into public.company_settings (tenant_id, trade_name) values ('00000000-0000-4000-8000-000000000012', 'MYA infiltrado')$$,
  'Admin de Sari no debe crear configuración para MYA'
);
select pg_temp.expect_denied(
  $$update public.company_settings set tenant_id = '00000000-0000-4000-8000-000000000012' where tenant_id = '00000000-0000-4000-8000-000000000001'$$,
  'Admin de Sari no debe mover su configuración a MYA'
);
delete from public.company_settings
where tenant_id = '00000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_current_company_settings()),
  'La configuración del tenant no debe eliminarse desde el cliente'
);
select pg_temp.expect_denied(
  $$update public.company_settings set primary_color = 'azul' where tenant_id = '00000000-0000-4000-8000-000000000001'$$,
  'Los colores de marca deben usar formato hexadecimal de seis dígitos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000912","role":"authenticated"}',
  true
);
insert into public.company_settings (
  tenant_id, legal_name, trade_name, primary_color, secondary_color, default_tax_rate
)
values (
  '00000000-0000-4000-8000-000000000012',
  'MYA CARGO LOGISTICS',
  'MYA Cargo',
  '#14532D',
  '#052E16',
  18
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(trade_name = 'MYA Cargo')
   from public.get_current_company_settings()),
  'MYA no debe recibir la configuración de Sari'
);
select pg_temp.expect_denied(
  $$insert into public.company_settings (tenant_id, trade_name) values ('00000000-0000-4000-8000-000000000012', 'Duplicado')$$,
  'No debe existir más de una configuración por tenant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000913","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.company_settings),
  'Cliente no debe consultar directamente la configuración interna'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_current_company_settings()),
  'Cliente no debe recibir el RPC de configuración completa'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(trade_name = 'Sari Express')
      and bool_and(primary_color = '#0038BD')
    from public.get_current_company_branding()
  ),
  'Cliente debe recibir únicamente el branding seguro de su tenant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000914","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_current_company_settings())
    and (select count(*) = 0 from public.get_current_company_branding()),
  'El administrador exclusivo de plataforma no debe asumir configuración empresarial'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_denied(
  $$select * from public.get_current_company_settings()$$,
  'anon no debe ejecutar el RPC interno'
);
select pg_temp.expect_denied(
  $$select * from public.get_current_company_branding()$$,
  'anon no debe ejecutar el RPC de branding autenticado'
);

reset role;
rollback;

\echo 'phase2_tenant_company_settings.sql: OK'

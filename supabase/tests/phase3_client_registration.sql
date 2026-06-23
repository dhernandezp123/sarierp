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

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '30000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'cliente-registro@test.local',
  '{
    "requested_role":"Cliente",
    "nombre":"Ana",
    "apellido":"Cliente",
    "company":"Importadora Demo",
    "phone":"+504 9999-0000"
  }'::jsonb
);

select pg_temp.assert_true(
  (
    select rol = 'Cliente'
      and status = 'Pendiente'
      and is_active is true
      and approved_at is null
      and approved_by is null
      and cliente_id is null
      and registration_company = 'Importadora Demo'
    from public.profiles
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'La solicitud Cliente debe quedar pendiente, sin aprobación ni vínculo'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '30000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'rol-interno@test.local',
  '{"requested_role":"Admin"}'::jsonb
);

select pg_temp.assert_true(
  (
    select rol = 'Ventas' and status = 'Pendiente'
    from public.profiles
    where id = '30000000-0000-0000-0000-000000000002'
  ),
  'Metadata pública no debe solicitar roles internos'
);

rollback;

\echo 'phase3_client_registration.sql: OK'

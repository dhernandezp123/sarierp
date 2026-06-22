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

insert into public.miami_packages (tracking_number, tipo_carga, cargo_status, weight_lbs)
values ('VALID-PHASE2', 'Paquetería', 'Recibido en Miami', 1);

select pg_temp.expect_denied(
  $$insert into public.miami_packages (tracking_number, tipo_carga) values ('BAD-TYPE', 'Otro')$$,
  'Debe rechazar tipos de carga inválidos'
);
select pg_temp.expect_denied(
  $$insert into public.miami_packages (tracking_number, cargo_status) values ('BAD-STATUS', 'Desconocido')$$,
  'Debe rechazar estados de carga inválidos'
);
select pg_temp.expect_denied(
  $$insert into public.miami_packages (tracking_number, weight_lbs) values ('BAD-WEIGHT', -1)$$,
  'Debe rechazar mediciones negativas'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '20000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'ops-manifest@test.local',
  '{}'::jsonb
);
update public.profiles
set rol = 'Operaciones', status = 'Aprobado', is_active = true
where id = '20000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temporary table generated_manifest_numbers as
select public.next_manifest_number() as manifest_number
union all
select public.next_manifest_number();

select pg_temp.assert_true(
  (select count(*) = count(distinct manifest_number) from generated_manifest_numbers),
  'Los números de manifiesto deben ser únicos'
);
select pg_temp.assert_true(
  (select bool_and(manifest_number ~ '^MAN-[0-9]{8}-[0-9]{6}$') from generated_manifest_numbers),
  'El formato de manifiesto debe ser MAN-YYYYMMDD-######'
);

reset role;
rollback;

\echo 'phase2_miami_integrity.sql: OK'

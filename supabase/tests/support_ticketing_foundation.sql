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
  exists (
    select 1 from storage.buckets
    where id = 'support-attachments'
      and public is false
      and file_size_limit = 10485760
      and allowed_mime_types @> array['application/pdf', 'image/png', 'image/jpeg']::text[]
  ),
  'El bucket de soporte debe ser privado y limitar tamaño/tipos MIME'
);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'usuario-soporte@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'plataforma-soporte@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'portal-soporte@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '00000000-0000-0000-0000-000000000101' then 'Ventas'::public.user_role
    when '00000000-0000-0000-0000-000000000102' then 'Admin'::public.user_role
    when '00000000-0000-0000-0000-000000000103' then 'Cliente'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true,
  is_platform_admin = id = '00000000-0000-0000-0000-000000000102';

update public.support_settings
set enabled = true,
    ticket_prefix = 'SUP'
where singleton is true;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);

select pg_temp.assert_true(not public.is_platform_admin(), 'Un usuario interno normal no debe ser Administrador Supremo');
select pg_temp.expect_denied(
  $$update public.profiles set is_platform_admin = true where id = '00000000-0000-0000-0000-000000000101'$$,
  'Un usuario no debe poder autoconcederse acceso supremo'
);

create temporary table support_test_ticket as
select public.create_support_ticket(
  'Error de prueba controlada',
  'Descripción suficientemente extensa para validar el ticket.',
  'Error del sistema',
  'Alta',
  '/quotations/test',
  'Cotizaciones',
  'Navegador de prueba'
) as id;

select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(ticket_number ~ '^SUP-[0-9]{6}$') from public.support_tickets),
  'El ticket debe crearse con numeración atómica y prefijo configurado'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.support_ticket_messages),
  'La descripción inicial debe guardarse como primer mensaje'
);
select pg_temp.expect_denied(
  format(
    'select public.add_support_ticket_message(%L::uuid, %L, true)',
    (select id from support_test_ticket),
    'Intento de nota interna'
  ),
  'Un usuario normal no debe crear notas internas'
);
select pg_temp.expect_denied(
  format(
    'select public.manage_support_ticket(%L::uuid, %L, null, null, false)',
    (select id from support_test_ticket),
    'En desarrollo'
  ),
  'Un usuario normal no debe administrar el ticket'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}',
  true
);
select pg_temp.expect_denied(
  $$select public.create_support_ticket('Ticket del portal', 'El usuario Cliente no debe ingresar a soporte.', 'Consulta', 'Normal')$$,
  'Los usuarios Cliente del portal no deben crear tickets técnicos'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.support_tickets),
  'El portal no debe poder leer tickets técnicos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',
  true
);
select pg_temp.assert_true(public.is_platform_admin(), 'El perfil confiable debe obtener acceso supremo');
select public.add_support_ticket_message(
  (select id from support_test_ticket),
  'Diagnóstico interno reservado para Hernova Systems.',
  true
);
select public.add_support_ticket_message(
  (select id from support_test_ticket),
  'Respuesta pública del equipo de soporte.',
  false
);
select public.manage_support_ticket(
  (select id from support_test_ticket),
  'En desarrollo',
  'Crítica',
  '00000000-0000-0000-0000-000000000102',
  false
);

select pg_temp.assert_true(
  (
    select status = 'En desarrollo'
      and priority = 'Crítica'
      and assigned_to = '00000000-0000-0000-0000-000000000102'
      and first_response_at is not null
    from public.support_tickets
    where id = (select id from support_test_ticket)
  ),
  'Soporte debe administrar estado, prioridad, responsable y primera respuesta'
);
select pg_temp.assert_true(
  (select count(*) = 3 from public.support_ticket_messages),
  'El Administrador Supremo debe ver mensajes públicos e internos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.support_ticket_messages),
  'Las notas internas no deben filtrarse a usuarios de la empresa cliente'
);
select pg_temp.assert_true(
  (select count(*) >= 4 from public.support_ticket_events),
  'El historial debe registrar creación, mensajes y cambios administrativos'
);

reset role;

-- En la rama Demo, ni siquiera un perfil marcado manualmente como plataforma
-- debe obtener privilegios mientras el sentinel indique ambiente demo.
do $demo_guard_test$
begin
  if to_regclass('public.platform_environment') is not null
    and to_regprocedure('public.is_demo_environment()') is not null
  then
    update public.platform_environment
    set environment = 'demo',
        project_ref = coalesce(project_ref, 'local-demo-test'),
        reset_enabled = false
    where singleton is true;

    perform set_config(
      'request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',
      true
    );

    if public.is_platform_admin() then
      raise exception 'ASSERTION FAILED: Demo debe bloquear Administrador Supremo';
    end if;
  end if;
end
$demo_guard_test$;

rollback;

\echo 'support_ticketing_foundation.sql: OK'

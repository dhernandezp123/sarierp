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

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-notify@test.local', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ventas-notify@test.local', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pricing-notify@test.local', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ops-notify@test.local', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'cliente-notify@test.local', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'pending-notify@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '10000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    when '10000000-0000-0000-0000-000000000002' then 'Ventas'::public.user_role
    when '10000000-0000-0000-0000-000000000003' then 'Pricing'::public.user_role
    when '10000000-0000-0000-0000-000000000004' then 'Operaciones'::public.user_role
    when '10000000-0000-0000-0000-000000000005' then 'Cliente'::public.user_role
    else rol
  end,
  status = case
    when id = '10000000-0000-0000-0000-000000000006' then 'Pendiente'
    else 'Aprobado'
  end,
  is_active = true;

insert into public.notifications (user_id, title, message)
values ('10000000-0000-0000-0000-000000000002', 'Aviso propio', 'Prueba');

set local role authenticated;

-- Ventas ve el directorio interno aprobado, nunca Cliente ni pendientes.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 4 from public.profiles),
  'Ventas debe ver solo perfiles internos aprobados'
);
select pg_temp.expect_denied(
  $$insert into public.notifications (user_id, title) values ('10000000-0000-0000-0000-000000000002', 'Directa')$$,
  'No debe existir inserción directa de notificaciones'
);
select public.create_internal_notification(
  '10000000-0000-0000-0000-000000000003',
  'Nueva cotización',
  'Revisar pricing',
  'info'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.notifications),
  'Ventas solo debe consultar sus propias notificaciones'
);
update public.notifications set is_read = true
where user_id = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_denied(
  $$update public.notifications set title = 'Alterada' where user_id = '10000000-0000-0000-0000-000000000002'$$,
  'El usuario no debe alterar contenido de notificaciones'
);
select pg_temp.expect_denied(
  $$select public.create_internal_notification('10000000-0000-0000-0000-000000000005', 'Incorrecta', null, 'info')$$,
  'La RPC interna no debe enviar al rol Cliente'
);

-- Operaciones puede generar avisos del portal para clientes activos.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);
insert into public.client_notifications (profile_id, title, body, type)
values (
  '10000000-0000-0000-0000-000000000005',
  'Paquete recibido',
  'Tu paquete llegó a Miami',
  'paquete'
);

-- Cliente ve solo su perfil/avisos y únicamente cambia read_at.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.profiles),
  'Cliente solo debe consultar su perfil'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.client_notifications),
  'Cliente debe consultar su notificación'
);
update public.client_notifications set read_at = now()
where profile_id = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect_denied(
  $$update public.client_notifications set title = 'Alterada' where profile_id = '10000000-0000-0000-0000-000000000005'$$,
  'Cliente no debe alterar contenido del aviso'
);
select pg_temp.expect_denied(
  $$select public.create_internal_notification('10000000-0000-0000-0000-000000000003', 'Ataque', null, 'info')$$,
  'Cliente no debe crear notificaciones internas'
);

reset role;

-- Admin ve también usuarios pendientes para administrarlos.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 6 from public.profiles),
  'Admin debe consultar todos los perfiles'
);

reset role;
rollback;

\echo 'phase1_notifications_profiles.sql: OK'

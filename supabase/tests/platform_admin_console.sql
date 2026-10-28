\set ON_ERROR_STOP on
-- Base local desechable. Todos los registros ficticios revierten al finalizar.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if; end;
$$;
create function pg_temp.expect_error(command text, expected_code text, message text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate = expected_code then return; end if;
    raise exception 'ASSERTION FAILED: %; expected %, got %: %', message, expected_code, sqlstate, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: %; operation succeeded', message;
end;
$$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', jsonb_build_object('sub', 'fa260000-0000-4000-8000-' || lpad(n::text,12,'0'), 'role','authenticated')::text, true); end;
$$;

insert into public.tenants(id,slug,name) values
  ('fa260000-0000-4000-8000-000000000100','platform-test-a','Platform Test A'),
  ('fa260000-0000-4000-8000-000000000200','platform-test-b','Platform Test B');
insert into public.company_settings(tenant_id,legal_name,trade_name)
select id,name,name from public.tenants where slug in ('platform-test-a','platform-test-b');
insert into public.tenant_domains(tenant_id,hostname,is_primary) values
  ('fa260000-0000-4000-8000-000000000100','platform-test-a.forwarders.app',true),
  ('fa260000-0000-4000-8000-000000000200','platform-test-b.forwarders.app',true),
  ('fa260000-0000-4000-8000-000000000100','platform-claimed.forwarders.app',false);
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('fa260000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
  'platform-test-'||n||'@example.invalid','{}'::jsonb from generate_series(1,10) n;
update public.profiles set rol='Admin',status='Aprobado',is_active=true,
  is_platform_admin=id::text in ('fa260000-0000-4000-8000-000000000001','fa260000-0000-4000-8000-000000000006','fa260000-0000-4000-8000-000000000007','fa260000-0000-4000-8000-000000000008','fa260000-0000-4000-8000-000000000009','fa260000-0000-4000-8000-000000000010'),
  tenant_id=case when id::text in ('fa260000-0000-4000-8000-000000000002','fa260000-0000-4000-8000-000000000003','fa260000-0000-4000-8000-000000000004','fa260000-0000-4000-8000-000000000006') then 'fa260000-0000-4000-8000-000000000100'::uuid
    when id='fa260000-0000-4000-8000-000000000005' then 'fa260000-0000-4000-8000-000000000200'::uuid else null end
where id::text like 'fa260000-%' and email like 'platform-test-%';
update public.profiles set rol='Ventas' where id in ('fa260000-0000-4000-8000-000000000003','fa260000-0000-4000-8000-000000000004','fa260000-0000-4000-8000-000000000010');
update public.profiles set status='Pendiente' where id in ('fa260000-0000-4000-8000-000000000004','fa260000-0000-4000-8000-000000000008');
update public.profiles set is_active=false where id='fa260000-0000-4000-8000-000000000007';
update public.profiles set rol='Cliente' where id='fa260000-0000-4000-8000-000000000009';
insert into public.clientes(id,nombre,tenant_id) values
  ('fa261000-0000-4000-8000-000000000001','Cliente platform A','fa260000-0000-4000-8000-000000000100'),
  ('fa261000-0000-4000-8000-000000000002','Cliente platform B','fa260000-0000-4000-8000-000000000200');

select pg_temp.assert_true(not has_function_privilege('anon','public.platform_create_company(text,text,text)','execute'), 'Anon no puede ejecutar altas');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.tenants','insert'), 'No se concede escritura directa de empresas');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.platform_admin_events','insert')
  and not has_table_privilege('authenticated','public.platform_admin_events','update')
  and not has_table_privilege('authenticated','public.platform_admin_events','delete'), 'Auditoría sin escritura directa');

set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','Admin de empresa no accede a consola');
select pg_temp.expect_error($c$select public.platform_create_company('No autorizado','platform-denied','Intento sin permiso')$c$,'42501','Admin de empresa no crea tenants');
select pg_temp.assert_true((select count(*)=1 from public.clientes where id::text like 'fa261000-%'), 'Admin mantiene aislamiento de clientes');
select pg_temp.as_user(3);
select pg_temp.expect_error($c$select public.platform_admin_console('users')$c$,'42501','Ventas no enumera usuarios globales');
select pg_temp.as_user(6);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','Flag de plataforma con tenant no habilita consola');
select pg_temp.as_user(7);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','Plataforma inactiva no accede');
select pg_temp.as_user(8);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','Plataforma pendiente no accede');
select pg_temp.as_user(9);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','Cliente con flag no accede');
select pg_temp.as_user(10);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','Personal de soporte sin rol Admin no administra plataforma');
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_error($c$select public.platform_admin_console()$c$,'42501','JWT ausente no accede');

select pg_temp.as_user(1);
select pg_temp.assert_true(public.can_manage_platform(), 'Superadmin aprobado y sin tenant autorizado');
select pg_temp.assert_true(public.current_tenant_id() is null, 'Superadmin no adquiere contexto operativo');
select pg_temp.assert_true((select count(*)=0 from public.clientes where id::text like 'fa261000-%'), 'Consola no concede lectura comercial transversal');
select pg_temp.assert_true((public.platform_admin_console('companies','Platform Test')->>'total')::int=2, 'Consulta ambas empresas');
select pg_temp.assert_true(jsonb_array_length(public.platform_admin_console('users','platform-test-')->'users')=10, 'Directorio contiene solo campos explícitos de diez fixtures');
select pg_temp.assert_true(not ((public.platform_admin_console('users','platform-test-')->'users'->0) ? 'encrypted_password'), 'Nunca entrega secretos de autenticación');
select pg_temp.assert_true(jsonb_typeof(public.platform_admin_console()->'summary')='object', 'Resumen disponible');
select pg_temp.expect_error($c$select public.platform_admin_console('users','', '',0)$c$,'22023','Paginación inválida rechazada');

select public.platform_create_company('Empresa nueva','platform-new','Alta de empresa ficticia') as new_tenant \gset
select pg_temp.assert_true((select count(*)=1 from public.resolve_tenant_public_context('platform-new.forwarders.app')), 'Alta prepara dominio y configuración corporativa');
select pg_temp.assert_true((select count(*)=1 from public.platform_admin_events where tenant_id=:'new_tenant' and action='company_created'), 'Alta tiene auditoría atómica');
select pg_temp.expect_error($c$select public.platform_create_company('Reservada','admin','Alta no permitida')$c$,'22023','Slug reservado rechazado');
select pg_temp.expect_error($c$select public.platform_create_company('Repetida','platform-new','Alta duplicada ficticia')$c$,'23505','Slug duplicado rechazado');
select pg_temp.expect_error($c$select public.platform_create_company('Colisión','platform-claimed','Dominio ya registrado')$c$,'23505','Colisión de dominio rechazada');
select pg_temp.assert_true(not exists(select 1 from public.tenants where slug='platform-claimed'), 'Fallo de dominio revierte tenant completo');
select pg_temp.expect_error($c$select public.platform_create_company('Sin motivo','platform-noreason','')$c$,'22023','Motivo obligatorio');

select updated_at as old_version from public.tenants where id='fa260000-0000-4000-8000-000000000100' \gset
select public.platform_update_company('fa260000-0000-4000-8000-000000000100','Platform Test A','Suspendido',:'old_version','Suspensión de prueba');
select pg_temp.assert_true((select count(*)=0 from public.resolve_tenant_public_context('platform-test-a.forwarders.app')), 'Suspensión bloquea resolución pública');
select pg_temp.expect_error(format('select public.platform_update_company(%L,%L,%L,%L,%L)',
  'fa260000-0000-4000-8000-000000000100','Cambio obsoleto','Activo',:'old_version','Cambiar con versión anterior'),'40001','Versión obsoleta rechazada');
select pg_temp.as_user(2);
select pg_temp.assert_true(public.current_tenant_id() is null, 'JWT existente pierde contexto al suspender empresa');
select pg_temp.assert_true((select count(*)=0 from public.clientes where id::text like 'fa261000-%'), 'JWT existente no lee clientes de empresa suspendida');
select pg_temp.as_user(5);
select pg_temp.assert_true(public.current_tenant_id()='fa260000-0000-4000-8000-000000000200', 'Otra empresa conserva acceso');
select pg_temp.as_user(1);
select public.platform_update_company('fa260000-0000-4000-8000-000000000100','Platform Test A','Activo',
  (select updated_at from public.tenants where id='fa260000-0000-4000-8000-000000000100'),'Reactivar prueba');

select pg_temp.expect_error($c$select public.platform_update_user_access('fa260000-0000-4000-8000-000000000002','Ventas','Aprobado',true,
  '{"rol":"Admin","status":"Aprobado","is_active":true,"tenant_id":"fa260000-0000-4000-8000-000000000100"}','Quitar último administrador')$c$,'22023','Conserva al último administrador');
select public.platform_update_user_access('fa260000-0000-4000-8000-000000000004','Admin','Aprobado',true,
  '{"rol":"Ventas","status":"Pendiente","is_active":true,"tenant_id":"fa260000-0000-4000-8000-000000000100"}','Aprobar administrador inicial');
select pg_temp.assert_true((select rol='Admin' and status='Aprobado' and approved_by=auth.uid() and not is_platform_admin from public.profiles where id='fa260000-0000-4000-8000-000000000004'), 'Aprobación guarda actor sin elevar a plataforma');
select pg_temp.expect_error($c$select public.platform_update_user_access('fa260000-0000-4000-8000-000000000004','Admin','Aprobado',false,
  '{"rol":"Ventas","status":"Pendiente","is_active":true,"tenant_id":"fa260000-0000-4000-8000-000000000100"}','Solicitud obsoleta')$c$,'40001','Acceso obsoleto rechazado');
select public.platform_update_user_access('fa260000-0000-4000-8000-000000000003','Ventas','Aprobado',false,
  '{"rol":"Ventas","status":"Aprobado","is_active":true,"tenant_id":"fa260000-0000-4000-8000-000000000100"}','Deshabilitar acceso ficticio');
select pg_temp.as_user(3);
select pg_temp.assert_true(public.current_tenant_id() is null, 'Usuario deshabilitado pierde acceso con JWT existente');
select pg_temp.assert_true((select count(*)=0 from public.platform_admin_events), 'Usuario operativo no ve auditoría global');
select pg_temp.as_user(1);
select pg_temp.expect_error($c$select public.platform_update_user_access('fa260000-0000-4000-8000-000000000001','Ventas','Aprobado',true,'{}','Cambiar propia cuenta')$c$,'42501','No permite editar cuentas de plataforma');
select pg_temp.expect_error($c$select public.platform_update_user_access('fa260000-0000-4000-8000-000000000004','Cliente','Aprobado',true,
  '{"rol":"Admin","status":"Aprobado","is_active":true,"tenant_id":"fa260000-0000-4000-8000-000000000100"}','Convertir a cliente')$c$,'22023','No convierte cuentas internas a clientes');
select pg_temp.assert_true((select count(*)=2 from public.platform_admin_events where action='user_access_updated' and tenant_id='fa260000-0000-4000-8000-000000000100'), 'Solo cambios exitosos registran eventos');

reset role;
select set_config('request.jwt.claims','{}',true);
create function pg_temp.fail_platform_audit() returns trigger language plpgsql as $$
begin if new.entity_name='Falla de auditoría' then raise exception 'Fallo simulado de auditoría'; end if; return new; end;
$$;
create trigger platform_audit_failure before insert on public.platform_admin_events for each row execute function pg_temp.fail_platform_audit();
set local role authenticated;
select pg_temp.as_user(1);
select pg_temp.expect_error($c$select public.platform_create_company('Falla de auditoría','platform-fail-audit','Alta debe revertir completa')$c$,'P0001','Fallo de auditoría aborta el alta');
select pg_temp.assert_true(not exists(select 1 from public.tenants where slug='platform-fail-audit'), 'No quedan empresas sin auditoría');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.company_settings cs join public.tenants t on t.id=cs.tenant_id where t.slug='platform-fail-audit'), 'No quedan configuraciones parciales');
rollback;

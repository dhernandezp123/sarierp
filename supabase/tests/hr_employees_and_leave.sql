\set ON_ERROR_STOP on
-- HR-01. Solo base desechable con el historial completo. Todos los fixtures revierten.
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.expect_error(command text, fragment text, message text)
returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if position(fragment in sqlerrm) > 0 then return; end if;
    raise exception 'ASSERTION FAILED: % (error inesperado: %)', message, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (no fallo)', message;
end;
$$;
create function pg_temp.as_user(n integer)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'e4010000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text, true);
end;
$$;

-- 1 Admin A, 2 Ventas A (empleado vinculado), 3 Operaciones A (sin ficha), 4 Admin B, 5 Cliente A, 6 Ventas A inactivo (vinculado)
insert into public.tenants(id, slug, name) values
  ('e4010000-0000-4000-8000-000000000100', 'hr01-a', 'RRHH A'),
  ('e4010000-0000-4000-8000-000000000200', 'hr01-b', 'RRHH B');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('e4010000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated', 'hr01-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 6) n;
update public.profiles set
  rol = (case right(id::text, 3) when '001' then 'Admin' when '004' then 'Admin' when '003' then 'Operaciones' when '005' then 'Cliente' else 'Ventas' end)::public.user_role,
  status = 'Aprobado', is_active = right(id::text, 3) <> '006', is_platform_admin = false,
  tenant_id = case when right(id::text, 3) = '004' then 'e4010000-0000-4000-8000-000000000200'::uuid else 'e4010000-0000-4000-8000-000000000100'::uuid end
where id::text like 'e4010000-%';

set local role authenticated;

-- Solo Admin crea fichas.
select pg_temp.as_user(2);
select pg_temp.expect_error($$select public.hr_save_employee(null, null, '{"employee_code":"X","first_name":"A","last_name":"B","hire_date":"2026-01-05","contract_type":"Indefinido"}')$$, 'No autorizado', 'Ventas no crea fichas');
select pg_temp.as_user(1);
select pg_temp.expect_error($$select public.hr_save_employee(null, null, '{"employee_code":"J1","first_name":"Jefa","last_name":"Uno","hire_date":"2026-01-05","contract_type":"Indefinido","status":"Inactivo"}')$$, 'fecha de salida', 'baja sin fecha');
select pg_temp.expect_error($$select public.hr_save_employee(null, null, '{"employee_code":"J1","first_name":"Jefa","last_name":"Uno","hire_date":"2026-01-05","contract_type":"Freelance"}')$$, 'contrato', 'contrato invalido');
select pg_temp.expect_error($$select public.hr_save_employee(null, null, '{"employee_code":"J1","first_name":"Jefa","last_name":"Uno","hire_date":"2026-01-05","contract_type":"Indefinido","profile_id":"e4010000-0000-4000-8000-000000000005"}')$$, 'Usuario no disponible', 'no vincula clientes');

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids select 'boss', public.hr_save_employee(null, null, '{"employee_code":"J1","first_name":"Jefa","last_name":"Uno","hire_date":"2025-01-06","contract_type":"Indefinido"}');
insert into ids select 'emp', public.hr_save_employee(null, null, jsonb_build_object('employee_code','E1','first_name','Ana','last_name','Ventas','hire_date','2025-01-06',
  'contract_type','Indefinido','vacation_days_per_year',10,'profile_id','e4010000-0000-4000-8000-000000000002','manager_id',(select id from ids where name='boss')));
insert into ids select 'off', public.hr_save_employee(null, null, '{"employee_code":"E2","first_name":"Inactivo","last_name":"Vinculado","hire_date":"2025-01-06","contract_type":"Temporal","profile_id":"e4010000-0000-4000-8000-000000000006"}');
select pg_temp.expect_error($$select public.hr_save_employee(null, null, '{"employee_code":"e1","first_name":"Dup","last_name":"Dup","hire_date":"2026-01-05","contract_type":"Indefinido"}')$$, 'codigo', 'codigo duplicado sin distinguir mayusculas');
select pg_temp.expect_error(format($$select public.hr_save_employee(null, null, '{"employee_code":"E3","first_name":"Dup","last_name":"Dup","hire_date":"2026-01-05","contract_type":"Indefinido","profile_id":"e4010000-0000-4000-8000-000000000002"}')$$), 'vinculado', 'usuario vinculado dos veces');
select pg_temp.expect_error(format($$select public.hr_save_employee(%L, 1, jsonb_build_object('employee_code','J1','first_name','Jefa','last_name','Uno','hire_date','2025-01-06','contract_type','Indefinido','manager_id',%L))$$,
  (select id from ids where name='boss'), (select id from ids where name='emp')), 'ciclo', 'jefe directo sin ciclos');
select pg_temp.expect_error(format($$select public.hr_save_employee(%L, 99, '{"employee_code":"J1","first_name":"Jefa","last_name":"Uno","hire_date":"2025-01-06","contract_type":"Indefinido"}')$$, (select id from ids where name='boss')), 'recarga', 'revision obsoleta');

-- Lecturas: el empleado solo ve su ficha; otro tenant y usuarios sin ficha no ven nada.
select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*) = 1 and bool_and(employee_code = 'E1') from public.hr_employees), 'empleado ve solo su ficha');
select pg_temp.assert_true(public.hr_employee_manager_name((select id from ids where name='emp')) = 'Jefa Uno', 'empleado ve nombre de su jefe');
select pg_temp.assert_true(public.hr_employee_manager_name((select id from ids where name='boss')) is null, 'no consulta jefes ajenos');
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*) = 0 from public.hr_employees), 'usuario sin ficha no ve fichas');
select pg_temp.as_user(4);
select pg_temp.assert_true((select count(*) = 0 from public.hr_employees), 'Admin de otro tenant no ve fichas');
select pg_temp.expect_error(format($$select public.hr_save_employee(%L, 1, '{"employee_code":"J1","first_name":"X","last_name":"Y","hire_date":"2025-01-06","contract_type":"Indefinido"}')$$, (select id from ids where name='boss')), 'no disponible', 'Admin de otro tenant no edita');
select pg_temp.as_user(6);
select pg_temp.assert_true((select count(*) = 0 from public.hr_employees), 'usuario inactivo no ve su ficha');
select pg_temp.as_user(2);
select pg_temp.expect_error($$insert into public.hr_employees(tenant_id,employee_code,first_name,last_name,hire_date,contract_type,created_by) values('e4010000-0000-4000-8000-000000000100','Z','Z','Z','2026-01-01','Indefinido',auth.uid())$$, 'permission denied', 'sin escritura directa');

-- Solicitudes: 2026-11-16 es lunes. Saldo 10 dias habiles.
insert into ids select 'r1', public.hr_request_leave('e401aaaa-0000-4000-8000-000000000001', (select id from ids where name='emp'), 'Vacaciones', '2026-11-16', '2026-11-20', 'Viaje');
select pg_temp.assert_true((select business_days = 5 and status = 'Pendiente' from public.hr_leave_requests where id = (select id from ids where name='r1')), 'cuenta 5 dias habiles');
select pg_temp.assert_true(public.hr_request_leave('e401aaaa-0000-4000-8000-000000000001', (select id from ids where name='emp'), 'Vacaciones', '2026-11-16', '2026-11-20', 'Viaje') = (select id from ids where name='r1'), 'reintento idempotente');
select pg_temp.expect_error(format($$select public.hr_request_leave('e401aaaa-0000-4000-8000-000000000001', %L, 'Vacaciones', '2026-11-16', '2026-11-19')$$, (select id from ids where name='emp')), 'otros datos', 'identificador reutilizado');
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Permiso con goce', '2026-11-18', '2026-11-18')$$, (select id from ids where name='emp')), 'esas fechas', 'sin traslapes');
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Vacaciones', '2026-11-23', '2026-11-30')$$, (select id from ids where name='emp')), 'Saldo', 'pendientes reservan saldo');
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Permiso con goce', '2026-11-21', '2026-11-22')$$, (select id from ids where name='emp')), 'laborables', 'fin de semana no cuenta');
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Vacaciones', '2026-12-01', '2026-12-01')$$, (select id from ids where name='boss')), 'no disponible', 'no solicita por otro empleado');
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Aprobada')$$, (select id from ids where name='r1')), 'No autorizado', 'empleado no se aprueba');
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*) = 0 from public.hr_leave_requests), 'otro usuario no ve solicitudes ajenas');
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Cancelada')$$, (select id from ids where name='r1')), 'No autorizado', 'otro usuario no cancela');

-- Revision por Admin.
select pg_temp.as_user(1);
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Rechazada', '  ')$$, (select id from ids where name='r1')), 'motivo', 'rechazo exige motivo');
select public.hr_review_leave((select id from ids where name='r1'), 'Aprobada', '');
select pg_temp.assert_true((select status = 'Aprobada' and reviewed_by = 'e4010000-0000-4000-8000-000000000001' from public.hr_leave_requests where id = (select id from ids where name='r1')), 'aprobada con auditoria');
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Rechazada', 'tarde')$$, (select id from ids where name='r1')), 'revisada', 'no se revisa dos veces');
-- Admin solicita en nombre del empleado y el saldo restante es exacto (5).
insert into ids select 'r2', public.hr_request_leave(gen_random_uuid(), (select id from ids where name='emp'), 'Vacaciones', '2026-12-07', '2026-12-11');
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Vacaciones', '2026-12-14', '2026-12-14')$$, (select id from ids where name='emp')), 'Saldo', 'saldo agotado');
-- El empleado cancela su pendiente y libera saldo; no puede cancelar una aprobada.
select pg_temp.as_user(2);
select public.hr_review_leave((select id from ids where name='r2'), 'Cancelada');
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Cancelada')$$, (select id from ids where name='r1')), 'No autorizado', 'empleado no cancela aprobadas');
select public.hr_request_leave(gen_random_uuid(), (select id from ids where name='emp'), 'Vacaciones', '2026-12-14', '2026-12-14');
select pg_temp.assert_true((select count(*) = 3 from public.hr_leave_requests), 'empleado ve sus tres solicitudes');
select pg_temp.as_user(6);
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Vacaciones', '2026-12-01', '2026-12-01')$$, (select id from ids where name='off')), 'No autorizado', 'usuario inactivo no solicita');

-- Regresion HR-01: una ficha sin usuario (profile_id NULL) no autoriza a ningun usuario interno.
select pg_temp.as_user(1);
insert into ids select 'boss_req', public.hr_request_leave(gen_random_uuid(), (select id from ids where name='boss'), 'Permiso con goce', '2026-12-02', '2026-12-02');
select pg_temp.as_user(3);
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Permiso con goce', '2026-12-03', '2026-12-03')$$, (select id from ids where name='boss')), 'no disponible', 'no solicita por ficha sin usuario');
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Cancelada')$$, (select id from ids where name='boss_req')), 'No autorizado', 'no cancela solicitud de ficha sin usuario');
select pg_temp.assert_true(public.hr_employee_manager_name((select id from ids where name='boss')) is null, 'no consulta jefe de ficha sin usuario');
select pg_temp.as_user(1);
select pg_temp.assert_true((select status = 'Pendiente' from public.hr_leave_requests where id = (select id from ids where name='boss_req')), 'la solicitud ajena sigue pendiente');

-- Una baja impide nuevas solicitudes.
select pg_temp.as_user(1);
select public.hr_save_employee((select id from ids where name='emp'), 1, jsonb_build_object('employee_code','E1','first_name','Ana','last_name','Ventas','hire_date','2025-01-06',
  'contract_type','Indefinido','status','Inactivo','termination_date','2026-12-31','profile_id','e4010000-0000-4000-8000-000000000002'));
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Incapacidad', '2026-12-21', '2026-12-21')$$, (select id from ids where name='emp')), 'inactivo', 'baja bloquea solicitudes');

rollback;

\set ON_ERROR_STOP on
-- HR-02. Solo base desechable con el historial completo. Todos los fixtures revierten.
-- Fechas relativas a current_date para que la suite no caduque.
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
    'sub', 'e4020000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text, true);
end;
$$;

-- 1 Admin, 2 Ventas vinculado a "emp", 3 Operaciones sin ficha.
insert into public.tenants(id, slug, name) values ('e4020000-0000-4000-8000-000000000100', 'hr02-a', 'RRHH 02');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('e4020000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated', 'hr02-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 3) n;
update public.profiles set rol = (case right(id::text, 3) when '001' then 'Admin' when '003' then 'Operaciones' else 'Ventas' end)::public.user_role,
  status = 'Aprobado', is_active = true, is_platform_admin = false, tenant_id = 'e4020000-0000-4000-8000-000000000100'
where id::text like 'e4020000-%';

-- d: fechas de trabajo. m1/m2/m3 = lunes de las próximas semanas.
create temp table d(k text primary key, v date) on commit drop;
insert into d values ('hire', (current_date - interval '4 years 6 months')::date),
  ('m1', date_trunc('week', current_date)::date + 7), ('m2', date_trunc('week', current_date)::date + 14), ('m3', date_trunc('week', current_date)::date + 21);
create temp table ids(name text primary key, id uuid) on commit drop;
grant all on d, ids to authenticated;
set local role authenticated;

select pg_temp.as_user(1);
insert into ids select 'emp', public.hr_save_employee(null, null, jsonb_build_object('employee_code','V1','first_name','Vera','last_name','Periodos',
  'hire_date',(select v from d where k='hire'),'contract_type','Indefinido','profile_id','e4020000-0000-4000-8000-000000000002'));
insert into ids select 'sat', public.hr_save_employee(null, null, jsonb_build_object('employee_code','V2','first_name','Saul','last_name','Sabado',
  'hire_date',(select v from d where k='hire'),'contract_type','Indefinido','work_schedule','L-S medio'));
select pg_temp.expect_error($$select public.hr_save_employee(null, null, '{"employee_code":"V3","first_name":"A","last_name":"B","hire_date":"2025-01-06","contract_type":"Indefinido","vacation_days_override":"8"}')$$, 'entre 10 y 60', 'minimo por debajo de la ley');

-- Art. 346: cuatro períodos ganados con 10/12/15/20 y el quinto sin ganar.
select pg_temp.assert_true((select array_agg(entitlement order by period_number) = array[10,12,15,20,0] and count(*) filter(where is_earned) = 4
  from public.hr_vacation_periods((select id from ids where name='emp'))), 'escala por antiguedad');
select pg_temp.assert_true((select expired_unused from public.hr_vacation_periods((select id from ids where name='emp')) where period_number = 1), 'periodo vencido sin gozar alerta');
select pg_temp.assert_true((select overdue_unscheduled from public.hr_vacation_periods((select id from ids where name='emp')) where period_number = 4), 'Art. 348: 3 meses sin programar');

-- Saldos históricos: apertura negativa, única por período, solo períodos ganados.
select public.hr_add_vacation_adjustment('e402cccc-0000-4000-8000-000000000001', (select id from ids where name='emp'), 1, 'Apertura', -10, 'Tomadas antes del ERP');
select public.hr_add_vacation_adjustment('e402cccc-0000-4000-8000-000000000002', (select id from ids where name='emp'), 2, 'Apertura', -12, 'Tomadas antes del ERP');
select public.hr_add_vacation_adjustment('e402cccc-0000-4000-8000-000000000003', (select id from ids where name='emp'), 3, 'Apertura', -15, 'Tomadas antes del ERP');
select pg_temp.assert_true(public.hr_add_vacation_adjustment('e402cccc-0000-4000-8000-000000000001', (select id from ids where name='emp'), 1, 'Apertura', -10, 'x')
  = (select id from public.hr_vacation_ledger where request_id = 'e402cccc-0000-4000-8000-000000000001'), 'ajuste idempotente');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 1, 'Apertura', -1, 'otra')$$, (select id from ids where name='emp')), 'ya tiene saldo de apertura', 'una apertura por periodo');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 4, 'Apertura', 3, 'positiva')$$, (select id from ids where name='emp')), 'valor negativo', 'apertura positiva');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 5, 'Apertura', -1, 'futuro')$$, (select id from ids where name='emp')), 'periodos ya ganados', 'apertura de periodo no ganado');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 4, 'Corrección', -2, '  ')$$, (select id from ids where name='emp')), 'motivo', 'ajuste sin motivo');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 4, 'Corrección', -21, 'excede')$$, (select id from ids where name='emp')), 'saldo negativo', 'ajuste no deja negativo');
select pg_temp.assert_true((select bool_and(not expired_unused) from public.hr_vacation_periods((select id from ids where name='emp')) where period_number <= 3), 'aperturas cierran alertas historicas');
select pg_temp.expect_error($$update public.hr_vacation_ledger set days = -1$$, 'permission denied', 'ledger inmutable');

-- Jornada y feriados: L-V cuenta 5 días; L-S medio cuenta el sábado como 1 día.
select pg_temp.assert_true((public.hr_preview_leave((select id from ids where name='emp'), 'Vacaciones', (select v from d where k='m1'), (select v from d where k='m1') + 5)->>'days')::int = 5, 'L-V lunes a sabado = 5');
select pg_temp.assert_true((public.hr_preview_leave((select id from ids where name='sat'), 'Vacaciones', (select v from d where k='m1'), (select v from d where k='m1') + 5)->>'days')::int = 6, 'L-S medio: sabado cuenta 1');
select public.hr_save_holiday((select v from d where k='m2') + 2, 'Feriado de prueba');
select pg_temp.assert_true((public.hr_preview_leave((select id from ids where name='emp'), 'Permiso con goce', (select v from d where k='m2'), (select v from d where k='m2') + 4)->>'days')::int = 4, 'feriado no cuenta');

-- Vacaciones: consume el período 4 y queda marcada como fracción (sobra saldo).
insert into ids select 'r1', public.hr_request_leave('e402aaaa-0000-4000-8000-000000000001', (select id from ids where name='emp'), 'Vacaciones', (select v from d where k='m1'), (select v from d where k='m1') + 4, 'Viaje');
select pg_temp.assert_true((select business_days = 5 and is_fractioned and not is_advance from public.hr_leave_requests where id = (select id from ids where name='r1')), 'fraccion marcada');
select pg_temp.assert_true((select count(*) = 1 and bool_and(period_number = 4 and days = 5) from public.hr_leave_allocations where request_id = (select id from ids where name='r1')), 'asigna periodo 4');
-- Ajuste que dejaría negativo con la pendiente reservada.
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 4, 'Corrección', -16, 'reserva')$$, (select id from ids where name='emp')), 'saldo negativo', 'pendientes reservan saldo frente a ajustes');

-- Anticipos: sin tope configurado se rechaza; con tope 5 se toma 1 día del período 5.
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Vacaciones', %L, %L)$$, (select id from ids where name='emp'),
  (select v from d where k='m3'), (select v from d where k='m3') + 23), 'anticipo disponible es de 0', 'anticipo sin tope');
select pg_temp.expect_error($$select public.hr_save_settings(31)$$, 'entre 0 y 30', 'tope de anticipo valido');
select public.hr_save_settings(5);
-- m3..m3+23: 18 días L-V; quedan 15 en el período 4 → 3 de anticipo.
insert into ids select 'r2', public.hr_request_leave(gen_random_uuid(), (select id from ids where name='emp'), 'Vacaciones', (select v from d where k='m3'), (select v from d where k='m3') + 23);
select pg_temp.assert_true((select is_advance and business_days = 18 from public.hr_leave_requests where id = (select id from ids where name='r2')), 'anticipo marcado');
select pg_temp.assert_true((select array_agg(period_number || ':' || days || ':' || is_advance order by period_number) = array['4:15:false','5:3:true']
  from public.hr_leave_allocations where request_id = (select id from ids where name='r2')), 'asigna saldo y anticipo');
select pg_temp.expect_error(format($$select public.hr_request_leave(gen_random_uuid(), %L, 'Vacaciones', %L, %L)$$, (select id from ids where name='emp'),
  (select v from d where k='m3') + 28, (select v from d where k='m3') + 30), 'anticipo disponible es de 2', 'tope de anticipo acumulado');

-- Regresion: aprobar una solicitud con anticipo registrado antes de bajar el tope.
-- r2 reservo 3 dias de anticipo con tope 5; se baja a 0.
select public.hr_save_settings(0);
-- Sin RPC, una correccion directa reduce el periodo 4: aprobar exigiria 4 de anticipo y no puede ampliarse.
reset role;
insert into public.hr_vacation_ledger(tenant_id,employee_id,period_number,kind,days,reason,request_id,created_by)
values('e4020000-0000-4000-8000-000000000100',(select id from ids where name='emp'),4,'Corrección',-1,'Fixture: reduce periodo','e402dddd-0000-4000-8000-000000000001','e4020000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_error(format($$select public.hr_review_leave(%L, 'Aprobada', '')$$, (select id from ids where name='r2')), 'anticipo disponible es de 3', 'aprobacion no amplia el anticipo reservado');
reset role;
delete from public.hr_vacation_ledger where request_id='e402dddd-0000-4000-8000-000000000001';
set local role authenticated;
select public.hr_review_leave((select id from ids where name='r2'), 'Aprobada', '');
select pg_temp.assert_true((select status = 'Aprobada' and is_advance from public.hr_leave_requests where id = (select id from ids where name='r2'))
  and (select array_agg(period_number || ':' || days || ':' || is_advance order by period_number) = array['4:15:false','5:3:true']
  from public.hr_leave_allocations where request_id = (select id from ids where name='r2')), 'aprobacion conserva el anticipo reservado bajo un tope menor');
select public.hr_save_settings(5);


-- Aprobación revalida saldos y conserva la asignación.
select public.hr_review_leave((select id from ids where name='r1'), 'Aprobada', '');
select pg_temp.assert_true((select status = 'Aprobada' from public.hr_leave_requests where id = (select id from ids where name='r1')), 'aprobada');

-- Art. 350: una sola acumulación, hasta 2 períodos consecutivos ganados.
select pg_temp.expect_error(format($$select public.hr_authorize_accumulation(%L, 2, 4, 'Direccion')$$, (select id from ids where name='emp')), 'uno o dos periodos', 'maximo dos periodos');
select pg_temp.expect_error(format($$select public.hr_authorize_accumulation(%L, 4, 5, 'Direccion')$$, (select id from ids where name='emp')), 'ya ganados', 'no acumula periodo futuro');
select pg_temp.expect_error(format($$select public.hr_authorize_accumulation(%L, 3, 4, '')$$, (select id from ids where name='emp')), 'Art. 350', 'acumulacion exige motivo');
select public.hr_authorize_accumulation((select id from ids where name='emp'), 3, 4, 'Puesto de direccion de dificil reemplazo');
select pg_temp.expect_error(format($$select public.hr_authorize_accumulation(%L, 1, 1, 'Otra vez')$$, (select id from ids where name='emp')), 'unica acumulacion', 'una sola vez');
select pg_temp.assert_true((select accumulated from public.hr_vacation_periods((select id from ids where name='emp')) where period_number = 4), 'periodo acumulado marcado');

-- Art. 351: suspensión; los días no gozados vuelven al período.
select pg_temp.expect_error(format($$select public.hr_suspend_leave(%L, %L, 'Urgencia')$$, (select id from ids where name='r1'), (select v from d where k='m1')), 'despues del primer dia', 'reintegro el primer dia');
select pg_temp.expect_error(format($$select public.hr_suspend_leave(%L, %L, ' ')$$, (select id from ids where name='r1'), (select v from d where k='m1') + 2), 'motivo', 'suspension exige motivo');
select public.hr_suspend_leave((select id from ids where name='r1'), (select v from d where k='m1') + 2, 'Cierre urgente de embarque');
select pg_temp.assert_true((select business_days = 2 and end_date = (select v from d where k='m1') + 1 and original_end_date = (select v from d where k='m1') + 4 and suspended_at is not null
  from public.hr_leave_requests where id = (select id from ids where name='r1')), 'suspension acorta la solicitud');
select pg_temp.assert_true((select days = 2 from public.hr_leave_allocations where request_id = (select id from ids where name='r1')), 'asignacion reducida');
select pg_temp.assert_true((select available = 3 from public.hr_vacation_periods((select id from ids where name='emp')) where period_number = 4), 'dias devueltos al periodo 4');

-- La fecha de ingreso no se mueve con vacaciones registradas; el mínimo solo sube.
select pg_temp.expect_error(format($$select public.hr_save_employee(%L, 1, jsonb_build_object('employee_code','V1','first_name','Vera','last_name','Periodos','hire_date',%L,'contract_type','Indefinido','profile_id','e4020000-0000-4000-8000-000000000002'))$$,
  (select id from ids where name='emp'), (select v from d where k='hire') - 30), 'fecha de ingreso', 'ingreso bloqueado');
select public.hr_save_employee((select id from ids where name='emp'), 1, jsonb_build_object('employee_code','V1','first_name','Vera','last_name','Periodos',
  'hire_date',(select v from d where k='hire'),'contract_type','Indefinido','profile_id','e4020000-0000-4000-8000-000000000002','vacation_days_override','25'));
-- Regresion HR-02 P1: el minimo rige hacia adelante; los periodos ganados conservan su derecho.
select pg_temp.assert_true((select array_agg(entitlement order by period_number) = array[10,12,15,20,0]
  from public.hr_vacation_periods((select id from ids where name='emp'))), 'minimo no modifica periodos ganados');
select pg_temp.assert_true((select days = 25 and effective_from = current_date from public.hr_vacation_minimums
  where employee_id = (select id from ids where name='emp') and days is not null), 'minimo con vigencia desde hoy');

-- Regresion HR-02 P2: bajar el tope no bloquea cambios ajenos ni conserva mal los anticipos previos.
select public.hr_save_settings(0);
select public.hr_save_employee((select id from ids where name='emp'), 2, jsonb_build_object('employee_code','V1','first_name','Vera','last_name','Periodos','phone','9999-0000',
  'hire_date',(select v from d where k='hire'),'contract_type','Indefinido','profile_id','e4020000-0000-4000-8000-000000000002','vacation_days_override','25'));
select pg_temp.assert_true((select phone = '9999-0000' from public.hr_employees where id = (select id from ids where name='emp')), 'editar ficha con anticipo previo sobre el tope');
select pg_temp.assert_true((select advance_used = 3 from public.hr_vacation_summary() where employee_id = (select id from ids where name='emp')), 'anticipo previo se conserva');
select public.hr_add_vacation_adjustment(gen_random_uuid(), (select id from ids where name='emp'), 5, 'Corrección', 1, 'Reduce el anticipo');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 5, 'Corrección', -1, 'Aumenta anticipo')$$, (select id from ids where name='emp')), 'excede el maximo', 'nuevo anticipo respeta el tope actual');
select public.hr_save_settings(5);

-- Regresion HR-02 P1: suspender usa las fechas descontadas al registrar, aunque cambie el calendario.
select public.hr_save_holiday((select v from d where k='m3') + 30, 'Feriado temporal');
insert into ids select 'r3', public.hr_request_leave(gen_random_uuid(), (select id from ids where name='emp'), 'Permiso con goce', (select v from d where k='m3') + 28, (select v from d where k='m3') + 32);
select pg_temp.assert_true((select business_days = 4 and cardinality(counted_dates) = 4 from public.hr_leave_requests where id = (select id from ids where name='r3')), 'fechas descontadas guardadas');
select public.hr_review_leave((select id from ids where name='r3'), 'Aprobada', '');
select public.hr_delete_holiday((select v from d where k='m3') + 30);
select public.hr_suspend_leave((select id from ids where name='r3'), (select v from d where k='m3') + 31, 'Urgencia');
select pg_temp.assert_true((select business_days = 2 and cardinality(counted_dates) = 2 from public.hr_leave_requests where id = (select id from ids where name='r3')), 'suspension no recuenta el feriado eliminado');

-- Cambiar la jornada tampoco reescribe los sabados ya gozados de una solicitud.
insert into ids select 'schedule', public.hr_save_employee(null, null, jsonb_build_object(
  'employee_code','S1','first_name','Jornada','last_name','Historica','hire_date',(select v from d where k='hire'),
  'contract_type','Indefinido','work_schedule','L-S medio'));
insert into ids select 'schedule-request', public.hr_request_leave(gen_random_uuid(), (select id from ids where name='schedule'),
  'Vacaciones', (select v from d where k='m3') + 42, (select v from d where k='m3') + 50, 'Jornada original L-S');
select public.hr_review_leave((select id from ids where name='schedule-request'), 'Aprobada', '');
select public.hr_save_employee((select id from ids where name='schedule'), 1, jsonb_build_object(
  'employee_code','S1','first_name','Jornada','last_name','Historica','hire_date',(select v from d where k='hire'),
  'contract_type','Indefinido','work_schedule','L-V'));
select public.hr_suspend_leave((select id from ids where name='schedule-request'), (select v from d where k='m3') + 49, 'Urgencia tras cambiar jornada');
select pg_temp.assert_true((select business_days = 6 and cardinality(counted_dates) = 6
  and ((select v from d where k='m3') + 47) = any(counted_dates)
  from public.hr_leave_requests where id = (select id from ids where name='schedule-request')),
  'suspension conserva sabado ya descontado aunque cambie jornada');

-- Resumen para Admin.
select pg_temp.assert_true((select advance_used = 2 and earned_periods = 4 from public.hr_vacation_summary() where employee_id = (select id from ids where name='emp')), 'resumen con anticipo tras la correccion +1');

-- Autoservicio y RLS.
select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*) = 5 from public.hr_vacation_periods((select id from ids where name='emp'))), 'empleado ve sus periodos');
select pg_temp.assert_true((select count(*) = 4 from public.hr_vacation_ledger) and (select count(*) >= 3 from public.hr_leave_allocations)
  and (select count(*) = 1 from public.hr_vacation_accumulations) and (select count(*) = 1 from public.hr_holidays) and (select count(*) = 1 from public.hr_settings), 'empleado lee lo propio y catalogos');
select pg_temp.expect_error(format($$select * from public.hr_vacation_periods(%L)$$, (select id from ids where name='sat')), 'no disponible', 'no ve periodos ajenos');
select pg_temp.expect_error(format($$select public.hr_preview_leave(%L, 'Vacaciones', current_date, current_date)$$, (select id from ids where name='sat')), 'no disponible', 'no previsualiza ajenos');
select pg_temp.expect_error($$select * from public.hr_vacation_summary()$$, 'No autorizado', 'resumen solo Admin');
select pg_temp.expect_error(format($$select public.hr_add_vacation_adjustment(gen_random_uuid(), %L, 4, 'Corrección', 5, 'yo mismo')$$, (select id from ids where name='emp')), 'No autorizado', 'empleado no ajusta');
select pg_temp.expect_error(format($$select public.hr_suspend_leave(%L, %L, 'x')$$, (select id from ids where name='r1'), (select v from d where k='m1') + 1), 'No autorizado', 'empleado no suspende');
select pg_temp.expect_error($$select public.hr_save_settings(30)$$, 'No autorizado', 'empleado no configura');
select pg_temp.expect_error($$select public.hr_save_holiday(current_date, 'x')$$, 'No autorizado', 'empleado no crea feriados');
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*) = 0 from public.hr_vacation_ledger) and (select count(*) = 0 from public.hr_leave_allocations) and (select count(*) = 0 from public.hr_vacation_accumulations), 'usuario sin ficha no ve movimientos');
select pg_temp.assert_true((select count(*) = 1 from public.hr_holidays), 'usuario interno ve el calendario');
rollback;

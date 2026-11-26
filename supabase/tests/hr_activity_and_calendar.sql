\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message;end if;end $$;
create function pg_temp.denied(command text) returns void language plpgsql as $$
begin
 begin execute command;exception when insufficient_privilege then return;end;
 raise exception 'ASSERTION FAILED: se esperaba denegacion';
end $$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','e4050000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);end $$;
insert into public.tenants(id,slug,name) values
 ('e4050000-0000-4000-8000-000000000100','hr05-a','HR05 A'),('e4050000-0000-4000-8000-000000000200','hr05-b','HR05 B');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('e4050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','hr05-'||n||'@test.local','{}'::jsonb from generate_series(1,7)n;
update public.profiles set rol=(case right(id::text,3) when '001' then 'Admin' when '003' then 'Admin' when '004' then 'Cliente' when '007' then 'Admin' else 'Ventas' end)::public.user_role,
 status=case when right(id::text,3)='006' then 'Pendiente' else 'Aprobado' end,is_active=right(id::text,3) not in ('005','007'),is_platform_admin=false,
 tenant_id=case when right(id::text,3)='003' then 'e4050000-0000-4000-8000-000000000200'::uuid else 'e4050000-0000-4000-8000-000000000100'::uuid end
where id::text like 'e4050000-%';
create temp table ids(name text primary key,id uuid) on commit drop;
grant all on ids to authenticated;
set local role authenticated;
select pg_temp.as_user(1);
insert into ids select 'a',public.hr_save_employee(null,null,jsonb_build_object('employee_code','A1','first_name','Ana','last_name','Historica','hire_date',current_date-interval '2 years','contract_type','Indefinido','profile_id','e4050000-0000-4000-8000-000000000002','department','Operaciones'));
select pg_temp.ok((select count(*)=1 from public.hr_employee_history),'creacion auditada');
select public.hr_save_employee((select id from ids where name='a'),1,jsonb_build_object('employee_code','A1','first_name','Ana','last_name','Historica','hire_date',current_date-interval '2 years','contract_type','Indefinido','profile_id','e4050000-0000-4000-8000-000000000002','department','Ventas'));
select pg_temp.ok((select changes->'department'->>'before'='Operaciones' and changes->'department'->>'after'='Ventas' from public.hr_employee_history where revision=2),'diff de ficha conserva ambos valores');
select pg_temp.denied($$insert into public.hr_employee_history(tenant_id,employee_id,revision,action,changes) select tenant_id,id,3,'Actualización','{}' from public.hr_employees limit 1$$);
select pg_temp.as_user(3);
select pg_temp.ok((select count(*)=0 from public.hr_employee_history),'otro tenant no ve historial');
insert into ids select 'b',public.hr_save_employee(null,null,jsonb_build_object('employee_code','B1','first_name','Beto','last_name','Ajeno','hire_date',current_date-interval '2 years','contract_type','Indefinido'));
select pg_temp.as_user(2);
select pg_temp.ok((select count(*)=0 from public.hr_employee_history),'empleado no ve historial administrativo');
insert into ids select 'request',public.hr_request_leave('e405aaaa-0000-4000-8000-000000000001',(select id from ids where name='a'),'Vacaciones',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+11,'Prueba HR05');
select pg_temp.ok((select count(*)=0 from public.hr_absence_calendar(current_date-30,current_date+60)),'pendientes no aparecen en calendario');
select pg_temp.ok(public.hr_request_leave('e405aaaa-0000-4000-8000-000000000001',(select id from ids where name='a'),'Vacaciones',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+11,'Prueba HR05')=(select id from ids where name='request'),'reintento retorna misma solicitud');
select pg_temp.as_user(1);
select pg_temp.ok((select count(*)=1 from public.hr_notice_deliveries),'un solo aviso de solicitud a admin activo');
select pg_temp.ok((select count(*)=1 from public.notifications where title='Nueva solicitud de RRHH'),'aviso interno persistido');
select public.hr_review_leave((select id from ids where name='request'),'Aprobada','Autorizado');
select pg_temp.ok((select count(*)=2 from public.hr_notice_deliveries),'admin recibe solicitud y decision');
select pg_temp.ok((select count(*)=1 from public.hr_absence_calendar(current_date-30,current_date+60)),'admin ve ausencia aprobada');
select pg_temp.denied(format($$select * from public.hr_absence_calendar(current_date-30,current_date+60,%L)$$,(select id from ids where name='b')));
select pg_temp.as_user(2);
select pg_temp.ok((select count(*)=1 from public.hr_notice_deliveries),'empleado recibe solo su decision');
select pg_temp.ok((select count(*)=1 from public.hr_absence_calendar(current_date-30,current_date+60)),'empleado ve ausencia propia');
select pg_temp.denied(format($$select * from public.hr_absence_calendar(current_date-30,current_date+60,%L)$$,(select id from ids where name='b')));
select pg_temp.as_user(3);
select pg_temp.ok((select count(*)=0 from public.hr_absence_calendar(current_date-30,current_date+60)),'tenant B no ve ausencias A');
select pg_temp.ok((select count(*)=0 from public.hr_notice_deliveries),'tenant B no ve destinatarios A');
select pg_temp.as_user(4);
select pg_temp.denied($$select * from public.hr_absence_calendar(current_date,current_date+30)$$);
select pg_temp.ok((select count(*)=0 from public.hr_employee_history),'cliente no ve historial');
select pg_temp.as_user(5);
select pg_temp.denied($$select * from public.hr_absence_calendar(current_date,current_date+30)$$);
select pg_temp.as_user(6);
select pg_temp.denied($$select * from public.hr_absence_calendar(current_date,current_date+30)$$);
reset role;
select pg_temp.ok((select count(*)=3 from public.hr_notice_deliveries),'tres entregas totales sin duplicados ni usuarios inactivos/ajenos');
select pg_temp.ok((select bool_and(n.user_id=d.user_id and n.tenant_id=d.tenant_id) from public.hr_notice_deliveries d join public.notifications n on n.id=d.notification_id),'avisos y destinatarios del mismo tenant');
-- El vínculo histórico no concede avisos internos si el perfil deja de ser interno.
select pg_temp.as_user(1);
update public.profiles set rol='Cliente' where id='e4050000-0000-4000-8000-000000000002';
set local role authenticated;select pg_temp.as_user(1);
insert into ids select 'role-change-request',public.hr_request_leave(gen_random_uuid(),(select id from ids where name='a'),'Permiso con goce',date_trunc('week',current_date)::date+35,date_trunc('week',current_date)::date+36,'Prueba de cambio de rol');
select public.hr_review_leave((select id from ids where name='role-change-request'),'Aprobada','Aprobación tras cambio de rol');
reset role;
select pg_temp.ok((select count(*)=1 from public.hr_notice_deliveries where user_id='e4050000-0000-4000-8000-000000000002'),'un perfil convertido a Cliente no recibe nuevos avisos HR');
rollback;

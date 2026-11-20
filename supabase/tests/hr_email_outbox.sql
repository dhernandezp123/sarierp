\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message;end if;end $$;
create function pg_temp.denied(command text) returns void language plpgsql as $$
begin begin execute command;exception when insufficient_privilege then return;end;raise exception 'Expected permission denial';end $$;
insert into public.tenants(id,slug,name) values ('e4070000-0000-4000-8000-000000000100','hr07-a','HR07 A'),('e4070000-0000-4000-8000-000000000200','hr07-b','HR07 B');
insert into public.tenant_domains(tenant_id,hostname,is_primary) values('e4070000-0000-4000-8000-000000000100','hr07.example.invalid',true);
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('e4070000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','hr07-'||n||'@example.invalid','{}'::jsonb from generate_series(1,3)n;
update public.profiles set rol=(case right(id::text,1) when '2' then 'Ventas' else 'Admin' end)::public.user_role,status='Aprobado',is_active=true,is_platform_admin=false,
 tenant_id=case right(id::text,1) when '3' then 'e4070000-0000-4000-8000-000000000200'::uuid else 'e4070000-0000-4000-8000-000000000100'::uuid end
where id::text like 'e4070000-%';
create temp table ids(name text primary key,id uuid);grant all on ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e4070000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into ids select 'employee',public.hr_save_employee(null,null,jsonb_build_object('employee_code','HR07','first_name','Persona','last_name','Sintetica','hire_date',current_date-interval '2 years','contract_type','Indefinido','profile_id','e4070000-0000-4000-8000-000000000002'));
insert into ids select 'request',public.hr_request_leave('e407aaaa-0000-4000-8000-000000000001',(select id from ids where name='employee'),'Permiso con goce',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+8,'No enviar información privada');
select pg_temp.denied('select * from public.hr_email_outbox');
select pg_temp.denied('select public.get_hr_email_dispatch(gen_random_uuid())');
select pg_temp.ok((select count(*)=1 from public.hr_email_status()),'admin ve solo su estado de correo');
select public.hr_review_leave((select id from ids where name='request'),'Aprobada','Revisado');
select public.hr_save_email_settings(false);
reset role;
select pg_temp.ok((select count(*)=3 from public.hr_email_outbox where tenant_id='e4070000-0000-4000-8000-000000000100'),'cola contiene solicitud y decisión para admin y empleado');
select pg_temp.ok((select bool_and(public.get_hr_email_dispatch(id) is null) from public.hr_email_outbox),'desactivar detiene cola existente');
update public.hr_settings set email_enabled=true where tenant_id='e4070000-0000-4000-8000-000000000100';
select pg_temp.ok((select bool_and(public.get_hr_email_dispatch(id)->>'origin'='https://hr07.example.invalid') from public.hr_email_outbox),'dominio congelable pertenece al tenant');
update public.profiles set email='changed@example.invalid' where id='e4070000-0000-4000-8000-000000000002';
select pg_temp.ok((select public.get_hr_email_dispatch(id) is null from public.hr_email_outbox where user_id='e4070000-0000-4000-8000-000000000002'),'cambio de correo retiene aviso dirigido a cuenta anterior');
update public.profiles set is_active=false where id='e4070000-0000-4000-8000-000000000001';
select pg_temp.ok((select bool_and(public.get_hr_email_dispatch(id) is null) from public.hr_email_outbox),'inactivo no recibe cola');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e4070000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.ok((select count(*)=0 from public.hr_email_status()),'tenant ajeno no ve estados');
select set_config('request.jwt.claims','{"sub":"e4070000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.ok((select count(*)=1 from public.hr_email_status()),'empleado solo ve su decisión');
select pg_temp.denied('select public.hr_save_email_settings(false)');
reset role;
rollback;

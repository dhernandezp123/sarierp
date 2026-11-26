-- HR-01. Recursos Humanos fase 1: ficha de empleados y solicitudes de vacaciones/permisos.
-- Admin administra; cada usuario interno ve solo su ficha vinculada y sus solicitudes.
-- Lecturas por RLS; todas las escrituras pasan por RPC security definer.

create function public.hr_is_manager() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid()
  and p.tenant_id=public.current_tenant_id() and p.rol='Admin' and p.status='Aprobado' and p.is_active);
$$;
create function public.hr_is_internal_user() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid()
  and p.tenant_id=public.current_tenant_id() and p.rol<>'Cliente' and p.status='Aprobado' and p.is_active);
$$;

create table public.hr_employees (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 profile_id uuid references public.profiles(id),
 employee_code text not null, first_name text not null, last_name text not null,
 national_id text not null default '', birth_date date, email text not null default '', phone text not null default '',
 address text not null default '', emergency_contact_name text not null default '', emergency_contact_phone text not null default '',
 department text not null default '', job_title text not null default '', manager_id uuid references public.hr_employees(id),
 hire_date date not null, contract_type text not null check(contract_type in ('Indefinido','Temporal','Por obra','Practicante')),
 status text not null default 'Activo' check(status in ('Activo','Inactivo')), termination_date date,
 vacation_days_per_year numeric(5,1) not null default 10 check(vacation_days_per_year between 0 and 60),
 revision integer not null default 1,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 unique(tenant_id,employee_code), unique(tenant_id,profile_id),
 check(termination_date is null or termination_date>=hire_date),
 check((status='Inactivo')=(termination_date is not null)),
 check(manager_id is distinct from id)
);
create index hr_employees_list on public.hr_employees(tenant_id,status,last_name,id);

create table public.hr_leave_requests (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 employee_id uuid not null references public.hr_employees(id),
 leave_type text not null check(leave_type in ('Vacaciones','Permiso con goce','Permiso sin goce','Incapacidad')),
 start_date date not null, end_date date not null, business_days integer not null check(business_days between 1 and 366),
 reason text not null default '', status text not null default 'Pendiente' check(status in ('Pendiente','Aprobada','Rechazada','Cancelada')),
 review_notes text not null default '', reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 request_id uuid not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,request_id),
 check(end_date>=start_date), check(extract(year from start_date)=extract(year from end_date))
);
create index hr_leave_requests_list on public.hr_leave_requests(tenant_id,status,start_date,id);
create index hr_leave_requests_employee on public.hr_leave_requests(tenant_id,employee_id,start_date);

alter table public.hr_employees enable row level security;
alter table public.hr_leave_requests enable row level security;
create policy hr_employees_read on public.hr_employees for select to authenticated using(
 tenant_id=public.current_tenant_id() and (public.hr_is_manager() or (profile_id=auth.uid() and public.hr_is_internal_user())));
create policy hr_leave_requests_read on public.hr_leave_requests for select to authenticated using(
 tenant_id=public.current_tenant_id() and (public.hr_is_manager() or (public.hr_is_internal_user() and exists(
  select 1 from public.hr_employees e where e.id=employee_id and e.tenant_id=hr_leave_requests.tenant_id and e.profile_id=auth.uid()))));
revoke all on public.hr_employees,public.hr_leave_requests from public,anon,authenticated;
grant select on public.hr_employees,public.hr_leave_requests to authenticated;

-- Dias habiles lunes a viernes; los feriados no se descuentan en esta fase.
create function public.hr_business_days(p_start date,p_end date) returns integer language sql immutable set search_path=public as $$
 select count(*)::integer from generate_series(p_start,p_end,interval '1 day') d where extract(isodow from d) between 1 and 5;
$$;

create function public.hr_save_employee(p_id uuid,p_revision integer,p_employee jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
 tenant uuid:=public.current_tenant_id(); e public.hr_employees%rowtype; result_id uuid:=coalesce(p_id,gen_random_uuid());
 v_code text:=btrim(coalesce(p_employee->>'employee_code','')); v_first text:=btrim(coalesce(p_employee->>'first_name',''));
 v_last text:=btrim(coalesce(p_employee->>'last_name','')); v_profile uuid:=nullif(p_employee->>'profile_id','')::uuid;
 v_manager uuid:=nullif(p_employee->>'manager_id','')::uuid; v_hire date:=nullif(p_employee->>'hire_date','')::date;
 v_birth date:=nullif(p_employee->>'birth_date','')::date; v_term date:=nullif(p_employee->>'termination_date','')::date;
 v_status text:=coalesce(p_employee->>'status','Activo'); v_contract text:=p_employee->>'contract_type';
 v_days numeric:=coalesce(nullif(p_employee->>'vacation_days_per_year','')::numeric,10); cursor_id uuid; depth integer:=0;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if jsonb_typeof(p_employee) is distinct from 'object' then raise exception 'Datos invalidos';end if;
 if v_code='' or length(v_code)>40 or v_first='' or length(v_first)>120 or v_last='' or length(v_last)>120 then raise exception 'Codigo, nombres y apellidos son obligatorios';end if;
 if v_hire is null or v_contract is null or v_contract not in ('Indefinido','Temporal','Por obra','Practicante') then raise exception 'Indica fecha de ingreso y tipo de contrato';end if;
 if v_status not in ('Activo','Inactivo') or (v_status='Inactivo')<>(v_term is not null) then raise exception 'Una baja requiere fecha de salida y un empleado activo no la lleva';end if;
 if v_term is not null and v_term<v_hire then raise exception 'La fecha de salida no puede ser anterior al ingreso';end if;
 if v_birth is not null and (v_birth>v_hire or v_birth<date '1900-01-01') then raise exception 'Fecha de nacimiento invalida';end if;
 if v_days::text in ('NaN','Infinity','-Infinity') or v_days<0 or v_days>60 or v_days<>round(v_days,1) then raise exception 'Dias de vacaciones invalidos';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-employee:'||tenant,0));
 if p_id is not null then
  select * into e from public.hr_employees where id=p_id and tenant_id=tenant for update;
  if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
  if e.revision is distinct from p_revision then raise exception 'La ficha cambio; recarga antes de continuar';end if;
 end if;
 if v_profile is not null and not exists(select 1 from public.profiles p where p.id=v_profile and p.tenant_id=tenant and p.rol<>'Cliente') then raise exception 'Usuario no disponible';end if;
 if v_profile is not null and exists(select 1 from public.hr_employees x where x.tenant_id=tenant and x.profile_id=v_profile and x.id<>result_id) then raise exception 'El usuario ya esta vinculado a otro empleado';end if;
 if exists(select 1 from public.hr_employees x where x.tenant_id=tenant and lower(x.employee_code)=lower(v_code) and x.id<>result_id) then raise exception 'El codigo de empleado ya existe';end if;
 if v_manager is not null then
  if not exists(select 1 from public.hr_employees x where x.id=v_manager and x.tenant_id=tenant) then raise exception 'Jefe directo no disponible';end if;
  cursor_id:=v_manager;
  while cursor_id is not null and depth<100 loop
   if cursor_id=result_id then raise exception 'El jefe directo genera un ciclo';end if;
   select manager_id into cursor_id from public.hr_employees where id=cursor_id; depth:=depth+1;
  end loop;
 end if;
 if p_id is null then
  insert into public.hr_employees(id,tenant_id,employee_code,first_name,last_name,hire_date,contract_type,created_by)
  values(result_id,tenant,v_code,v_first,v_last,v_hire,v_contract,auth.uid());
 end if;
 update public.hr_employees set profile_id=v_profile,employee_code=v_code,first_name=v_first,last_name=v_last,
  national_id=left(btrim(coalesce(p_employee->>'national_id','')),40),birth_date=v_birth,
  email=left(btrim(coalesce(p_employee->>'email','')),200),phone=left(btrim(coalesce(p_employee->>'phone','')),40),
  address=left(btrim(coalesce(p_employee->>'address','')),500),
  emergency_contact_name=left(btrim(coalesce(p_employee->>'emergency_contact_name','')),120),
  emergency_contact_phone=left(btrim(coalesce(p_employee->>'emergency_contact_phone','')),40),
  department=left(btrim(coalesce(p_employee->>'department','')),120),job_title=left(btrim(coalesce(p_employee->>'job_title','')),120),
  manager_id=v_manager,hire_date=v_hire,contract_type=v_contract,status=v_status,termination_date=v_term,vacation_days_per_year=v_days,
  revision=case when p_id is null then 1 else revision+1 end,updated_by=auth.uid(),updated_at=now()
 where id=result_id;
 return result_id;
end;
$$;

-- Vacaciones usadas: aprobadas y pendientes del mismo año calendario (las pendientes reservan saldo).
create function public.hr_vacation_committed(p_employee uuid,p_year integer,p_exclude uuid default null) returns integer
language sql stable security definer set search_path=public as $$
 select coalesce(sum(business_days),0)::integer from public.hr_leave_requests
 where employee_id=p_employee and leave_type='Vacaciones' and status in ('Pendiente','Aprobada')
  and extract(year from start_date)=p_year and id is distinct from p_exclude;
$$;

create function public.hr_request_leave(p_request_id uuid,p_employee_id uuid,p_leave_type text,p_start date,p_end date,p_reason text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare
 tenant uuid:=public.current_tenant_id(); e public.hr_employees%rowtype; existing public.hr_leave_requests%rowtype;
 days integer; result_id uuid:=gen_random_uuid();
begin
 if not public.hr_is_internal_user() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Solicitud invalida';end if;
 -- El lock por identificador precede a la comprobacion: un reintento concurrente espera y devuelve el mismo ID.
 perform pg_advisory_xact_lock(hashtextextended('hr-leave-request:'||tenant||':'||p_request_id,0));
 select * into existing from public.hr_leave_requests where tenant_id=tenant and request_id=p_request_id;
 if found then
  if existing.employee_id<>p_employee_id or existing.leave_type<>p_leave_type or existing.start_date<>p_start or existing.end_date<>p_end then raise exception 'El identificador ya se utilizo con otros datos';end if;
  return existing.id;
 end if;
 select * into e from public.hr_employees where id=p_employee_id and tenant_id=tenant;
 if not found or not (public.hr_is_manager() or coalesce(e.profile_id=auth.uid(),false)) then raise exception 'Empleado no disponible' using errcode='42501';end if;
 if e.status<>'Activo' then raise exception 'El empleado esta inactivo';end if;
 if p_leave_type is null or p_leave_type not in ('Vacaciones','Permiso con goce','Permiso sin goce','Incapacidad') then raise exception 'Tipo de solicitud invalido';end if;
 if p_start is null or p_end is null or p_end<p_start then raise exception 'Revisa las fechas';end if;
 if extract(year from p_start)<>extract(year from p_end) then raise exception 'Divide la solicitud por año calendario';end if;
 if p_start<e.hire_date then raise exception 'La solicitud no puede ser anterior al ingreso';end if;
 if length(coalesce(p_reason,''))>1000 then raise exception 'Motivo demasiado largo';end if;
 days:=public.hr_business_days(p_start,p_end);
 if days<1 then raise exception 'El rango no contiene dias habiles';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||p_employee_id,0));
 if exists(select 1 from public.hr_leave_requests r where r.employee_id=p_employee_id and r.status in ('Pendiente','Aprobada')
  and r.start_date<=p_end and r.end_date>=p_start) then raise exception 'Ya existe una solicitud en esas fechas';end if;
 if p_leave_type='Vacaciones' and public.hr_vacation_committed(p_employee_id,extract(year from p_start)::integer)+days>e.vacation_days_per_year then
  raise exception 'Saldo de vacaciones insuficiente';end if;
 insert into public.hr_leave_requests(id,tenant_id,employee_id,leave_type,start_date,end_date,business_days,reason,request_id,created_by)
 values(result_id,tenant,p_employee_id,p_leave_type,p_start,p_end,days,btrim(coalesce(p_reason,'')),p_request_id,auth.uid());
 return result_id;
end;
$$;

create function public.hr_review_leave(p_id uuid,p_decision text,p_notes text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id(); r public.hr_leave_requests%rowtype; e public.hr_employees%rowtype;
begin
 if p_decision is null or p_decision not in ('Aprobada','Rechazada','Cancelada') then raise exception 'Accion invalida';end if;
 if length(coalesce(p_notes,''))>1000 then raise exception 'Nota demasiado larga';end if;
 select * into r from public.hr_leave_requests where id=p_id and tenant_id=tenant;
 if not found then raise exception 'Solicitud no disponible' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||r.employee_id,0));
 select * into r from public.hr_leave_requests where id=p_id for update;
 select * into e from public.hr_employees where id=r.employee_id;
 if p_decision='Cancelada' then
  -- El empleado cancela su solicitud pendiente; Admin puede cancelar pendientes o aprobadas.
  if not (public.hr_is_manager() or (public.hr_is_internal_user() and coalesce(e.profile_id=auth.uid(),false) and r.status='Pendiente')) then raise exception 'No autorizado' using errcode='42501';end if;
  if r.status not in ('Pendiente','Aprobada') then raise exception 'La solicitud ya no admite cambios';end if;
 else
  if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
  if r.status<>'Pendiente' then raise exception 'La solicitud ya fue revisada';end if;
  if p_decision='Rechazada' and nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Indica el motivo del rechazo';end if;
  if p_decision='Aprobada' and r.leave_type='Vacaciones' and public.hr_vacation_committed(r.employee_id,extract(year from r.start_date)::integer,r.id)+r.business_days>e.vacation_days_per_year then
   raise exception 'Saldo de vacaciones insuficiente';end if;
 end if;
 update public.hr_leave_requests set status=p_decision,review_notes=btrim(coalesce(p_notes,'')),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
 return r.id;
end;
$$;

revoke all on function public.hr_is_manager(),public.hr_is_internal_user(),public.hr_business_days(date,date),
 public.hr_save_employee(uuid,integer,jsonb),public.hr_vacation_committed(uuid,integer,uuid),
 public.hr_request_leave(uuid,uuid,text,date,date,text),public.hr_review_leave(uuid,text,text) from public,anon;
grant execute on function public.hr_is_manager(),public.hr_is_internal_user(),public.hr_business_days(date,date),
 public.hr_save_employee(uuid,integer,jsonb),public.hr_request_leave(uuid,uuid,text,date,date,text),public.hr_review_leave(uuid,text,text) to authenticated;

-- Autoservicio: el empleado ve el nombre de su jefe sin acceder a la ficha completa del jefe.
create function public.hr_employee_manager_name(p_employee_id uuid) returns text
language sql stable security definer set search_path=public as $$
 select m.first_name||' '||m.last_name from public.hr_employees e join public.hr_employees m on m.id=e.manager_id and m.tenant_id=e.tenant_id
 where e.id=p_employee_id and e.tenant_id=public.current_tenant_id()
  and (public.hr_is_manager() or (coalesce(e.profile_id=auth.uid(),false) and public.hr_is_internal_user()));
$$;
revoke all on function public.hr_employee_manager_name(uuid) from public,anon;
grant execute on function public.hr_employee_manager_name(uuid) to authenticated;

-- HR-02. Vacaciones por aniversario y antigüedad (Código del Trabajo, Decreto 189-59),
-- jornada por empleado, calendario de feriados, saldos históricos, ajustes auditados,
-- acumulación Art. 350, anticipos, fraccionamiento y suspensión Art. 351.
-- Reglas: docs/hr-vacation-policy.md. Requiere 20261118120000_hr_employees_and_leave.sql.

-- ---------------------------------------------------------------- Esquema
alter table public.hr_employees drop column vacation_days_per_year;
alter table public.hr_employees
 add column work_schedule text not null default 'L-V' check(work_schedule in ('L-V','L-S','L-S medio')),
 add column vacation_days_override integer check(vacation_days_override between 10 and 60);

do $$
declare c text;
begin
 -- Los períodos por aniversario reemplazan la regla de año calendario.
 for c in select conname from pg_constraint where conrelid='public.hr_leave_requests'::regclass and contype='c'
  and pg_get_constraintdef(oid) ilike '%extract(year%' loop
  execute format('alter table public.hr_leave_requests drop constraint %I', c);
 end loop;
end $$;
alter table public.hr_leave_requests
 add column is_fractioned boolean not null default false,
 add column is_advance boolean not null default false,
 add column original_end_date date,
 add column suspended_at timestamptz,
 add column suspended_by uuid references auth.users(id),
 add column suspension_notes text not null default '',
 -- Fechas exactas descontadas al registrar (jornada y feriados de ese momento).
 add column counted_dates date[] not null default '{}';

drop function public.hr_vacation_committed(uuid,integer,uuid);
drop function public.hr_business_days(date,date);

-- Mínimo por período con vigencia: cada período usa el valor vigente el día en que se ganó.
-- days null = escala legal. Los cambios retroactivos se hacen con ajustes auditados.
create table public.hr_vacation_minimums (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 employee_id uuid not null references public.hr_employees(id), effective_from date not null,
 days integer check(days between 10 and 60), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(employee_id,effective_from)
);

create table public.hr_settings (
 tenant_id uuid primary key references public.tenants(id),
 max_advance_days integer not null default 0 check(max_advance_days between 0 and 30),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.hr_holidays (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 holiday_date date not null, name text not null check(length(btrim(name)) between 1 and 120),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(tenant_id,holiday_date)
);
create table public.hr_leave_allocations (
 request_id uuid not null references public.hr_leave_requests(id) on delete cascade,
 tenant_id uuid not null references public.tenants(id), employee_id uuid not null references public.hr_employees(id),
 period_number integer not null check(period_number>=1), days integer not null check(days>0), is_advance boolean not null,
 primary key(request_id,period_number)
);
create index hr_leave_allocations_period on public.hr_leave_allocations(employee_id,period_number);
-- Movimientos inmutables: una corrección es otro movimiento, nunca una edición.
create table public.hr_vacation_ledger (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 employee_id uuid not null references public.hr_employees(id), period_number integer not null check(period_number>=1),
 kind text not null check(kind in ('Apertura','Corrección')), days integer not null check(days<>0 and days between -60 and 60),
 reason text not null check(length(btrim(reason)) between 1 and 1000), request_id uuid not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(tenant_id,request_id), check(kind<>'Apertura' or days<0)
);
create unique index hr_vacation_ledger_one_opening on public.hr_vacation_ledger(employee_id,period_number) where kind='Apertura';
create index hr_vacation_ledger_employee on public.hr_vacation_ledger(employee_id,period_number);
-- Art. 350: una sola acumulación por empleado, de hasta 2 períodos.
create table public.hr_vacation_accumulations (
 employee_id uuid primary key references public.hr_employees(id), tenant_id uuid not null references public.tenants(id),
 from_period integer not null check(from_period>=1), to_period integer not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(to_period between from_period and from_period+1)
);

alter table public.hr_vacation_minimums enable row level security;
alter table public.hr_settings enable row level security;
alter table public.hr_holidays enable row level security;
alter table public.hr_leave_allocations enable row level security;
alter table public.hr_vacation_ledger enable row level security;
alter table public.hr_vacation_accumulations enable row level security;
create policy hr_settings_read on public.hr_settings for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_is_internal_user());
create policy hr_holidays_read on public.hr_holidays for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_is_internal_user());
create function public.hr_can_read_employee(p_employee_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.hr_employees e where e.id=p_employee_id and e.tenant_id=public.current_tenant_id()
  and (public.hr_is_manager() or (coalesce(e.profile_id=auth.uid(),false) and public.hr_is_internal_user())));
$$;
create policy hr_vacation_minimums_read on public.hr_vacation_minimums for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_can_read_employee(employee_id));
create policy hr_leave_allocations_read on public.hr_leave_allocations for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_can_read_employee(employee_id));
create policy hr_vacation_ledger_read on public.hr_vacation_ledger for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_can_read_employee(employee_id));
create policy hr_vacation_accumulations_read on public.hr_vacation_accumulations for select to authenticated using(tenant_id=public.current_tenant_id() and public.hr_can_read_employee(employee_id));
revoke all on public.hr_vacation_minimums,public.hr_settings,public.hr_holidays,public.hr_leave_allocations,public.hr_vacation_ledger,public.hr_vacation_accumulations from public,anon,authenticated;
grant select on public.hr_vacation_minimums,public.hr_settings,public.hr_holidays,public.hr_leave_allocations,public.hr_vacation_ledger,public.hr_vacation_accumulations to authenticated;

-- ---------------------------------------------------------------- Cálculo
-- Art. 346: 10/12/15/20 días laborables al cumplir 1/2/3/4+ años; el mínimo por empleado solo puede aumentarlos.
create function public.hr_period_entitlement(p_period integer,p_override integer) returns integer language sql immutable set search_path=public as $$
 select greatest(case when p_period=1 then 10 when p_period=2 then 12 when p_period=3 then 15 else 20 end, coalesce(p_override,0));
$$;

-- Días laborables según jornada; un sábado laborable (completo o medio) cuenta 1 día. Los feriados no cuentan.
create function public.hr_working_dates(p_tenant uuid,p_schedule text,p_start date,p_end date) returns date[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(d::date order by d),'{}') from generate_series(p_start,p_end,interval '1 day') d
 where extract(isodow from d)<=case when p_schedule='L-V' then 5 else 6 end
  and not exists(select 1 from public.hr_holidays h where h.tenant_id=p_tenant and h.holiday_date=d::date);
$$;
create function public.hr_working_days(p_tenant uuid,p_schedule text,p_start date,p_end date) returns integer language sql stable security definer set search_path=public as $$
 select cardinality(public.hr_working_dates(p_tenant,p_schedule,p_start,p_end));
$$;

-- Uso interno (sin autorización): los wrappers públicos la verifican.
create function public.hr_vacation_periods_internal(p_employee_id uuid,p_as_of date default null,p_exclude uuid default null)
returns table(period_number integer,earned_on date,ends_on date,is_earned boolean,entitlement integer,adjustments integer,
 approved integer,pending integer,available integer,accumulated boolean,overdue_unscheduled boolean,expired_unused boolean)
language plpgsql stable security definer set search_path=public as $$
declare e public.hr_employees%rowtype; as_of date; earned integer; n integer; acc public.hr_vacation_accumulations%rowtype;
begin
 select * into e from public.hr_employees where id=p_employee_id;
 if not found then return; end if;
 as_of:=least(coalesce(p_as_of,current_date),coalesce(e.termination_date,'infinity'::date));
 earned:=case when as_of<e.hire_date then 0 else extract(year from age(as_of,e.hire_date))::integer end;
 select * into acc from public.hr_vacation_accumulations where employee_id=e.id;
 for n in 1..earned+1 loop
  period_number:=n; earned_on:=(e.hire_date+make_interval(years=>n))::date; ends_on:=(e.hire_date+make_interval(years=>n+1))::date-1;
  is_earned:=n<=earned;
  entitlement:=case when is_earned then public.hr_period_entitlement(n,(select m.days from public.hr_vacation_minimums m
   where m.employee_id=e.id and m.effective_from<=earned_on order by m.effective_from desc limit 1)) else 0 end;
  select coalesce(sum(l.days),0)::integer into adjustments from public.hr_vacation_ledger l where l.employee_id=e.id and l.period_number=n;
  select coalesce(sum(a.days) filter(where r.status='Aprobada'),0)::integer, coalesce(sum(a.days) filter(where r.status='Pendiente'),0)::integer
   into approved,pending from public.hr_leave_allocations a join public.hr_leave_requests r on r.id=a.request_id
   where a.employee_id=e.id and a.period_number=n and r.status in ('Pendiente','Aprobada') and r.id is distinct from p_exclude;
  available:=entitlement+adjustments-approved-pending;
  accumulated:=acc.employee_id is not null and n between acc.from_period and acc.to_period;
  -- Art. 348: época señalada dentro de los 3 meses siguientes al derecho.
  overdue_unscheduled:=is_earned and available>0 and approved+pending=0 and adjustments>=0 and as_of>(earned_on+interval '3 months')::date;
  -- Art. 350: período vencido con saldo y sin acumulación autorizada (los días no se borran).
  expired_unused:=is_earned and available>0 and as_of>ends_on and not accumulated;
  return next;
 end loop;
end;
$$;

-- Asigna días a períodos: primero el más antiguo con saldo; el resto como anticipo del siguiente.
-- p_reserved: anticipo que la solicitud ya tenía reservado. Se conserva aunque el tope haya bajado,
-- pero nunca se amplía: lo que exceda esa reserva se valida contra el tope vigente.
create function public.hr_allocate_vacation(p_employee_id uuid,p_start date,p_days integer,p_exclude uuid default null,p_reserved integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p record; remaining integer:=p_days; take integer; allowed integer; max_adv integer; result jsonb:='[]'; fractioned boolean:=false; advance boolean:=false; tenant uuid;
begin
 select tenant_id into tenant from public.hr_employees where id=p_employee_id;
 select coalesce((select max_advance_days from public.hr_settings where tenant_id=tenant),0) into max_adv;
 for p in select * from public.hr_vacation_periods_internal(p_employee_id,p_start,p_exclude) order by period_number loop
  exit when remaining=0;
  if p.is_earned then
   take:=least(remaining,greatest(p.available,0));
   if take>0 then
    result:=result||jsonb_build_array(jsonb_build_object('period',p.period_number,'days',take,'advance',false));
    -- Fracción (Art. 346/351): el período ya tuvo uso o queda saldo en él.
    if p.approved+p.pending>0 or p.adjustments<0 or take<p.available then fractioned:=true; end if;
    remaining:=remaining-take;
   end if;
  else
   allowed:=greatest(max_adv-greatest(-p.available,0),coalesce(p_reserved,0));
   if remaining>allowed then
    raise exception 'Saldo de vacaciones insuficiente: faltan % dia(s) y el anticipo disponible es de % dia(s)',remaining,greatest(allowed,0);
   end if;
   if p.approved+p.pending>0 or p.adjustments<>0 then fractioned:=true; end if;
   result:=result||jsonb_build_array(jsonb_build_object('period',p.period_number,'days',remaining,'advance',true));
   advance:=true; remaining:=0;
  end if;
 end loop;
 if remaining>0 then raise exception 'Saldo de vacaciones insuficiente'; end if;
 return jsonb_build_object('allocations',result,'fractioned',fractioned,'advance',advance);
end;
$$;

-- Reescribe la asignación de una solicitud y sus marcas.
create function public.hr_store_allocation(p_request public.hr_leave_requests,p_plan jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
 delete from public.hr_leave_allocations where request_id=p_request.id;
 for item in select value from jsonb_array_elements(p_plan->'allocations') loop
  insert into public.hr_leave_allocations(request_id,tenant_id,employee_id,period_number,days,is_advance)
  values(p_request.id,p_request.tenant_id,p_request.employee_id,(item->>'period')::integer,(item->>'days')::integer,(item->>'advance')::boolean);
 end loop;
 update public.hr_leave_requests set is_fractioned=coalesce((p_plan->>'fractioned')::boolean,false),is_advance=coalesce((p_plan->>'advance')::boolean,false) where id=p_request.id;
end;
$$;

-- ---------------------------------------------------------------- Fichas
create or replace function public.hr_save_employee(p_id uuid,p_revision integer,p_employee jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare
 tenant uuid:=public.current_tenant_id(); e public.hr_employees%rowtype; result_id uuid:=coalesce(p_id,gen_random_uuid());
 v_code text:=btrim(coalesce(p_employee->>'employee_code','')); v_first text:=btrim(coalesce(p_employee->>'first_name',''));
 v_last text:=btrim(coalesce(p_employee->>'last_name','')); v_profile uuid:=nullif(p_employee->>'profile_id','')::uuid;
 v_manager uuid:=nullif(p_employee->>'manager_id','')::uuid; v_hire date:=nullif(p_employee->>'hire_date','')::date;
 v_birth date:=nullif(p_employee->>'birth_date','')::date; v_term date:=nullif(p_employee->>'termination_date','')::date;
 v_status text:=coalesce(p_employee->>'status','Activo'); v_contract text:=p_employee->>'contract_type';
 v_schedule text:=coalesce(nullif(p_employee->>'work_schedule',''),'L-V'); v_override text:=nullif(btrim(coalesce(p_employee->>'vacation_days_override','')),'');
 v_days integer; cursor_id uuid; depth integer:=0; v_effective date;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if jsonb_typeof(p_employee) is distinct from 'object' then raise exception 'Datos invalidos';end if;
 if v_code='' or length(v_code)>40 or v_first='' or length(v_first)>120 or v_last='' or length(v_last)>120 then raise exception 'Codigo, nombres y apellidos son obligatorios';end if;
 if v_hire is null or v_contract is null or v_contract not in ('Indefinido','Temporal','Por obra','Practicante') then raise exception 'Indica fecha de ingreso y tipo de contrato';end if;
 if v_status not in ('Activo','Inactivo') or (v_status='Inactivo')<>(v_term is not null) then raise exception 'Una baja requiere fecha de salida y un empleado activo no la lleva';end if;
 if v_term is not null and v_term<v_hire then raise exception 'La fecha de salida no puede ser anterior al ingreso';end if;
 if v_birth is not null and (v_birth>v_hire or v_birth<date '1900-01-01') then raise exception 'Fecha de nacimiento invalida';end if;
 if v_schedule not in ('L-V','L-S','L-S medio') then raise exception 'Jornada invalida';end if;
 if v_override is not null then
  if v_override !~ '^\d{1,2}$' or v_override::integer not between 10 and 60 then raise exception 'El minimo de vacaciones por periodo debe estar entre 10 y 60 dias';end if;
  v_days:=v_override::integer;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-employee:'||tenant,0));
 if p_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||p_id,0));
  select * into e from public.hr_employees where id=p_id and tenant_id=tenant for update;
  if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
  if e.revision is distinct from p_revision then raise exception 'La ficha cambio; recarga antes de continuar';end if;
  -- Los períodos dependen de la fecha de ingreso: no se mueve si ya hay vacaciones registradas.
  if e.hire_date<>v_hire and (exists(select 1 from public.hr_leave_allocations where employee_id=p_id)
   or exists(select 1 from public.hr_vacation_ledger where employee_id=p_id) or exists(select 1 from public.hr_vacation_accumulations where employee_id=p_id)) then
   raise exception 'No se puede cambiar la fecha de ingreso: ya hay vacaciones o ajustes registrados';end if;
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
  manager_id=v_manager,hire_date=v_hire,contract_type=v_contract,status=v_status,termination_date=v_term,
  work_schedule=v_schedule,vacation_days_override=v_days,
  revision=case when p_id is null then 1 else revision+1 end,updated_by=auth.uid(),updated_at=now()
 where id=result_id;
 -- El mínimo solo rige hacia adelante: al crear la ficha desde el ingreso; al cambiarlo, desde hoy.
 if p_id is null or e.vacation_days_override is distinct from v_days then
  v_effective:=case when p_id is null then v_hire else greatest(current_date,v_hire) end;
  insert into public.hr_vacation_minimums(tenant_id,employee_id,effective_from,days,created_by) values(tenant,result_id,v_effective,v_days,auth.uid())
  on conflict(employee_id,effective_from) do update set days=excluded.days,created_by=excluded.created_by,created_at=now();
 end if;
 return result_id;
end;
$$;

-- ---------------------------------------------------------------- Solicitudes
create function public.hr_validate_leave(p_employee public.hr_employees,p_leave_type text,p_start date,p_end date,p_exclude uuid) returns integer
language plpgsql stable security definer set search_path=public as $$
declare days integer;
begin
 if p_employee.status<>'Activo' then raise exception 'El empleado esta inactivo';end if;
 if p_leave_type is null or p_leave_type not in ('Vacaciones','Permiso con goce','Permiso sin goce','Incapacidad') then raise exception 'Tipo de solicitud invalido';end if;
 if p_start is null or p_end is null or p_end<p_start then raise exception 'Revisa las fechas';end if;
 if p_end-p_start>366 then raise exception 'El rango excede un año';end if;
 if p_start<p_employee.hire_date then raise exception 'La solicitud no puede ser anterior al ingreso';end if;
 days:=public.hr_working_days(p_employee.tenant_id,p_employee.work_schedule,p_start,p_end);
 if days<1 then raise exception 'El rango no contiene dias laborables';end if;
 if exists(select 1 from public.hr_leave_requests r where r.employee_id=p_employee.id and r.status in ('Pendiente','Aprobada')
  and r.start_date<=p_end and r.end_date>=p_start and r.id is distinct from p_exclude) then raise exception 'Ya existe una solicitud en esas fechas';end if;
 return days;
end;
$$;

create or replace function public.hr_request_leave(p_request_id uuid,p_employee_id uuid,p_leave_type text,p_start date,p_end date,p_reason text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare
 tenant uuid:=public.current_tenant_id(); e public.hr_employees%rowtype; existing public.hr_leave_requests%rowtype;
 r public.hr_leave_requests%rowtype; days integer; plan jsonb; result_id uuid:=gen_random_uuid();
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
 if length(coalesce(p_reason,''))>1000 then raise exception 'Motivo demasiado largo';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||p_employee_id,0));
 days:=public.hr_validate_leave(e,p_leave_type,p_start,p_end,null);
 if p_leave_type='Vacaciones' then plan:=public.hr_allocate_vacation(e.id,p_start,days,null); end if;
 insert into public.hr_leave_requests(id,tenant_id,employee_id,leave_type,start_date,end_date,business_days,reason,request_id,created_by,counted_dates)
 values(result_id,tenant,p_employee_id,p_leave_type,p_start,p_end,days,btrim(coalesce(p_reason,'')),p_request_id,auth.uid(),
  public.hr_working_dates(tenant,e.work_schedule,p_start,p_end))
 returning * into r;
 if plan is not null then perform public.hr_store_allocation(r,plan); end if;
 return result_id;
end;
$$;

-- Vista previa sin escribir: días, períodos afectados, fracción y anticipo, o el motivo del rechazo.
create function public.hr_preview_leave(p_employee_id uuid,p_leave_type text,p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare e public.hr_employees%rowtype; days integer; plan jsonb;
begin
 select * into e from public.hr_employees where id=p_employee_id and tenant_id=public.current_tenant_id();
 if not found or not public.hr_can_read_employee(p_employee_id) or not public.hr_is_internal_user() then raise exception 'Empleado no disponible' using errcode='42501';end if;
 begin
  days:=public.hr_validate_leave(e,p_leave_type,p_start,p_end,null);
  if p_leave_type='Vacaciones' then plan:=public.hr_allocate_vacation(e.id,p_start,days,null); end if;
 exception when raise_exception then
  return jsonb_build_object('days',coalesce(days,0),'error',sqlerrm);
 end;
 return jsonb_build_object('days',days,'error',null)||coalesce(plan,'{}'::jsonb);
end;
$$;

create or replace function public.hr_review_leave(p_id uuid,p_decision text,p_notes text default '') returns uuid
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
  if not (public.hr_is_manager() or (public.hr_is_internal_user() and coalesce(e.profile_id=auth.uid(),false) and r.status='Pendiente')) then raise exception 'No autorizado' using errcode='42501';end if;
  if r.status not in ('Pendiente','Aprobada') then raise exception 'La solicitud ya no admite cambios';end if;
 else
  if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
  if r.status<>'Pendiente' then raise exception 'La solicitud ya fue revisada';end if;
  if p_decision='Rechazada' and nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Indica el motivo del rechazo';end if;
  -- Aprobar revalida con los saldos vigentes y reasigna los períodos.
  if p_decision='Aprobada' and r.leave_type='Vacaciones' then
   perform public.hr_store_allocation(r,public.hr_allocate_vacation(r.employee_id,r.start_date,r.business_days,r.id,
    (select coalesce(sum(a.days),0)::integer from public.hr_leave_allocations a where a.request_id=r.id and a.is_advance)));
  end if;
 end if;
 update public.hr_leave_requests set status=p_decision,review_notes=btrim(coalesce(p_notes,'')),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
 return r.id;
end;
$$;

-- Art. 351: suspensión por urgencia; los días no gozados vuelven al saldo del mismo período.
create function public.hr_suspend_leave(p_id uuid,p_return_date date,p_notes text) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id(); r public.hr_leave_requests%rowtype; e public.hr_employees%rowtype;
 v_days integer; excess integer; a record;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if nullif(btrim(coalesce(p_notes,'')),'') is null or length(p_notes)>1000 then raise exception 'Indica el motivo de la suspension';end if;
 select * into r from public.hr_leave_requests where id=p_id and tenant_id=tenant;
 if not found then raise exception 'Solicitud no disponible' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||r.employee_id,0));
 select * into r from public.hr_leave_requests where id=p_id for update;
 select * into e from public.hr_employees where id=r.employee_id;
 if r.status<>'Aprobada' then raise exception 'Solo se suspenden solicitudes aprobadas';end if;
 if p_return_date is null or p_return_date<=r.start_date or p_return_date>r.end_date then raise exception 'La fecha de reintegro debe estar dentro de la solicitud y despues del primer dia';end if;
 -- Se usan las fechas descontadas al registrar, no el calendario actual.
 v_days:=cardinality(array(select d from unnest(r.counted_dates) d where d<p_return_date));
 if v_days<1 then raise exception 'No hay dias gozados antes del reintegro; cancela la solicitud en su lugar';end if;
 excess:=r.business_days-v_days;
 for a in select * from public.hr_leave_allocations where request_id=r.id order by period_number desc loop
  exit when excess<=0;
  if a.days<=excess then delete from public.hr_leave_allocations where request_id=r.id and period_number=a.period_number; excess:=excess-a.days;
  else update public.hr_leave_allocations set days=hr_leave_allocations.days-excess where request_id=r.id and period_number=a.period_number; excess:=0; end if;
 end loop;
 update public.hr_leave_requests set original_end_date=coalesce(original_end_date,end_date),end_date=p_return_date-1,business_days=v_days,
  counted_dates=array(select d from unnest(r.counted_dates) d where d<p_return_date order by d),
  is_advance=exists(select 1 from public.hr_leave_allocations where request_id=r.id and is_advance),
  suspended_at=now(),suspended_by=auth.uid(),suspension_notes=btrim(p_notes),updated_at=now() where id=r.id;
 return r.id;
end;
$$;

-- ---------------------------------------------------------------- Ajustes y acumulación
create function public.hr_add_vacation_adjustment(p_request_id uuid,p_employee_id uuid,p_period integer,p_kind text,p_days integer,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id(); existing public.hr_vacation_ledger%rowtype; earned integer; result_id uuid:=gen_random_uuid(); p record;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Solicitud invalida';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-adjustment:'||tenant||':'||p_request_id,0));
 select * into existing from public.hr_vacation_ledger where tenant_id=tenant and request_id=p_request_id;
 if found then
  if existing.employee_id<>p_employee_id or existing.period_number<>p_period or existing.kind<>p_kind or existing.days<>p_days then raise exception 'El identificador ya se utilizo con otros datos';end if;
  return existing.id;
 end if;
 if not exists(select 1 from public.hr_employees where id=p_employee_id and tenant_id=tenant) then raise exception 'Empleado no disponible' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('Apertura','Corrección') then raise exception 'Tipo de ajuste invalido';end if;
 if p_days is null or p_days=0 or p_days not between -60 and 60 then raise exception 'Los dias del ajuste deben estar entre -60 y 60, distintos de cero';end if;
 if p_kind='Apertura' and p_days>0 then raise exception 'La apertura registra dias ya tomados: usa un valor negativo';end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo del ajuste';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||p_employee_id,0));
 select coalesce(max(period_number) filter(where is_earned),0) into earned from public.hr_vacation_periods_internal(p_employee_id);
 if p_period is null or p_period<1 or p_period>earned+1 then raise exception 'Periodo no disponible';end if;
 if p_kind='Apertura' and p_period>earned then raise exception 'La apertura solo aplica a periodos ya ganados';end if;
 if p_kind='Apertura' and exists(select 1 from public.hr_vacation_ledger where employee_id=p_employee_id and period_number=p_period and kind='Apertura') then raise exception 'El periodo ya tiene saldo de apertura; registra una correccion';end if;
 insert into public.hr_vacation_ledger(id,tenant_id,employee_id,period_number,kind,days,reason,request_id,created_by)
 values(result_id,tenant,p_employee_id,p_period,p_kind,p_days,btrim(p_reason),p_request_id,auth.uid());
 select * into p from public.hr_vacation_periods_internal(p_employee_id) x where x.period_number=p_period;
 if p.is_earned and p.available<0 then raise exception 'El periodo % quedaria con saldo negativo (% dias)',p_period,p.available;end if;
 if not p.is_earned and p_days<0 and -p.available>coalesce((select max_advance_days from public.hr_settings where tenant_id=tenant),0) then
  raise exception 'El anticipo del periodo % excede el maximo configurado',p_period;end if;
 return result_id;
end;
$$;

create function public.hr_authorize_accumulation(p_employee_id uuid,p_from_period integer,p_to_period integer,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare tenant uuid:=public.current_tenant_id(); earned integer;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if not exists(select 1 from public.hr_employees where id=p_employee_id and tenant_id=tenant) then raise exception 'Empleado no disponible' using errcode='42501';end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null or length(p_reason)>1000 then raise exception 'Indica el motivo (Art. 350: labores tecnicas, de direccion o de confianza)';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-leave:'||tenant||':'||p_employee_id,0));
 if exists(select 1 from public.hr_vacation_accumulations where employee_id=p_employee_id) then raise exception 'El empleado ya tiene su unica acumulacion autorizada (Art. 350)';end if;
 select coalesce(max(period_number) filter(where is_earned),0) into earned from public.hr_vacation_periods_internal(p_employee_id);
 if p_from_period is null or p_to_period is null or p_from_period<1 or p_to_period<p_from_period or p_to_period>p_from_period+1 then raise exception 'La acumulacion cubre uno o dos periodos consecutivos';end if;
 if p_to_period>earned then raise exception 'Solo se acumulan periodos ya ganados';end if;
 insert into public.hr_vacation_accumulations(employee_id,tenant_id,from_period,to_period,reason,created_by)
 values(p_employee_id,tenant,p_from_period,p_to_period,btrim(p_reason),auth.uid());
 return p_employee_id;
end;
$$;

-- ---------------------------------------------------------------- Configuración y consultas
create function public.hr_save_settings(p_max_advance_days integer) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_max_advance_days is null or p_max_advance_days not between 0 and 30 then raise exception 'El anticipo maximo debe estar entre 0 y 30 dias';end if;
 insert into public.hr_settings(tenant_id,max_advance_days,updated_by,updated_at) values(public.current_tenant_id(),p_max_advance_days,auth.uid(),now())
 on conflict(tenant_id) do update set max_advance_days=excluded.max_advance_days,updated_by=excluded.updated_by,updated_at=now();
end;
$$;

-- Cambiar feriados no recalcula solicitudes existentes: sus días quedan como se registraron.
create function public.hr_save_holiday(p_date date,p_name text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_date is null or nullif(btrim(coalesce(p_name,'')),'') is null or length(btrim(p_name))>120 then raise exception 'Indica fecha y nombre del feriado';end if;
 insert into public.hr_holidays(tenant_id,holiday_date,name,created_by) values(public.current_tenant_id(),p_date,btrim(p_name),auth.uid())
 on conflict(tenant_id,holiday_date) do update set name=excluded.name;
end;
$$;
create function public.hr_delete_holiday(p_date date) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 delete from public.hr_holidays where tenant_id=public.current_tenant_id() and holiday_date=p_date;
end;
$$;

create function public.hr_vacation_periods(p_employee_id uuid)
returns table(period_number integer,earned_on date,ends_on date,is_earned boolean,entitlement integer,adjustments integer,
 approved integer,pending integer,available integer,accumulated boolean,overdue_unscheduled boolean,expired_unused boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.hr_can_read_employee(p_employee_id) then raise exception 'Empleado no disponible' using errcode='42501';end if;
 return query select * from public.hr_vacation_periods_internal(p_employee_id);
end;
$$;

create function public.hr_vacation_summary()
returns table(employee_id uuid,earned_periods integer,available integer,advance_used integer,overdue_unscheduled boolean,expired_unused boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 return query select e.id,
  coalesce(max(p.period_number) filter(where p.is_earned),0)::integer,
  (coalesce(sum(p.available) filter(where p.is_earned),0)+coalesce(sum(least(p.available,0)) filter(where not p.is_earned),0))::integer,
  coalesce(sum(greatest(-p.available,0)) filter(where not p.is_earned),0)::integer,
  coalesce(bool_or(p.overdue_unscheduled),false), coalesce(bool_or(p.expired_unused),false)
 from public.hr_employees e cross join lateral public.hr_vacation_periods_internal(e.id) p
 where e.tenant_id=public.current_tenant_id() group by e.id;
end;
$$;

-- ---------------------------------------------------------------- Permisos de ejecución
revoke all on function public.hr_can_read_employee(uuid),public.hr_period_entitlement(integer,integer),public.hr_working_days(uuid,text,date,date),public.hr_working_dates(uuid,text,date,date),
 public.hr_vacation_periods_internal(uuid,date,uuid),public.hr_allocate_vacation(uuid,date,integer,uuid,integer),
 public.hr_store_allocation(public.hr_leave_requests,jsonb),
 public.hr_validate_leave(public.hr_employees,text,date,date,uuid),public.hr_preview_leave(uuid,text,date,date),
 public.hr_suspend_leave(uuid,date,text),public.hr_add_vacation_adjustment(uuid,uuid,integer,text,integer,text),
 public.hr_authorize_accumulation(uuid,integer,integer,text),public.hr_save_settings(integer),public.hr_save_holiday(date,text),
 public.hr_delete_holiday(date),public.hr_vacation_periods(uuid),public.hr_vacation_summary() from public,anon;
grant execute on function public.hr_can_read_employee(uuid),public.hr_preview_leave(uuid,text,date,date),public.hr_suspend_leave(uuid,date,text),
 public.hr_add_vacation_adjustment(uuid,uuid,integer,text,integer,text),public.hr_authorize_accumulation(uuid,integer,integer,text),
 public.hr_save_settings(integer),public.hr_save_holiday(date,text),public.hr_delete_holiday(date),
 public.hr_vacation_periods(uuid),public.hr_vacation_summary() to authenticated;

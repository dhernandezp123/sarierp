-- HR-05: calendario autorizado, historial inmutable y avisos internos transaccionales.
create table public.hr_employee_history (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 employee_id uuid not null references public.hr_employees(id), revision integer not null,
 action text not null check(action in ('Creación','Actualización')), changes jsonb not null,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 creation_txid bigint not null default txid_current(),
 unique(employee_id,revision)
);
create index hr_employee_history_employee on public.hr_employee_history(employee_id,revision desc);
alter table public.hr_employee_history enable row level security;
revoke all on public.hr_employee_history from public,anon,authenticated;
grant select on public.hr_employee_history to authenticated;
create policy hr_employee_history_admin on public.hr_employee_history for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.hr_is_manager());

create function public.hr_audit_employee_internal() returns trigger
language plpgsql security definer set search_path=public as $$
declare changes jsonb; inserted integer;
begin
 select coalesce(jsonb_object_agg(n.key,jsonb_build_object('before',case when tg_op='INSERT' then null else to_jsonb(old)->n.key end,'after',n.value)),'{}')
 into changes from jsonb_each(to_jsonb(new)) n
 where n.key not in ('id','tenant_id','revision','created_by','created_at','updated_by','updated_at')
 and (tg_op='INSERT' or n.value is distinct from to_jsonb(old)->n.key);
 if changes<>'{}'::jsonb then
  insert into public.hr_employee_history(tenant_id,employee_id,revision,action,changes,created_by)
  values(new.tenant_id,new.id,new.revision,case when tg_op='INSERT' then 'Creación' else 'Actualización' end,changes,auth.uid())
  -- hr_save_employee completa la ficha recién insertada con un UPDATE de revisión 1.
  -- Se consolida únicamente esa creación dentro de la misma transacción, nunca historia confirmada.
  on conflict(employee_id,revision) do update set changes=(
    select jsonb_object_agg(v.key,jsonb_build_object('before',null,'after',v.value->'after'))
    from jsonb_each(hr_employee_history.changes||excluded.changes)v)
  where hr_employee_history.action='Creación' and excluded.revision=1 and hr_employee_history.creation_txid=txid_current();
  get diagnostics inserted=row_count;
  if inserted<>1 then raise exception 'Historial de ficha desincronizado';end if;
 end if;
 return new;
end $$;
revoke all on function public.hr_audit_employee_internal() from public,anon,authenticated;
create trigger hr_audit_employee after insert or update on public.hr_employees
 for each row execute function public.hr_audit_employee_internal();

-- No se permite a clientes insertar avisos arbitrarios ni consultar destinatarios.
create table public.hr_notice_deliveries (
 tenant_id uuid not null references public.tenants(id), request_id uuid not null references public.hr_leave_requests(id),
 event_key text not null, user_id uuid not null references public.profiles(id),
 notification_id uuid references public.notifications(id) on delete set null,
 created_at timestamptz not null default now(), primary key(tenant_id,request_id,event_key,user_id)
);
alter table public.hr_notice_deliveries enable row level security;
revoke all on public.hr_notice_deliveries from public,anon,authenticated;
grant select on public.hr_notice_deliveries to authenticated;
create policy hr_notice_own on public.hr_notice_deliveries for select to authenticated
 using(tenant_id=public.current_tenant_id() and user_id=auth.uid() and public.hr_is_internal_user());

create function public.hr_notify_leave_internal() returns trigger
language plpgsql security definer set search_path=public as $$
declare event text; title text; employee public.hr_employees%rowtype; recipient uuid; inserted integer; notification uuid;
begin
 if tg_op='INSERT' then event:='requested';title:='Nueva solicitud de RRHH';
 elsif old.status is distinct from new.status then event:='status:'||new.status;title:='Solicitud de RRHH '||lower(new.status);
 elsif old.suspended_at is distinct from new.suspended_at and new.suspended_at is not null then
  event:='suspended:'||new.suspended_at::text;title:='Vacaciones suspendidas';
 else return new;end if;
 select * into employee from public.hr_employees where id=new.employee_id and tenant_id=new.tenant_id;
 for recipient in
  select p.id from public.profiles p where p.tenant_id=new.tenant_id and p.status='Aprobado' and p.is_active and p.rol<>'Cliente'
   and (p.rol='Admin' or (event<>'requested' and p.id=employee.profile_id))
 loop
  insert into public.hr_notice_deliveries(tenant_id,request_id,event_key,user_id)
  values(new.tenant_id,new.id,event,recipient) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 then
   insert into public.notifications(tenant_id,user_id,title,message,type)
   values(new.tenant_id,recipient,title,employee.employee_code||' · '||new.leave_type||' · '||to_char(new.start_date,'DD/MM/YYYY')||' - '||to_char(new.end_date,'DD/MM/YYYY'),'info')
   returning id into notification;
   update public.hr_notice_deliveries set notification_id=notification
    where tenant_id=new.tenant_id and request_id=new.id and event_key=event and user_id=recipient;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.hr_notify_leave_internal() from public,anon,authenticated;
create trigger hr_notify_leave after insert or update on public.hr_leave_requests
 for each row execute function public.hr_notify_leave_internal();

create function public.hr_absence_calendar(p_start date,p_end date,p_employee_id uuid default null)
returns table(request_id uuid,employee_id uuid,employee_code text,employee_name text,leave_type text,start_date date,end_date date,business_days integer)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.hr_is_internal_user() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Selecciona hasta un año de calendario';end if;
 if p_employee_id is not null and not public.hr_can_read_employee(p_employee_id) then raise exception 'Empleado no disponible' using errcode='42501';end if;
 return query select r.id,e.id,e.employee_code,btrim(e.first_name||' '||e.last_name),r.leave_type,r.start_date,r.end_date,r.business_days::integer
 from public.hr_leave_requests r join public.hr_employees e on e.id=r.employee_id and e.tenant_id=r.tenant_id
 where r.tenant_id=public.current_tenant_id() and r.status='Aprobada' and r.start_date<=p_end and r.end_date>=p_start
  and (p_employee_id is null or e.id=p_employee_id)
  and (public.hr_is_manager() or (public.hr_is_internal_user() and e.profile_id=auth.uid()))
 order by r.start_date,e.id,r.id;
end $$;
revoke all on function public.hr_absence_calendar(date,date,uuid) from public,anon,authenticated;
grant execute on function public.hr_absence_calendar(date,date,uuid) to authenticated;

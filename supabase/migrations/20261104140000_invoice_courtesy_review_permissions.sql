-- GOV-COURTESY-01: autoridad para revisar cada cortesia; no modifica facturas.
create table public.invoice_courtesy_approvers (
  tenant_id uuid not null references public.tenants(id),
  profile_id uuid not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  assignment_source text not null default 'Admin' check (assignment_source in ('Admin','Despliegue autorizado')),
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  primary key (tenant_id,profile_id),
  foreign key (tenant_id,profile_id) references public.profiles(tenant_id,id),
  foreign key (tenant_id,assigned_by) references public.profiles(tenant_id,id),
  check (assigned_by is not null or assignment_source='Despliegue autorizado')
);
create table public.invoice_courtesy_permission_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  profile_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('Otorgado','Revocado')),
  reason text not null check (length(btrim(reason)) between 5 and 1000),
  source text not null check (source in ('Admin','Despliegue autorizado')),
  created_at timestamptz not null default now(),
  foreign key (tenant_id,profile_id) references public.profiles(tenant_id,id),
  foreign key (tenant_id,actor_id) references public.profiles(tenant_id,id),
  check (actor_id is not null or source='Despliegue autorizado')
);
create index invoice_courtesy_events_tenant_date on public.invoice_courtesy_permission_events(tenant_id,created_at desc,id);

alter table public.invoice_courtesy_approvers enable row level security;
alter table public.invoice_courtesy_permission_events enable row level security;
revoke all on public.invoice_courtesy_approvers,public.invoice_courtesy_permission_events from public,anon,authenticated;
grant select on public.invoice_courtesy_approvers,public.invoice_courtesy_permission_events to authenticated;
create policy courtesy_approvers_read on public.invoice_courtesy_approvers for select to authenticated
using (tenant_id=public.current_tenant_id() and public.is_approved_active_user() and public.can_manage_finance());
create policy courtesy_events_read on public.invoice_courtesy_permission_events for select to authenticated
using (tenant_id=public.current_tenant_id() and public.is_approved_active_user() and public.can_manage_finance());

create function public.can_approve_invoice_courtesy() returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(public.is_approved_active_user() and exists (
   select 1 from public.profiles p
   where p.id=auth.uid() and p.tenant_id=public.current_tenant_id()
     and p.status='Aprobado' and p.is_active
     and p.rol::text in ('Admin','Contabilidad','Finanzas','Operaciones','Pricing','Ventas')
     and (exists(select 1 from public.invoice_courtesy_approvers a where a.tenant_id=p.tenant_id and a.profile_id=p.id)
       or (p.rol::text in ('Admin','Contabilidad') and exists (
         select 1 from public.invoice_master_settings m where m.tenant_id=p.tenant_id and m.profile_id=p.id)))
 ),false);
$$;

create function public.list_invoice_courtesy_approvers()
returns table(profile_id uuid,display_name text,role_name text,active boolean,approved boolean,explicit_permission boolean,designated_master boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_approved_active_user() or not public.can_manage_finance() or public.current_tenant_id() is null then
   raise exception 'Sin permiso para consultar autorizadores de cortesias' using errcode='42501';
 end if;
 return query select p.id,coalesce(nullif(btrim(concat_ws(' ',p.nombre,p.apellido)),''),'Usuario')::text,
   p.rol::text,p.is_active,p.status='Aprobado',a.profile_id is not null,
   (m.profile_id is not null and p.rol::text in ('Admin','Contabilidad'))
 from public.profiles p
 left join public.invoice_courtesy_approvers a on a.tenant_id=p.tenant_id and a.profile_id=p.id
 left join public.invoice_master_settings m on m.tenant_id=p.tenant_id and m.profile_id=p.id
 where p.tenant_id=public.current_tenant_id() and (a.profile_id is not null or m.profile_id is not null)
 order by 2,p.id;
end;
$$;

create function public.set_invoice_courtesy_approver(p_profile_id uuid,p_enabled boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_tenant uuid:=public.current_tenant_id(); changed integer;
begin
 if v_tenant is null or not public.is_approved_active_user() or not public.is_role(array['Admin']) then
   raise exception 'Solo Administracion puede designar autorizadores de cortesias' using errcode='42501';
 end if;
 if p_profile_id is null or p_enabled is null or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
   raise exception 'Indica el usuario y un motivo de 5 a 1000 caracteres';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-courtesy:'||v_tenant||':'||p_profile_id,0));
 if not exists(select 1 from public.profiles p where p.id=p_profile_id and p.tenant_id=v_tenant
   and (not p_enabled or (p.status='Aprobado' and p.is_active
     and p.rol::text in ('Admin','Contabilidad','Finanzas','Operaciones','Pricing','Ventas')))) then
   raise exception 'Selecciona un usuario interno aprobado y activo de esta empresa';
 end if;
 if p_enabled then
   insert into public.invoice_courtesy_approvers(tenant_id,profile_id,assigned_by,reason)
   values(v_tenant,p_profile_id,auth.uid(),btrim(p_reason)) on conflict do nothing;
 else
   delete from public.invoice_courtesy_approvers where tenant_id=v_tenant and profile_id=p_profile_id;
 end if;
 get diagnostics changed=row_count;
 if changed>0 then
   insert into public.invoice_courtesy_permission_events(tenant_id,profile_id,actor_id,action,reason,source)
   values(v_tenant,p_profile_id,auth.uid(),case when p_enabled then 'Otorgado' else 'Revocado' end,btrim(p_reason),'Admin');
 end if;
end;
$$;

revoke all on function public.can_approve_invoice_courtesy(),public.list_invoice_courtesy_approvers(),public.set_invoice_courtesy_approver(uuid,boolean,text) from public,anon;
grant execute on function public.can_approve_invoice_courtesy(),public.list_invoice_courtesy_approvers(),public.set_invoice_courtesy_approver(uuid,boolean,text) to authenticated;
comment on function public.can_approve_invoice_courtesy() is 'Designacion explicita o master contable actual del tenant, activo y aprobado. No concede borrado de lineas ni altera emision.';
notify pgrst,'reload schema';

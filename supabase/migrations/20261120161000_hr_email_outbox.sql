-- HR-07: avisos mínimos, cola transaccional y entrega exclusiva del servidor.
alter table public.hr_settings add column email_enabled boolean not null default true;
create function public.hr_save_email_settings(p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 if p_enabled is null then raise exception 'Indica si deseas enviar correo';end if;
 insert into public.hr_settings(tenant_id,email_enabled,updated_by,updated_at)
 values(public.current_tenant_id(),p_enabled,auth.uid(),now())
 on conflict(tenant_id) do update set email_enabled=excluded.email_enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;
revoke all on function public.hr_save_email_settings(boolean) from public,anon,authenticated;
grant execute on function public.hr_save_email_settings(boolean) to authenticated;

create table public.hr_email_outbox (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 request_id uuid not null references public.hr_leave_requests(id),event_key text not null,user_id uuid not null references public.profiles(id),
 recipient_email text not null,status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped','uncertain')),
 attempts integer not null default 0 check(attempts>=0),resend_message_id text,request_body text,provider_key text,provider_credential_hash text,
 first_attempt_at timestamptz,lease_token uuid,retry_authorized boolean not null default false,error_message text,sent_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,request_id,event_key,user_id),
 foreign key(tenant_id,request_id,event_key,user_id) references public.hr_notice_deliveries(tenant_id,request_id,event_key,user_id)
);
alter table public.hr_email_outbox enable row level security;
revoke all on public.hr_email_outbox from public,anon,authenticated;
grant select,insert,update on public.hr_email_outbox to service_role;
create index hr_email_outbox_queue on public.hr_email_outbox(created_at,id) where status='pending' and attempts=0;

create function public.hr_queue_email_internal() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.notification_id is null and new.notification_id is not null
 and coalesce((select email_enabled from public.hr_settings where tenant_id=new.tenant_id),true) then
  insert into public.hr_email_outbox(tenant_id,request_id,event_key,user_id,recipient_email)
  select new.tenant_id,new.request_id,new.event_key,p.id,btrim(p.email) from public.profiles p
  where p.id=new.user_id and p.tenant_id=new.tenant_id and p.is_active and p.status='Aprobado'
   and p.rol<>'Cliente' and btrim(p.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.hr_queue_email_internal() from public,anon,authenticated;
create trigger hr_queue_email after update of notification_id on public.hr_notice_deliveries
 for each row execute function public.hr_queue_email_internal();

create function public.get_hr_email_dispatch(p_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'recipient_email',o.recipient_email,'origin','https://'||d.hostname)
 from public.hr_email_outbox o join public.profiles p on p.id=o.user_id and p.tenant_id=o.tenant_id
 join public.tenants t on t.id=o.tenant_id and t.status='Activo'
 join public.tenant_domains d on d.tenant_id=o.tenant_id and d.is_primary and d.is_active
 where o.id=p_id and p.is_active and p.status='Aprobado' and p.rol<>'Cliente' and btrim(p.email)=o.recipient_email
 and coalesce((select email_enabled from public.hr_settings where tenant_id=o.tenant_id),true)
$$;
revoke all on function public.get_hr_email_dispatch(uuid) from public,anon,authenticated;
grant execute on function public.get_hr_email_dispatch(uuid) to service_role;

create function public.hr_email_status() returns table(request_id uuid,event_key text,status text,attempts integer,sent_at timestamptz)
language sql stable security definer set search_path=public as $$
 select o.request_id,o.event_key,case when o.status='processing' and o.updated_at<now()-interval '2 minutes' then 'uncertain' else o.status end,o.attempts,o.sent_at from public.hr_email_outbox o
 where o.tenant_id=public.current_tenant_id() and o.user_id=auth.uid() and public.hr_is_internal_user()
 order by o.created_at desc,o.id limit 100
$$;
revoke all on function public.hr_email_status() from public,anon,authenticated;
grant execute on function public.hr_email_status() to authenticated;

-- Opt-in per tenant; Sari is the only provisioned integration in this release.
create function public.mail_intake_is_demo() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare result boolean := false;
begin
  if to_regprocedure('public.is_demo_environment()') is not null then
    execute 'select public.is_demo_environment()' into result;
  end if;
  return coalesce(result, false);
end $$;
revoke all on function public.mail_intake_is_demo() from public,anon,authenticated;
grant execute on function public.mail_intake_is_demo() to service_role;
create table public.mail_intake_settings (
  tenant_id uuid primary key references public.tenants(id),
  mailbox text not null,
  enabled boolean not null default false,
  default_seller_id uuid,
  use_client_seller boolean not null default true,
  starts_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, default_seller_id) references public.profiles(tenant_id, id),
  check (mailbox = lower(mailbox)),
  check (not enabled or (default_seller_id is not null and starts_at is not null))
);
create table public.mail_intake_runtime (
  tenant_id uuid primary key references public.mail_intake_settings(tenant_id),
  cursor text,
  lock_token uuid,
  locked_until timestamptz,
  last_run_at timestamptz
);
create table public.mail_intake_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.mail_intake_settings(tenant_id),
  message_id text not null,
  conversation_id text,
  sender text not null,
  subject text not null,
  received_at timestamptz not null,
  status text not null check (status in ('ignored','review','ready','sending','accepted','uncertain')),
  quotation_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, message_id),
  foreign key (tenant_id, quotation_id) references public.quotations(tenant_id, id)
);
alter table public.mail_intake_settings enable row level security;
alter table public.mail_intake_runtime enable row level security;
alter table public.mail_intake_messages enable row level security;
revoke all on public.mail_intake_settings, public.mail_intake_runtime, public.mail_intake_messages from anon, authenticated;
grant select on public.mail_intake_settings, public.mail_intake_messages to authenticated;
grant update (enabled, default_seller_id, use_client_seller) on public.mail_intake_settings to authenticated;
grant all on public.mail_intake_settings, public.mail_intake_runtime, public.mail_intake_messages to service_role;
create policy mail_intake_admin_read on public.mail_intake_settings for select to authenticated
using (tenant_id = public.current_tenant_id() and public.is_approved_active_user() and public.is_admin());
create policy mail_intake_admin_update on public.mail_intake_settings for update to authenticated
using (tenant_id = public.current_tenant_id() and public.is_approved_active_user() and public.is_admin())
with check (tenant_id = public.current_tenant_id() and public.is_approved_active_user() and public.is_admin());
create policy mail_intake_admin_messages on public.mail_intake_messages for select to authenticated
using (tenant_id = public.current_tenant_id() and public.is_approved_active_user() and public.is_admin());

create function public.validate_mail_intake_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id
    where d.tenant_id=new.tenant_id and d.hostname='sari.forwarders.app' and d.is_active and t.status='Activo')
    or new.mailbox <> 'pricing@sarihn.com' then
    raise exception 'Integracion disponible solamente para Sari';
  end if;
  if new.default_seller_id is not null and not exists (select 1 from public.profiles p
    where p.id=new.default_seller_id and p.tenant_id=new.tenant_id and p.rol in ('Admin','Ventas')
      and p.status='Aprobado' and p.is_active) then
    raise exception 'Seleccione un vendedor activo de esta empresa';
  end if;
  if new.enabled and public.mail_intake_is_demo() then
    raise exception 'Integracion bloqueada en Demo';
  end if;
  if TG_OP='UPDATE' then
    -- Do not replay historical mail after pause/resume.
    if new.enabled and not old.enabled then new.starts_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger validate_mail_intake_settings before insert or update on public.mail_intake_settings
for each row execute function public.validate_mail_intake_settings();
revoke all on function public.validate_mail_intake_settings() from public, anon, authenticated;

insert into public.mail_intake_settings(tenant_id, mailbox, default_seller_id)
select d.tenant_id, 'pricing@sarihn.com',
  (select p.id from public.profiles p where p.tenant_id=d.tenant_id and p.rol in ('Admin','Ventas')
    and p.status='Aprobado' and p.is_active and lower(trim(p.nombre))='admin'
    and lower(trim(p.apellido))='pruebas' order by p.id limit 1)
from public.tenant_domains d where d.hostname='sari.forwarders.app' and d.is_active;
insert into public.mail_intake_runtime(tenant_id) select tenant_id from public.mail_intake_settings;

-- One transaction deduplicates the message and creates its draft using the existing numbering trigger.
create function public.register_mail_intake_message(p_tenant_id uuid, p_message jsonb, p_decision text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cfg public.mail_intake_settings;
  msg_id uuid;
  seller uuid;
  client_id uuid;
  client_seller uuid;
  quote_id uuid;
  sender_email text := lower(trim(p_message->>'sender'));
begin
  select * into cfg from public.mail_intake_settings where tenant_id=p_tenant_id for update;
  if not found or not cfg.enabled or cfg.mailbox <> 'pricing@sarihn.com'
    or not exists (select 1 from public.tenant_domains d join public.tenants t on t.id=d.tenant_id
      where d.tenant_id=p_tenant_id and d.hostname='sari.forwarders.app' and d.is_active and t.status='Activo')
    or public.mail_intake_is_demo() then
    raise exception 'Integracion no habilitada';
  end if;
  if (p_message->>'received_at')::timestamptz < cfg.starts_at then return null; end if;
  if p_decision not in ('ignored','review','request') or nullif(p_message->>'message_id','') is null
    or sender_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Mensaje invalido'; end if;
  insert into public.mail_intake_messages(tenant_id,message_id,conversation_id,sender,subject,received_at,status)
  values(p_tenant_id,p_message->>'message_id',p_message->>'conversation_id',sender_email,
    left(coalesce(p_message->>'subject',''),1000),(p_message->>'received_at')::timestamptz,
    case when p_decision='request' then 'ready' else p_decision end)
  on conflict(tenant_id,message_id) do nothing returning id into msg_id;
  if msg_id is null then
    select id into msg_id from public.mail_intake_messages where tenant_id=p_tenant_id and message_id=p_message->>'message_id';
    return msg_id;
  end if;
  if p_decision <> 'request' then return msg_id; end if;
  -- An existing conversation is reviewed instead of creating another quote.
  if nullif(p_message->>'conversation_id','') is not null and exists (
    select 1 from public.mail_intake_messages where tenant_id=p_tenant_id and id<>msg_id
      and conversation_id=p_message->>'conversation_id' and quotation_id is not null) then
    update public.mail_intake_messages set status='review' where id=msg_id;
    return msg_id;
  end if;
  select c.id,c.vendedor_asignado into client_id,client_seller from public.clientes c
    where c.tenant_id=p_tenant_id and c.deleted_at is null and sender_email in (lower(trim(c.email_1)),lower(trim(c.email_2)),lower(trim(c.email_3)))
    and (select count(*) from public.clientes c2 where c2.tenant_id=p_tenant_id
      and c2.deleted_at is null and sender_email in (lower(trim(c2.email_1)),lower(trim(c2.email_2)),lower(trim(c2.email_3))))=1;
  seller := cfg.default_seller_id;
  if cfg.use_client_seller and exists (select 1 from public.profiles p where p.id=client_seller
    and p.tenant_id=p_tenant_id and p.rol in ('Admin','Ventas') and p.status='Aprobado' and p.is_active) then seller:=client_seller; end if;
  if not exists(select 1 from public.profiles p where p.id=seller and p.tenant_id=p_tenant_id
    and p.rol in ('Admin','Ventas') and p.status='Aprobado' and p.is_active) then raise exception 'Vendedor no disponible'; end if;
  insert into public.quotations(tenant_id,created_by,assigned_to,cliente_id,status,quote_type,contact_email,contact_name,pricing_notes)
  values(p_tenant_id,seller,seller,client_id,'Borrador',null,sender_email,left(p_message->>'sender_name',200),
    'Solicitud recibida por Outlook. Datos de servicio y carga pendientes de completar.' || E'\n'
    || left(coalesce(p_message->>'subject',''),1000) || E'\n' || left(coalesce(p_message->>'body',''),12000))
  returning id into quote_id;
  update public.mail_intake_messages set quotation_id=quote_id where id=msg_id;
  return msg_id;
end $$;
revoke all on function public.register_mail_intake_message(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.register_mail_intake_message(uuid,jsonb,text) to service_role;

-- Mesa de ayuda técnica por instalación.
-- Los usuarios Cliente del portal quedan fuera: este canal conecta al personal
-- interno de la empresa licenciataria con el soporte de Hernova Systems.

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

comment on column public.profiles.is_platform_admin is
  'Acceso reservado a Hernova Systems para administrar soporte técnico.';

create or replace function public.prevent_platform_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.is_platform_admin is true then
      raise exception 'El acceso de Administrador Supremo solo se configura mediante una operación confiable'
        using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
      and new.is_platform_admin is distinct from old.is_platform_admin
    then
      raise exception 'El acceso de Administrador Supremo solo se configura mediante una operación confiable'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_platform_admin_change_trigger on public.profiles;
create trigger prevent_platform_admin_change_trigger
before insert or update on public.profiles
for each row execute function public.prevent_platform_admin_change();

create or replace function public.is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_demo_environment boolean := false;
begin
  -- La rama Demo define este helper antes de esta migración. Producción no lo
  -- necesita, por eso se resuelve dinámicamente sólo cuando existe.
  if to_regprocedure('public.is_demo_environment()') is not null then
    execute 'select public.is_demo_environment()'
      into v_is_demo_environment;
  end if;

  if coalesce(v_is_demo_environment, false) then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_platform_admin is true
      and p.status = 'Aprobado'
      and p.is_active is true
      and p.rol <> 'Cliente'::public.user_role
      -- `is_demo_user` sólo existe en la rama Demo. Convertir la fila a JSON
      -- permite conservar el guard sin romper la migración de Producción.
      and coalesce((to_jsonb(p) ->> 'is_demo_user')::boolean, false) is false
  );
end;
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create table if not exists public.support_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  ticket_prefix text not null default 'SUP'
    check (ticket_prefix ~ '^[A-Z0-9]{2,8}$'),
  support_email text not null default 'soporte@forwarders.app'
    check (support_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.support_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  subject text not null check (char_length(subject) between 5 and 160),
  category text not null check (
    category in ('Error del sistema', 'Consulta', 'Configuración', 'Capacitación', 'Solicitud de cambio', 'Mejora')
  ),
  priority text not null default 'Normal'
    check (priority in ('Crítica', 'Alta', 'Normal')),
  status text not null default 'Nuevo'
    check (status in ('Nuevo', 'En revisión', 'Esperando al cliente', 'En desarrollo', 'Resuelto', 'Cerrado')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  source_path text check (source_path is null or char_length(source_path) <= 500),
  source_module text check (source_module is null or char_length(source_module) <= 80),
  browser_info text check (browser_info is null or char_length(browser_info) <= 500),
  last_activity_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 10000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null check (char_length(file_name) between 1 and 180),
  file_path text not null unique check (char_length(file_path) between 1 and 700),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.support_ticket_events (
  id bigint generated by default as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (
    event_type in ('created', 'message_added', 'status_changed', 'priority_changed', 'assignment_changed', 'reopened')
  ),
  from_value text,
  to_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete cascade,
  event_type text not null,
  recipient_email text not null,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  resend_message_id text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_activity_idx
  on public.support_tickets (status, last_activity_at desc);
create index if not exists support_tickets_created_by_idx
  on public.support_tickets (created_by, created_at desc);
create index if not exists support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at);
create index if not exists support_ticket_attachments_ticket_idx
  on public.support_ticket_attachments (ticket_id, created_at);
create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events (ticket_id, created_at);
create index if not exists support_notification_outbox_pending_idx
  on public.support_notification_outbox (status, created_at)
  where status in ('pending', 'failed');

create or replace function public.can_view_support_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_active_user()
    and exists (
      select 1
      from public.support_tickets t
      where t.id = p_ticket_id
    )
$$;

create or replace function public.can_view_support_attachment_path(p_file_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.support_ticket_attachments a
    left join public.support_ticket_messages m on m.id = a.message_id
    where a.file_path = p_file_path
      and public.can_view_support_ticket(a.ticket_id)
      and (coalesce(m.is_internal, false) is false or public.is_platform_admin())
  )
$$;

revoke all on function public.can_view_support_ticket(uuid) from public, anon;
revoke all on function public.can_view_support_attachment_path(text) from public, anon;
grant execute on function public.can_view_support_ticket(uuid) to authenticated;
grant execute on function public.can_view_support_attachment_path(text) to authenticated;

create or replace function public.create_support_ticket(
  p_subject text,
  p_description text,
  p_category text default 'Consulta',
  p_priority text default 'Normal',
  p_source_path text default null,
  p_source_module text default null,
  p_browser_info text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
  v_message_id uuid;
  v_prefix text;
  v_ticket_number text;
begin
  if auth.uid() is null or not public.is_approved_active_user() then
    raise exception 'No autorizado para crear tickets de soporte'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.support_settings s
    where s.singleton is true and s.enabled is true
  ) then
    raise exception 'La mesa de ayuda no está habilitada en esta instalación';
  end if;

  if char_length(trim(coalesce(p_subject, ''))) not between 5 and 160 then
    raise exception 'El asunto debe contener entre 5 y 160 caracteres';
  end if;
  if char_length(trim(coalesce(p_description, ''))) not between 10 and 10000 then
    raise exception 'La descripción debe contener entre 10 y 10000 caracteres';
  end if;
  if p_category is null or p_category not in (
    'Error del sistema', 'Consulta', 'Configuración', 'Capacitación', 'Solicitud de cambio', 'Mejora'
  ) then
    raise exception 'Categoría de ticket inválida';
  end if;
  if p_priority is null or p_priority not in ('Crítica', 'Alta', 'Normal') then
    raise exception 'Prioridad de ticket inválida';
  end if;
  if p_source_path is not null and char_length(p_source_path) > 500 then
    raise exception 'La ruta de origen es demasiado extensa';
  end if;
  if p_source_module is not null and char_length(p_source_module) > 80 then
    raise exception 'El módulo de origen es demasiado extenso';
  end if;
  if p_browser_info is not null and char_length(p_browser_info) > 500 then
    raise exception 'La información del navegador es demasiado extensa';
  end if;

  select s.ticket_prefix into v_prefix
  from public.support_settings s
  where s.singleton is true;

  v_ticket_number := v_prefix || '-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');

  insert into public.support_tickets (
    ticket_number, subject, category, priority, created_by,
    source_path, source_module, browser_info
  ) values (
    v_ticket_number,
    trim(p_subject),
    p_category,
    p_priority,
    auth.uid(),
    nullif(trim(p_source_path), ''),
    nullif(trim(p_source_module), ''),
    nullif(trim(p_browser_info), '')
  )
  returning id into v_ticket_id;

  insert into public.support_ticket_messages (ticket_id, author_id, body)
  values (v_ticket_id, auth.uid(), trim(p_description))
  returning id into v_message_id;

  insert into public.support_ticket_events (
    ticket_id, actor_id, event_type, metadata
  ) values (
    v_ticket_id,
    auth.uid(),
    'created',
    jsonb_build_object('message_id', v_message_id)
  );

  return v_ticket_id;
end;
$$;

create or replace function public.add_support_ticket_message(
  p_ticket_id uuid,
  p_body text,
  p_is_internal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
  v_status text;
  v_platform_admin boolean;
begin
  if auth.uid() is null or not public.can_view_support_ticket(p_ticket_id) then
    raise exception 'No autorizado para responder este ticket'
      using errcode = '42501';
  end if;

  v_platform_admin := public.is_platform_admin();
  if coalesce(p_is_internal, false) and not v_platform_admin then
    raise exception 'Solo soporte puede crear notas internas'
      using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 10000 then
    raise exception 'El mensaje debe contener entre 1 y 10000 caracteres';
  end if;

  select t.status into v_status
  from public.support_tickets t
  where t.id = p_ticket_id
  for update;

  if v_status = 'Cerrado' then
    raise exception 'El ticket está cerrado y no admite nuevas respuestas';
  end if;

  insert into public.support_ticket_messages (
    ticket_id, author_id, body, is_internal
  ) values (
    p_ticket_id, auth.uid(), trim(p_body), coalesce(p_is_internal, false)
  ) returning id into v_message_id;

  if v_status = 'Resuelto' and not v_platform_admin then
    update public.support_tickets
    set status = 'En revisión',
        resolved_at = null,
        last_activity_at = now(),
        updated_at = now()
    where id = p_ticket_id;

    insert into public.support_ticket_events (
      ticket_id, actor_id, event_type, from_value, to_value
    ) values (
      p_ticket_id, auth.uid(), 'reopened', 'Resuelto', 'En revisión'
    );
  else
    update public.support_tickets
    set last_activity_at = now(),
        first_response_at = case
          when v_platform_admin and not coalesce(p_is_internal, false)
            then coalesce(first_response_at, now())
          else first_response_at
        end,
        updated_at = now()
    where id = p_ticket_id;
  end if;

  insert into public.support_ticket_events (
    ticket_id, actor_id, event_type, metadata
  ) values (
    p_ticket_id,
    auth.uid(),
    'message_added',
    jsonb_build_object('message_id', v_message_id, 'internal', coalesce(p_is_internal, false))
  );

  return v_message_id;
end;
$$;

create or replace function public.manage_support_ticket(
  p_ticket_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assigned_to uuid default null,
  p_clear_assignee boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets%rowtype;
  v_next_assignee uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Solo el Administrador Supremo puede administrar tickets'
      using errcode = '42501';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  if p_status is not null and p_status not in (
    'Nuevo', 'En revisión', 'Esperando al cliente', 'En desarrollo', 'Resuelto', 'Cerrado'
  ) then
    raise exception 'Estado de ticket inválido';
  end if;
  if p_priority is not null and p_priority not in ('Crítica', 'Alta', 'Normal') then
    raise exception 'Prioridad de ticket inválida';
  end if;
  if p_clear_assignee and p_assigned_to is not null then
    raise exception 'No se puede asignar y desasignar simultáneamente';
  end if;

  v_next_assignee := case
    when p_clear_assignee then null
    when p_assigned_to is not null then p_assigned_to
    else v_ticket.assigned_to
  end;

  if v_next_assignee is not null and not exists (
    select 1
    from public.profiles p
    where p.id = v_next_assignee
      and p.is_platform_admin is true
      and p.status = 'Aprobado'
      and p.is_active is true
      and p.rol <> 'Cliente'::public.user_role
  ) then
    raise exception 'El responsable debe ser un Administrador Supremo activo';
  end if;

  update public.support_tickets
  set status = coalesce(p_status, status),
      priority = coalesce(p_priority, priority),
      assigned_to = v_next_assignee,
      resolved_at = case
        when p_status = 'Resuelto' then coalesce(resolved_at, now())
        when p_status is not null and p_status <> 'Resuelto' then null
        else resolved_at
      end,
      closed_at = case
        when p_status = 'Cerrado' then coalesce(closed_at, now())
        when p_status is not null and p_status <> 'Cerrado' then null
        else closed_at
      end,
      last_activity_at = now(),
      updated_at = now()
  where id = p_ticket_id;

  if p_status is not null and p_status is distinct from v_ticket.status then
    insert into public.support_ticket_events (
      ticket_id, actor_id, event_type, from_value, to_value
    ) values (
      p_ticket_id, auth.uid(), 'status_changed', v_ticket.status, p_status
    );
  end if;

  if p_priority is not null and p_priority is distinct from v_ticket.priority then
    insert into public.support_ticket_events (
      ticket_id, actor_id, event_type, from_value, to_value
    ) values (
      p_ticket_id, auth.uid(), 'priority_changed', v_ticket.priority, p_priority
    );
  end if;

  if v_next_assignee is distinct from v_ticket.assigned_to then
    insert into public.support_ticket_events (
      ticket_id, actor_id, event_type, from_value, to_value
    ) values (
      p_ticket_id,
      auth.uid(),
      'assignment_changed',
      v_ticket.assigned_to::text,
      v_next_assignee::text
    );
  end if;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, text, text, text, text)
  from public, anon;
revoke all on function public.add_support_ticket_message(uuid, text, boolean)
  from public, anon;
revoke all on function public.manage_support_ticket(uuid, text, text, uuid, boolean)
  from public, anon;
grant execute on function public.create_support_ticket(text, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.add_support_ticket_message(uuid, text, boolean)
  to authenticated;
grant execute on function public.manage_support_ticket(uuid, text, text, uuid, boolean)
  to authenticated;

alter table public.support_settings enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;
alter table public.support_ticket_events enable row level security;
alter table public.support_notification_outbox enable row level security;

create policy support_settings_select_internal
on public.support_settings for select to authenticated
using (public.is_approved_active_user());

create policy support_settings_update_platform
on public.support_settings for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy support_tickets_select_internal
on public.support_tickets for select to authenticated
using (public.can_view_support_ticket(id));

create policy support_messages_select_authorized
on public.support_ticket_messages for select to authenticated
using (
  public.can_view_support_ticket(ticket_id)
  and (is_internal is false or public.is_platform_admin())
);

create policy support_attachments_select_authorized
on public.support_ticket_attachments for select to authenticated
using (
  public.can_view_support_ticket(ticket_id)
  and (
    message_id is null
    or exists (
      select 1
      from public.support_ticket_messages m
      where m.id = support_ticket_attachments.message_id
        and m.ticket_id = support_ticket_attachments.ticket_id
        and (m.is_internal is false or public.is_platform_admin())
    )
  )
);

create policy support_attachments_insert_authorized
on public.support_ticket_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_view_support_ticket(ticket_id)
  and split_part(file_path, '/', 1) = ticket_id::text
  and split_part(file_path, '/', 2) = auth.uid()::text
  and (
    message_id is null
    or exists (
      select 1
      from public.support_ticket_messages m
      where m.id = support_ticket_attachments.message_id
        and m.ticket_id = support_ticket_attachments.ticket_id
        and m.author_id = auth.uid()
    )
  )
);

create policy support_attachments_delete_authorized
on public.support_ticket_attachments for delete to authenticated
using (uploaded_by = auth.uid() or public.is_platform_admin());

create policy support_events_select_internal
on public.support_ticket_events for select to authenticated
using (public.can_view_support_ticket(ticket_id));

create policy support_outbox_select_platform
on public.support_notification_outbox for select to authenticated
using (public.is_platform_admin());

revoke all on table public.support_settings from anon, authenticated;
revoke all on table public.support_tickets from anon, authenticated;
revoke all on table public.support_ticket_messages from anon, authenticated;
revoke all on table public.support_ticket_attachments from anon, authenticated;
revoke all on table public.support_ticket_events from anon, authenticated;
revoke all on table public.support_notification_outbox from anon, authenticated;
revoke all on sequence public.support_ticket_number_seq from anon, authenticated;

grant select on table public.support_settings to authenticated;
grant select on table public.support_tickets to authenticated;
grant select on table public.support_ticket_messages to authenticated;
grant select, insert, delete on table public.support_ticket_attachments to authenticated;
grant select on table public.support_ticket_events to authenticated;
grant select on table public.support_notification_outbox to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists support_attachments_storage_select on storage.objects;
create policy support_attachments_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'support-attachments'
  and public.can_view_support_attachment_path(name)
);

drop policy if exists support_attachments_storage_insert on storage.objects;
create policy support_attachments_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'support-attachments'
  and public.is_approved_active_user()
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.support_tickets t
    where t.id::text = (storage.foldername(name))[1]
      and public.can_view_support_ticket(t.id)
  )
);

drop policy if exists support_attachments_storage_delete on storage.objects;
create policy support_attachments_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'support-attachments'
  and exists (
    select 1
    from public.support_ticket_attachments a
    where a.file_path = name
      and (a.uploaded_by = auth.uid() or public.is_platform_admin())
  )
);

-- Fase 1: permisos de perfiles y canales de notificación.

-- Directorio interno: cada usuario ve su perfil; Admin ve todos; el resto del
-- personal aprobado ve únicamente perfiles internos aprobados.
drop policy if exists "Profiles select policy" on public.profiles;
create policy "profiles_select_authorized"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.is_approved_active_user()
    and status = 'Aprobado'
    and is_active = true
    and rol <> 'Cliente'::public.user_role
  )
);

-- Las notificaciones internas se crean mediante una RPC con autorización.
drop policy if exists "Users can manage own notifications" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.prevent_notification_content_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.type is distinct from old.type
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Solo puedes cambiar el estado de lectura de la notificación';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_notification_content_update_trigger on public.notifications;
create trigger prevent_notification_content_update_trigger
before update on public.notifications
for each row execute function public.prevent_notification_content_update();

create or replace function public.create_internal_notification(
  p_user_id uuid,
  p_title text,
  p_message text default null,
  p_type text default 'info'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_target_role public.user_role;
  v_target_status text;
  v_target_active boolean;
begin
  if auth.uid() is null or not public.is_approved_active_user() then
    raise exception 'No autorizado para crear notificaciones'
      using errcode = '42501';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'El título de la notificación es requerido';
  end if;

  select rol, status, is_active
  into v_target_role, v_target_status, v_target_active
  from public.profiles
  where id = p_user_id;

  if not found or v_target_role = 'Cliente'::public.user_role then
    raise exception 'Destinatario interno inválido';
  end if;

  if not public.is_admin()
    and (v_target_status <> 'Aprobado' or v_target_active is not true)
  then
    raise exception 'El destinatario no es un usuario interno activo';
  end if;

  insert into public.notifications (user_id, title, message, type)
  values (p_user_id, trim(p_title), p_message, p_type)
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke all on function public.create_internal_notification(uuid, text, text, text)
  from public, anon;
grant execute on function public.create_internal_notification(uuid, text, text, text)
  to authenticated;

-- Portal: Operaciones/Admin pueden crear avisos; Cliente solo consulta y marca
-- como leído los suyos, sin alterar contenido ni destinatario.
create or replace function public.is_active_client_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.rol = 'Cliente'::public.user_role
      and p.status = 'Aprobado'
      and p.is_active = true
  )
$$;

revoke all on function public.is_active_client_profile(uuid) from public, anon;
grant execute on function public.is_active_client_profile(uuid) to authenticated;

drop policy if exists "client_notifications_admin_insert" on public.client_notifications;
create policy "client_notifications_staff_insert"
on public.client_notifications
for insert
to authenticated
with check (
  public.is_role(array['Admin', 'Operaciones'])
  and public.is_active_client_profile(profile_id)
);

create or replace function public.prevent_client_notification_content_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.type is distinct from old.type
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Solo puedes cambiar el estado de lectura de la notificación';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_client_notification_content_update_trigger
  on public.client_notifications;
create trigger prevent_client_notification_content_update_trigger
before update on public.client_notifications
for each row execute function public.prevent_client_notification_content_update();

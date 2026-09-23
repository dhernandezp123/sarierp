-- Fase 6 SaaS: portal, auditoría y soporte identificados por tenant.

do $phase6_columns$
declare
  v_table text;
begin
  foreach v_table in array array[
    'activity_logs', 'client_email_deliveries', 'client_notifications',
    'notifications', 'profile_role_change_logs', 'push_tokens',
    'signup_legal_acceptances', 'user_tasks', 'support_tickets',
    'support_ticket_messages', 'support_ticket_attachments',
    'support_ticket_events', 'support_notification_outbox'
  ] loop
    execute format('alter table public.%I add column if not exists tenant_id uuid', v_table);
  end loop;
end
$phase6_columns$;

-- Los registros históricos son anteriores a la habilitación de un segundo
-- tenant. Se deriva siempre del padre/actor; solo activity_logs, cuyo actor y
-- entidad pueden haber sido eliminados, usa el tenant inicial como último
-- recurso explícito de compatibilidad.
update public.client_email_deliveries row
set tenant_id = parent.tenant_id
from public.miami_packages parent
where parent.id = row.package_id and row.tenant_id is null;

update public.client_notifications row
set tenant_id = parent.tenant_id
from public.profiles parent
where parent.id = row.profile_id and row.tenant_id is null;

update public.notifications row
set tenant_id = parent.tenant_id
from public.profiles parent
where parent.id = row.user_id and row.tenant_id is null;

update public.profile_role_change_logs row
set tenant_id = parent.tenant_id
from public.profiles parent
where parent.id = row.profile_id and row.tenant_id is null;

update public.push_tokens row
set tenant_id = parent.tenant_id
from public.profiles parent
where parent.id = row.profile_id and row.tenant_id is null;

update public.signup_legal_acceptances row
set tenant_id = parent.tenant_id
from public.profiles parent
where parent.id = row.user_id and row.tenant_id is null;

update public.user_tasks row
set tenant_id = parent.tenant_id
from public.profiles parent
where parent.id = row.user_id and row.tenant_id is null;

update public.activity_logs row
set tenant_id = actor.tenant_id
from public.profiles actor
where actor.id = row.user_id and row.tenant_id is null;

update public.activity_logs row
set tenant_id = tenant.id
from public.tenants tenant
where tenant.slug = 'sari' and row.tenant_id is null;

update public.support_tickets row
set tenant_id = creator.tenant_id
from public.profiles creator
where creator.id = row.created_by and row.tenant_id is null;

update public.support_ticket_messages row
set tenant_id = parent.tenant_id
from public.support_tickets parent
where parent.id = row.ticket_id and row.tenant_id is null;

update public.support_ticket_attachments row
set tenant_id = parent.tenant_id
from public.support_tickets parent
where parent.id = row.ticket_id and row.tenant_id is null;

update public.support_ticket_events row
set tenant_id = parent.tenant_id
from public.support_tickets parent
where parent.id = row.ticket_id and row.tenant_id is null;

update public.support_notification_outbox row
set tenant_id = parent.tenant_id
from public.support_tickets parent
where parent.id = row.ticket_id and row.tenant_id is null;

do $phase6_preflight$
declare
  v_table text;
  v_count bigint;
begin
  foreach v_table in array array[
    'activity_logs', 'client_email_deliveries', 'client_notifications',
    'notifications', 'profile_role_change_logs', 'push_tokens',
    'signup_legal_acceptances', 'user_tasks', 'support_tickets',
    'support_ticket_messages', 'support_ticket_attachments',
    'support_ticket_events', 'support_notification_outbox'
  ] loop
    execute format('select count(*) from public.%I where tenant_id is null', v_table)
      into v_count;
    if v_count > 0 then
      raise exception 'Fase 6: % contiene % filas sin tenant derivable', v_table, v_count;
    end if;
  end loop;
end
$phase6_preflight$;

alter table public.notifications alter column user_id set not null;
alter table public.profile_role_change_logs alter column profile_id set not null;
alter table public.user_tasks alter column user_id set not null;

do $phase6_tenant_constraints$
declare
  v_table text;
begin
  foreach v_table in array array[
    'activity_logs', 'client_email_deliveries', 'client_notifications',
    'notifications', 'profile_role_change_logs', 'push_tokens',
    'signup_legal_acceptances', 'user_tasks', 'support_tickets',
    'support_ticket_messages', 'support_ticket_attachments',
    'support_ticket_events', 'support_notification_outbox'
  ] loop
    execute format('alter table public.%I alter column tenant_id set not null', v_table);
    execute format(
      'alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants(id) on delete restrict',
      v_table,
      left(v_table || '_tenant_id_fkey', 63)
    );
    execute format('create index %I on public.%I (tenant_id)', left(v_table || '_tenant_id_idx', 63), v_table);
  end loop;
end
$phase6_tenant_constraints$;

alter table public.support_tickets add constraint support_tickets_tenant_id_id_key unique (tenant_id, id);
alter table public.support_ticket_messages add constraint support_messages_tenant_id_id_key unique (tenant_id, id);

alter table public.client_email_deliveries add constraint client_email_tenant_package_fkey
  foreign key (tenant_id, package_id) references public.miami_packages (tenant_id, id) on delete cascade;
alter table public.client_notifications add constraint client_notifications_tenant_profile_fkey
  foreign key (tenant_id, profile_id) references public.profiles (tenant_id, id) on delete cascade;
alter table public.notifications add constraint notifications_tenant_profile_fkey
  foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade;
alter table public.profile_role_change_logs add constraint role_logs_tenant_profile_fkey
  foreign key (tenant_id, profile_id) references public.profiles (tenant_id, id) on delete cascade;
alter table public.profile_role_change_logs add constraint role_logs_tenant_actor_fkey
  foreign key (tenant_id, changed_by) references public.profiles (tenant_id, id);
alter table public.push_tokens add constraint push_tokens_tenant_profile_fkey
  foreign key (tenant_id, profile_id) references public.profiles (tenant_id, id) on delete cascade;
alter table public.signup_legal_acceptances add constraint legal_acceptances_tenant_profile_fkey
  foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade;
alter table public.user_tasks add constraint user_tasks_tenant_profile_fkey
  foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade;
alter table public.activity_logs add constraint activity_logs_tenant_actor_fkey
  foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete set null (user_id);

alter table public.support_tickets add constraint support_tickets_tenant_creator_fkey
  foreign key (tenant_id, created_by) references public.profiles (tenant_id, id) on delete restrict;
alter table public.support_ticket_messages add constraint support_messages_tenant_ticket_fkey
  foreign key (tenant_id, ticket_id) references public.support_tickets (tenant_id, id) on delete cascade;
alter table public.support_ticket_attachments add constraint support_attachments_tenant_ticket_fkey
  foreign key (tenant_id, ticket_id) references public.support_tickets (tenant_id, id) on delete cascade;
alter table public.support_ticket_attachments add constraint support_attachments_tenant_message_fkey
  foreign key (tenant_id, message_id) references public.support_ticket_messages (tenant_id, id) on delete cascade;
alter table public.support_ticket_events add constraint support_events_tenant_ticket_fkey
  foreign key (tenant_id, ticket_id) references public.support_tickets (tenant_id, id) on delete cascade;
alter table public.support_notification_outbox add constraint support_outbox_tenant_ticket_fkey
  foreign key (tenant_id, ticket_id) references public.support_tickets (tenant_id, id) on delete cascade;
alter table public.support_notification_outbox add constraint support_outbox_tenant_message_fkey
  foreign key (tenant_id, message_id) references public.support_ticket_messages (tenant_id, id) on delete cascade;

-- El soporte es transversal únicamente para Hernova. Usuarios operativos solo
-- pueden tocar tickets de su tenant; los hijos siempre heredan el ticket.
create or replace function public.enforce_support_ticket_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_tenant uuid;
  v_current_tenant uuid := public.current_tenant_id();
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null
      and not public.is_platform_admin()
      and old.tenant_id is distinct from v_current_tenant then
      raise exception 'No se puede operar sobre soporte de otra empresa' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se puede cambiar la empresa del ticket' using errcode = '42501';
  end if;

  select tenant_id into v_creator_tenant from public.profiles where id = new.created_by;
  if v_creator_tenant is null then
    raise exception 'El creador del ticket debe pertenecer a una empresa activa' using errcode = '42501';
  end if;
  if new.tenant_id is null then new.tenant_id := v_creator_tenant; end if;
  if new.tenant_id is distinct from v_creator_tenant then
    raise exception 'El ticket no coincide con la empresa del creador' using errcode = '23514';
  end if;
  if auth.uid() is not null
    and not public.is_platform_admin()
    and new.tenant_id is distinct from v_current_tenant then
    raise exception 'No se puede operar sobre soporte de otra empresa' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_support_child_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_tenant uuid;
  v_current_tenant uuid := public.current_tenant_id();
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null
      and not public.is_platform_admin()
      and old.tenant_id is distinct from v_current_tenant then
      raise exception 'No se puede operar sobre soporte de otra empresa' using errcode = '42501';
    end if;
    return old;
  end if;

  select tenant_id into v_parent_tenant
  from public.support_tickets
  where id = nullif(to_jsonb(new)->>'ticket_id', '')::uuid;
  if v_parent_tenant is null then raise exception 'Ticket de soporte inválido'; end if;
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'No se puede cambiar la empresa del registro de soporte' using errcode = '42501';
  end if;
  if new.tenant_id is not null and new.tenant_id is distinct from v_parent_tenant then
    raise exception 'El registro de soporte no coincide con su ticket' using errcode = '23514';
  end if;
  if auth.uid() is not null
    and not public.is_platform_admin()
    and v_parent_tenant is distinct from v_current_tenant then
    raise exception 'No se puede operar sobre soporte de otra empresa' using errcode = '42501';
  end if;
  new.tenant_id := v_parent_tenant;
  return new;
end;
$$;

revoke all on function public.enforce_support_ticket_tenant() from public, anon, authenticated;
revoke all on function public.enforce_support_child_tenant() from public, anon, authenticated;

drop trigger if exists tenant_guard on public.support_tickets;
create trigger tenant_guard before insert or update or delete on public.support_tickets
for each row execute function public.enforce_support_ticket_tenant();

do $phase6_support_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'support_ticket_messages', 'support_ticket_attachments',
    'support_ticket_events', 'support_notification_outbox'
  ] loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_support_child_tenant()',
      v_table
    );
  end loop;
end
$phase6_support_guards$;

do $phase6_parent_guards$
declare
  v_record record;
begin
  for v_record in select * from (values
    ('client_email_deliveries', 'miami_packages', 'package_id'),
    ('client_notifications', 'profiles', 'profile_id'),
    ('notifications', 'profiles', 'user_id'),
    ('profile_role_change_logs', 'profiles', 'profile_id'),
    ('push_tokens', 'profiles', 'profile_id'),
    ('signup_legal_acceptances', 'profiles', 'user_id'),
    ('user_tasks', 'profiles', 'user_id')
  ) as mappings(child_table, parent_table, parent_column)
  loop
    execute format('drop trigger if exists tenant_guard on public.%I', v_record.child_table);
    execute format(
      'create trigger tenant_guard before insert or update or delete on public.%I '
      'for each row execute function public.enforce_parent_tenant(%L, %L)',
      v_record.child_table, v_record.parent_table, v_record.parent_column
    );
  end loop;
end
$phase6_parent_guards$;

drop trigger if exists tenant_guard on public.activity_logs;
create trigger tenant_guard before insert or update or delete on public.activity_logs
for each row execute function public.enforce_current_tenant_row();

-- El directorio y la administración de perfiles dejan de ser globales por rol.
drop policy if exists profiles_select_authorized on public.profiles;
create policy profiles_select_authorized on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_platform_admin()
  or (
    tenant_id = public.current_tenant_id()
    and (
      public.is_admin()
      or (
        public.is_approved_active_user()
        and status = 'Aprobado'
        and is_active is true
        and rol <> 'Cliente'::public.user_role
      )
    )
  )
);

drop policy if exists "Admin can update profiles" on public.profiles;
create policy "Admin can update profiles" on public.profiles
for update to authenticated
using (public.is_admin() and tenant_id = public.current_tenant_id())
with check (public.is_admin() and tenant_id = public.current_tenant_id());

do $phase6_rls_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'activity_logs', 'client_email_deliveries', 'client_notifications',
    'notifications', 'profile_role_change_logs', 'push_tokens',
    'signup_legal_acceptances', 'user_tasks'
  ] loop
    execute format('drop policy if exists tenant_isolation_guard on public.%I', v_table);
    execute format(
      'create policy tenant_isolation_guard on public.%I as restrictive for all to authenticated '
      'using (tenant_id = public.current_tenant_id()) '
      'with check (tenant_id = public.current_tenant_id())',
      v_table
    );
  end loop;

  foreach v_table in array array[
    'support_tickets', 'support_ticket_messages', 'support_ticket_attachments',
    'support_ticket_events', 'support_notification_outbox'
  ] loop
    execute format('drop policy if exists tenant_isolation_guard on public.%I', v_table);
    execute format(
      'create policy tenant_isolation_guard on public.%I as restrictive for all to authenticated '
      'using (tenant_id = public.current_tenant_id() or public.is_platform_admin()) '
      'with check (tenant_id = public.current_tenant_id() or public.is_platform_admin())',
      v_table
    );
  end loop;
end
$phase6_rls_guards$;

create or replace function public.can_view_support_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_active_user()
    and exists (
      select 1 from public.support_tickets ticket
      where ticket.id = p_ticket_id
        and (
          ticket.tenant_id = public.current_tenant_id()
          or public.is_platform_admin()
        )
    )
$$;

revoke all on function public.can_view_support_ticket(uuid) from public, anon;
grant execute on function public.can_view_support_ticket(uuid) to authenticated;

-- Corrige el helper contextual detectado por db lint: leads no tiene deleted_at.
create or replace function public.can_access_user_task_context(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if p_entity_type is null and p_entity_id is null then return true; end if;
  if p_entity_type is null or p_entity_id is null then return false; end if;

  case p_entity_type
    when 'customer' then return public.can_select_cliente(p_entity_id);
    when 'quotation' then return public.can_select_quotation(p_entity_id);
    when 'shipping_instruction' then return public.can_select_shipping_instruction(p_entity_id);
    when 'booking' then return public.can_select_booking(p_entity_id);
    when 'bill_of_lading' then return public.can_access_bill_of_lading(p_entity_id);
    when 'invoice' then return public.can_access_invoice(p_entity_id);
    when 'agent' then
      return public.is_approved_active_user()
        and public.is_role(array['Admin', 'Pricing', 'Operaciones', 'Ventas'])
        and exists (select 1 from public.agents where id = p_entity_id and tenant_id = public.current_tenant_id());
    when 'lead' then
      return public.is_approved_active_user()
        and public.is_role(array['Admin', 'Ventas'])
        and exists (select 1 from public.leads where id = p_entity_id);
    when 'sales_activity' then
      return public.is_approved_active_user()
        and public.is_role(array['Admin', 'Ventas'])
        and exists (
          select 1 from public.sales_activities
          where id = p_entity_id
            and tenant_id = public.current_tenant_id()
            and deleted_at is null
        );
    else return false;
  end case;
end;
$$;

comment on column public.support_tickets.tenant_id is
  'Empresa solicitante; Hernova puede atender el ticket sin acceder transversalmente a sus datos operativos.';

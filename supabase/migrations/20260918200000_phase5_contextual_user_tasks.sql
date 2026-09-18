-- Fase 5: tareas manuales contextuales sin duplicar las colas derivadas.

alter table public.user_tasks
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists entity_label text,
  add column if not exists source_module text not null default 'general',
  add column if not exists source_path text,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.user_tasks
set completed_at = coalesce(completed_at, created_at, now())
where status = 'Completada'
  and completed_at is null;

alter table public.user_tasks
  alter column status set default 'Pendiente',
  alter column status set not null,
  alter column priority set default 'Media',
  alter column priority set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_tasks'::regclass
      and conname = 'user_tasks_status_check'
  ) then
    alter table public.user_tasks
      add constraint user_tasks_status_check
      check (status in ('Pendiente', 'Completada'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_tasks'::regclass
      and conname = 'user_tasks_entity_type_check'
  ) then
    alter table public.user_tasks
      add constraint user_tasks_entity_type_check
      check (
        entity_type is null
        or entity_type in (
          'customer', 'lead', 'sales_activity', 'quotation',
          'shipping_instruction', 'booking', 'bill_of_lading',
          'agent', 'invoice'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_tasks'::regclass
      and conname = 'user_tasks_entity_pair_check'
  ) then
    alter table public.user_tasks
      add constraint user_tasks_entity_pair_check
      check (
        (entity_type is null and entity_id is null)
        or (entity_type is not null and entity_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_tasks'::regclass
      and conname = 'user_tasks_source_module_check'
  ) then
    alter table public.user_tasks
      add constraint user_tasks_source_module_check
      check (source_module in ('general', 'sales', 'operations', 'agents', 'invoicing'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_tasks'::regclass
      and conname = 'user_tasks_source_path_check'
  ) then
    alter table public.user_tasks
      add constraint user_tasks_source_path_check
      check (
        source_path is null
        or (
          length(source_path) <= 1000
          and source_path ~ '^/[A-Za-z0-9]'
          and position('//' in source_path) = 0
          and position(E'\\' in source_path) = 0
        )
      );
  end if;
end
$$;

create or replace function public.can_access_user_task_context(
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if p_entity_type is null and p_entity_id is null then
    return true;
  end if;

  if p_entity_type is null or p_entity_id is null then
    return false;
  end if;

  case p_entity_type
    when 'customer' then
      return public.can_select_cliente(p_entity_id);
    when 'quotation' then
      return public.can_select_quotation(p_entity_id);
    when 'shipping_instruction' then
      return public.can_select_shipping_instruction(p_entity_id);
    when 'booking' then
      return public.can_select_booking(p_entity_id);
    when 'bill_of_lading' then
      return public.can_access_bill_of_lading(p_entity_id);
    when 'invoice' then
      return public.can_access_invoice(p_entity_id);
    when 'agent' then
      return public.is_approved_active_user()
        and public.is_role(array['Admin', 'Pricing', 'Operaciones', 'Ventas'])
        and exists (select 1 from public.agents where id = p_entity_id);
    when 'lead' then
      return public.is_approved_active_user()
        and public.is_role(array['Admin', 'Ventas'])
        and exists (
          select 1 from public.leads
          where id = p_entity_id and deleted_at is null
        );
    when 'sales_activity' then
      return public.is_approved_active_user()
        and public.is_role(array['Admin', 'Ventas'])
        and exists (
          select 1 from public.sales_activities
          where id = p_entity_id and deleted_at is null
        );
    else
      return false;
  end case;
end;
$$;

revoke all on function public.can_access_user_task_context(text, uuid) from public, anon;
grant execute on function public.can_access_user_task_context(text, uuid) to authenticated, service_role;

create or replace function public.sync_user_task_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  if new.status = 'Completada' then
    if tg_op = 'INSERT' or old.status is distinct from 'Completada' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;

  if new.deleted_at is not null and new.deleted_by is null then
    new.deleted_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists user_tasks_sync_lifecycle on public.user_tasks;
create trigger user_tasks_sync_lifecycle
before insert or update on public.user_tasks
for each row execute function public.sync_user_task_lifecycle();

create index if not exists user_tasks_open_owner_due_idx
  on public.user_tasks (user_id, due_date, priority)
  where deleted_at is null and status = 'Pendiente';

create index if not exists user_tasks_context_idx
  on public.user_tasks (entity_type, entity_id)
  where deleted_at is null and entity_id is not null;

drop policy if exists "Users can manage own tasks" on public.user_tasks;
drop policy if exists user_tasks_select_own on public.user_tasks;
drop policy if exists user_tasks_insert_own on public.user_tasks;
drop policy if exists user_tasks_update_own on public.user_tasks;
drop policy if exists user_tasks_delete_own on public.user_tasks;

create policy user_tasks_select_own
on public.user_tasks
for select
to authenticated
using (
  public.is_approved_active_user()
  and user_id = auth.uid()
  and deleted_at is null
  and public.can_access_user_task_context(entity_type, entity_id)
);

create policy user_tasks_insert_own
on public.user_tasks
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and user_id = auth.uid()
  and deleted_at is null
  and deleted_by is null
  and public.can_access_user_task_context(entity_type, entity_id)
);

create policy user_tasks_update_own
on public.user_tasks
for update
to authenticated
using (
  public.is_approved_active_user()
  and user_id = auth.uid()
  and deleted_at is null
  and public.can_access_user_task_context(entity_type, entity_id)
)
with check (
  public.is_approved_active_user()
  and user_id = auth.uid()
  and deleted_at is null
  and deleted_by is null
  and public.can_access_user_task_context(entity_type, entity_id)
);

create or replace function public.soft_delete_user_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_approved_active_user() then
    raise exception 'No autorizado para eliminar tareas'
      using errcode = '42501';
  end if;

  update public.user_tasks
  set deleted_at = now(), deleted_by = v_user_id
  where id = p_task_id
    and user_id = v_user_id
    and deleted_at is null;

  return found;
end;
$$;

revoke all on function public.soft_delete_user_task(uuid) from public, anon;
grant execute on function public.soft_delete_user_task(uuid) to authenticated, service_role;

comment on table public.user_tasks is
  'Recordatorios manuales por usuario; las colas operativas y financieras continúan derivándose de hechos canónicos.';

comment on column public.user_tasks.entity_type is
  'Tipo de contexto opcional. Debe acompañarse de entity_id y pasar autorización RLS.';

comment on column public.user_tasks.source_path is
  'Ruta interna opcional para volver al contexto; el frontend también valida el destino.';

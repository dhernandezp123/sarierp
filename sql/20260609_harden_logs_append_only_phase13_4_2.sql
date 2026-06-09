-- Fase 13.4.2 - Logs append-only.
-- Ejecutar en Supabase SQL Editor o pipeline de migraciones.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.rol
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.is_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(p_roles), false)
$$;

create or replace function public.uuid_from_text(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null then
    return null;
  end if;

  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.can_select_quotation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_quotation_id is null then false
      when public.is_role(array['Admin', 'Pricing']) then true
      when public.current_user_role() = 'Ventas' then exists (
        select 1
        from public.quotations q
        left join public.clientes c on c.id = q.cliente_id
        where q.id = p_quotation_id
          and q.deleted_at is null
          and (
            q.created_by = auth.uid()
            or c.vendedor_asignado = auth.uid()
          )
      )
      when public.current_user_role() = 'Operaciones' then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and exists (
            select 1
            from public.shipping_instructions si
            where si.quotation_id = q.id
          )
      )
      when public.current_user_role() = 'Contabilidad' then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and (
            q.status = 'Ganada'
            or exists (
              select 1
              from public.shipping_instructions si
              where si.quotation_id = q.id
            )
          )
      )
      else false
    end
$$;

alter table public.activity_logs enable row level security;
alter table public.quotation_status_history enable row level security;
alter table public.quotation_change_logs enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'activity_logs',
        'quotation_status_history',
        'quotation_change_logs'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

drop policy if exists "activity_logs_select_policy"
on public.activity_logs;

create policy "activity_logs_select_policy"
on public.activity_logs
for select
to authenticated
using (
  public.is_role(array['Admin'])
  or user_id = auth.uid()
  or (
    entity_type = 'quotation'
    and public.can_select_quotation(entity_id)
  )
  or public.can_select_quotation(
    public.uuid_from_text(metadata ->> 'quotation_id')
  )
);

drop policy if exists "activity_logs_insert_policy"
on public.activity_logs;

create policy "activity_logs_insert_policy"
on public.activity_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "quotation_status_history_select_policy"
on public.quotation_status_history;

create policy "quotation_status_history_select_policy"
on public.quotation_status_history
for select
to authenticated
using (
  public.is_role(array['Admin'])
  or changed_by = auth.uid()
  or public.can_select_quotation(quotation_id)
);

drop policy if exists "quotation_status_history_insert_policy"
on public.quotation_status_history;

create policy "quotation_status_history_insert_policy"
on public.quotation_status_history
for insert
to authenticated
with check (
  changed_by = auth.uid()
  and public.can_select_quotation(quotation_id)
);

drop policy if exists "quotation_change_logs_select_policy"
on public.quotation_change_logs;

create policy "quotation_change_logs_select_policy"
on public.quotation_change_logs
for select
to authenticated
using (
  public.is_role(array['Admin'])
  or changed_by = auth.uid()
  or public.can_select_quotation(quotation_id)
);

drop policy if exists "quotation_change_logs_insert_policy"
on public.quotation_change_logs;

create policy "quotation_change_logs_insert_policy"
on public.quotation_change_logs
for insert
to authenticated
with check (
  changed_by = auth.uid()
  and public.can_select_quotation(quotation_id)
);

notify pgrst, 'reload schema';

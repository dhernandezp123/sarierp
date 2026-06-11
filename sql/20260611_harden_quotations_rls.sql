-- =========================================================
-- Hardening RLS para public.quotations
-- =========================================================

create or replace function public.can_select_quotation(
  p_quotation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_quotation_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Pricing', 'Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
      )
      when public.is_role(array['Operaciones']) then exists (
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
      when public.is_role(array['Contabilidad']) then exists (
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

create or replace function public.can_select_quotation_row(
  p_quotation_id uuid,
  p_status text,
  p_deleted_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_quotation_id is null then false
      when not public.is_approved_active_user() then false
      when p_deleted_at is not null then false
      when public.is_role(array['Admin', 'Pricing', 'Ventas']) then true
      when public.is_role(array['Operaciones']) then exists (
        select 1
        from public.shipping_instructions si
        where si.quotation_id = p_quotation_id
      )
      when public.is_role(array['Contabilidad']) then (
        p_status = 'Ganada'
        or exists (
          select 1
          from public.shipping_instructions si
          where si.quotation_id = p_quotation_id
        )
      )
      else false
    end
$$;

create or replace function public.can_update_quotation(
  p_quotation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_quotation_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Pricing', 'Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;

create or replace function public.can_delete_quotation(
  p_quotation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
    )
$$;

alter table public.quotations enable row level security;

drop policy if exists "Allow authenticated users to read quotations"
on public.quotations;

drop policy if exists "Allow users to insert quotations"
on public.quotations;

drop policy if exists "Allow users to update quotations"
on public.quotations;

drop policy if exists "Allow users to delete quotations"
on public.quotations;

drop policy if exists "quotations_select_policy"
on public.quotations;

drop policy if exists "quotations_insert_policy"
on public.quotations;

drop policy if exists "quotations_update_policy"
on public.quotations;

drop policy if exists "quotations_delete_policy"
on public.quotations;

create policy "quotations_select_policy"
on public.quotations
for select
to authenticated
using (public.can_select_quotation_row(id, status, deleted_at));

create policy "quotations_insert_policy"
on public.quotations
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and created_by = auth.uid()
  and public.is_role(array['Admin', 'Ventas'])
);

create policy "quotations_update_policy"
on public.quotations
for update
to authenticated
using (public.can_update_quotation(id))
with check (public.is_approved_active_user());

create policy "quotations_delete_policy"
on public.quotations
for delete
to authenticated
using (public.can_delete_quotation(id));

notify pgrst, 'reload schema';

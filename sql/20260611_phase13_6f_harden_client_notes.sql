-- =========================================================
-- FASE 13.6F
-- RLS para client_notes
-- =========================================================

create or replace function public.can_select_cliente(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_cliente_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Pricing', 'Contabilidad']) then exists (
        select 1
        from public.clientes c
        where c.id = p_cliente_id
          and c.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.clientes c
        where c.id = p_cliente_id
          and c.deleted_at is null
          and c.vendedor_asignado = auth.uid()
      )
      else false
    end
$$;

alter table public.client_notes enable row level security;

drop policy if exists "Allow manage client notes" on public.client_notes;
drop policy if exists "Allow read client notes" on public.client_notes;

drop policy if exists "client_notes_select_policy" on public.client_notes;
drop policy if exists "client_notes_insert_policy" on public.client_notes;
drop policy if exists "client_notes_update_policy" on public.client_notes;
drop policy if exists "client_notes_delete_policy" on public.client_notes;

create policy "client_notes_select_policy"
on public.client_notes
for select
to authenticated
using (
  public.can_select_cliente(cliente_id)
);

create policy "client_notes_insert_policy"
on public.client_notes
for insert
to authenticated
with check (
  public.can_select_cliente(cliente_id)
  and created_by = auth.uid()
);

create policy "client_notes_update_policy"
on public.client_notes
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy "client_notes_delete_policy"
on public.client_notes
for delete
to authenticated
using (
  public.is_admin()
);

notify pgrst, 'reload schema';

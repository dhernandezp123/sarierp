-- =========================================================
-- Hardening RLS para public.shipping_instructions
-- =========================================================
-- No usar public.can_select_quotation() aqui para evitar recursividad:
-- can_select_quotation() consulta public.shipping_instructions para algunos roles.

create or replace function public.can_select_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_shipping_instruction_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
      )
      when public.is_role(array['Pricing']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        left join public.clientes c on c.id = q.cliente_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
          and (
            si.created_by = auth.uid()
            or q.created_by = auth.uid()
            or c.vendedor_asignado = auth.uid()
          )
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;

create or replace function public.can_update_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_shipping_instruction_id is null then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
          and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
          and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      )
      when public.is_role(array['Pricing']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q on q.id = si.quotation_id
        where si.id = p_shipping_instruction_id
          and q.deleted_at is null
          and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
          and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
          and si.created_by = auth.uid()
          and si.sales_submitted_at is null
          and si.operational_status = 'Pendiente Validación'
          and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
          and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      )
      else false
    end
$$;

alter table public.shipping_instructions enable row level security;

drop policy if exists "Allow read shipping instructions"
on public.shipping_instructions;

drop policy if exists "Allow manage shipping instructions"
on public.shipping_instructions;

drop policy if exists "shipping_instructions_select_policy"
on public.shipping_instructions;

drop policy if exists "shipping_instructions_insert_policy"
on public.shipping_instructions;

drop policy if exists "shipping_instructions_update_policy"
on public.shipping_instructions;

drop policy if exists "shipping_instructions_delete_policy"
on public.shipping_instructions;

create policy "shipping_instructions_select_policy"
on public.shipping_instructions
for select
to authenticated
using (public.can_select_shipping_instruction(id));

create policy "shipping_instructions_insert_policy"
on public.shipping_instructions
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and created_by = auth.uid()
  and (
    public.is_role(array['Admin', 'Ventas'])
    or public.is_role(array['Operaciones'])
  )
);

create policy "shipping_instructions_update_policy"
on public.shipping_instructions
for update
to authenticated
using (public.can_update_shipping_instruction(id))
with check (public.is_approved_active_user());

create policy "shipping_instructions_delete_policy"
on public.shipping_instructions
for delete
to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';

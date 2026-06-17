-- =========================================================
-- Fix RLS para Shipping Instructions creadas por Ventas
-- =========================================================
-- Ventas debe poder generar la Shipping Instruction de una cotización ganada.
-- El ERP permite a Ventas ver/gestionar cotizaciones comerciales, así que el
-- insert no debe depender de created_by ni vendedor_asignado de la cotización.
-- También se normaliza la comparación del estado inicial con acento.

create or replace function public.can_insert_shipping_instruction(
  p_quotation_id uuid,
  p_created_by uuid
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
      when p_created_by is distinct from auth.uid() then false
      when not public.is_approved_active_user() then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
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

drop policy if exists "shipping_instructions_insert_policy"
on public.shipping_instructions;

create policy "shipping_instructions_insert_policy"
on public.shipping_instructions
for insert
to authenticated
with check (
  public.can_insert_shipping_instruction(quotation_id, created_by)
);

notify pgrst, 'reload schema';

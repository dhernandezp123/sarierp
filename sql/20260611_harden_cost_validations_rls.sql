-- =========================================================
-- Hardening RLS para public.cost_validations
-- =========================================================
-- No usar public.can_select_quotation(): Ventas no debe ver validaciones
-- de costos reales aunque pueda acceder a la cotizacion comercial.

create or replace function public.can_manage_cost_validation(
  p_quotation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing', 'Operaciones'])
    and exists (
      select 1
      from public.quotations q
      where q.id = p_quotation_id
        and q.deleted_at is null
        and q.status = 'Ganada'
    )
$$;

alter table public.cost_validations enable row level security;

drop policy if exists "Allow read cost validations"
on public.cost_validations;

drop policy if exists "Allow manage cost validations"
on public.cost_validations;

drop policy if exists "cost_validations_select_policy"
on public.cost_validations;

drop policy if exists "cost_validations_insert_policy"
on public.cost_validations;

drop policy if exists "cost_validations_update_policy"
on public.cost_validations;

drop policy if exists "cost_validations_delete_policy"
on public.cost_validations;

create policy "cost_validations_select_policy"
on public.cost_validations
for select
to authenticated
using (public.can_manage_cost_validation(quotation_id));

create policy "cost_validations_insert_policy"
on public.cost_validations
for insert
to authenticated
with check (public.can_manage_cost_validation(quotation_id));

create policy "cost_validations_update_policy"
on public.cost_validations
for update
to authenticated
using (public.can_manage_cost_validation(quotation_id))
with check (public.can_manage_cost_validation(quotation_id));

create policy "cost_validations_delete_policy"
on public.cost_validations
for delete
to authenticated
using (public.can_manage_cost_validation(quotation_id));

notify pgrst, 'reload schema';

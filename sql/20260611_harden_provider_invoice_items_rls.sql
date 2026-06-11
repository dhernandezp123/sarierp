-- =========================================================
-- Hardening RLS para public.provider_invoice_items
-- =========================================================
-- No usar public.can_select_quotation(): el acceso financiero tiene reglas propias.

create or replace function public.can_select_provider_invoice_item(
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

create or replace function public.can_manage_provider_invoice_item(
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

alter table public.provider_invoice_items enable row level security;

drop policy if exists "Allow read provider invoice items"
on public.provider_invoice_items;

drop policy if exists "Allow manage provider invoice items"
on public.provider_invoice_items;

drop policy if exists "provider_invoice_items_select_policy"
on public.provider_invoice_items;

drop policy if exists "provider_invoice_items_insert_policy"
on public.provider_invoice_items;

drop policy if exists "provider_invoice_items_update_policy"
on public.provider_invoice_items;

drop policy if exists "provider_invoice_items_delete_policy"
on public.provider_invoice_items;

create policy "provider_invoice_items_select_policy"
on public.provider_invoice_items
for select
to authenticated
using (public.can_select_provider_invoice_item(quotation_id));

create policy "provider_invoice_items_insert_policy"
on public.provider_invoice_items
for insert
to authenticated
with check (
  public.can_manage_provider_invoice_item(quotation_id)
  and created_by = auth.uid()
);

create policy "provider_invoice_items_update_policy"
on public.provider_invoice_items
for update
to authenticated
using (public.can_manage_provider_invoice_item(quotation_id))
with check (public.can_manage_provider_invoice_item(quotation_id));

create policy "provider_invoice_items_delete_policy"
on public.provider_invoice_items
for delete
to authenticated
using (public.can_manage_provider_invoice_item(quotation_id));

notify pgrst, 'reload schema';

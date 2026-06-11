-- =========================================================
-- Hardening RLS para public.tax_rates
-- =========================================================

alter table public.tax_rates enable row level security;

drop policy if exists "Allow read tax rates"
on public.tax_rates;

drop policy if exists "Allow manage tax rates"
on public.tax_rates;

drop policy if exists "tax_rates_select_policy"
on public.tax_rates;

drop policy if exists "tax_rates_insert_policy"
on public.tax_rates;

drop policy if exists "tax_rates_update_policy"
on public.tax_rates;

drop policy if exists "tax_rates_delete_policy"
on public.tax_rates;

create policy "tax_rates_select_policy"
on public.tax_rates
for select
to authenticated
using (public.is_approved_active_user());

create policy "tax_rates_insert_policy"
on public.tax_rates
for insert
to authenticated
with check (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Contabilidad'])
);

create policy "tax_rates_update_policy"
on public.tax_rates
for update
to authenticated
using (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Contabilidad'])
)
with check (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Contabilidad'])
);

create policy "tax_rates_delete_policy"
on public.tax_rates
for delete
to authenticated
using (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Contabilidad'])
);

notify pgrst, 'reload schema';

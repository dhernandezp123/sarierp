-- =========================================================
-- FASE 13.6E
-- RLS para client_rates
-- =========================================================

alter table public.client_rates enable row level security;

drop policy if exists "client_rates_select_policy" on public.client_rates;
drop policy if exists "client_rates_insert_policy" on public.client_rates;
drop policy if exists "client_rates_update_policy" on public.client_rates;
drop policy if exists "client_rates_delete_policy" on public.client_rates;

create policy "client_rates_select_policy"
on public.client_rates
for select
to authenticated
using (
  public.is_approved_active_user()
);

create policy "client_rates_insert_policy"
on public.client_rates
for insert
to authenticated
with check (
  public.is_approved_active_user()
);

create policy "client_rates_update_policy"
on public.client_rates
for update
to authenticated
using (
  public.is_approved_active_user()
)
with check (
  public.is_approved_active_user()
);

create policy "client_rates_delete_policy"
on public.client_rates
for delete
to authenticated
using (
  public.is_admin()
);

notify pgrst, 'reload schema';

-- =========================================================
-- Fix: client_rates DELETE policy
-- El policy original solo permitía DELETE a is_admin().
-- Esto bloqueaba a Ventas/Pricing que sí pueden editar tarifas.
-- El flujo saveRates() hace DELETE → INSERT; sin DELETE, el INSERT
-- falla con unique constraint violation (409 Conflict).
-- =========================================================

drop policy if exists "client_rates_delete_policy" on public.client_rates;

create policy "client_rates_delete_policy"
on public.client_rates
for delete
to authenticated
using (
  public.is_approved_active_user()
);

notify pgrst, 'reload schema';

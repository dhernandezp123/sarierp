-- =========================================================
-- HOTFIX
-- Permitir reemplazo de tarifas por contenedor en agent quotes FCL
-- =========================================================

drop policy if exists "agent_quote_container_rates_delete_policy" on public.agent_quote_container_rates;

create policy "agent_quote_container_rates_delete_policy"
on public.agent_quote_container_rates
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.agent_quotes aq
    where aq.id = agent_quote_container_rates.agent_quote_id
      and public.can_select_quotation(aq.quotation_id)
  )
);

notify pgrst, 'reload schema';

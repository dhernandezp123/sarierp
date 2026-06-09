-- =========================================================
-- FASE 13.6C
-- RLS para agent_quote_container_rates
-- =========================================================

alter table public.agent_quote_container_rates enable row level security;

drop policy if exists "Allow manage agent quote container rates" on public.agent_quote_container_rates;
drop policy if exists "Allow read agent quote container rates" on public.agent_quote_container_rates;

drop policy if exists "agent_quote_container_rates_select_policy" on public.agent_quote_container_rates;
drop policy if exists "agent_quote_container_rates_insert_policy" on public.agent_quote_container_rates;
drop policy if exists "agent_quote_container_rates_update_policy" on public.agent_quote_container_rates;
drop policy if exists "agent_quote_container_rates_delete_policy" on public.agent_quote_container_rates;

create policy "agent_quote_container_rates_select_policy"
on public.agent_quote_container_rates
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_quotes aq
    where aq.id = agent_quote_container_rates.agent_quote_id
      and public.can_select_quotation(aq.quotation_id)
  )
);

create policy "agent_quote_container_rates_insert_policy"
on public.agent_quote_container_rates
for insert
to authenticated
with check (
  exists (
    select 1
    from public.agent_quotes aq
    where aq.id = agent_quote_container_rates.agent_quote_id
      and public.can_select_quotation(aq.quotation_id)
  )
);

create policy "agent_quote_container_rates_update_policy"
on public.agent_quote_container_rates
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_quotes aq
    where aq.id = agent_quote_container_rates.agent_quote_id
      and public.can_select_quotation(aq.quotation_id)
  )
)
with check (
  exists (
    select 1
    from public.agent_quotes aq
    where aq.id = agent_quote_container_rates.agent_quote_id
      and public.can_select_quotation(aq.quotation_id)
  )
);

create policy "agent_quote_container_rates_delete_policy"
on public.agent_quote_container_rates
for delete
to authenticated
using (
  public.is_admin()
);

notify pgrst, 'reload schema';

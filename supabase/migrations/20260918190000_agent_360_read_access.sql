-- Fase 4: Agent 360.
-- Ventas y Operaciones ya podían consultar el catálogo de agentes, pero la
-- política de lanes seguía limitada a Admin/Pricing. Se alinea la lectura sin
-- ampliar permisos de escritura ni acceso financiero.

drop policy if exists agent_route_rates_select_policy
  on public.agent_route_rates;

create policy agent_route_rates_select_policy
on public.agent_route_rates
for select
to authenticated
using (
  public.is_approved_active_user()
  and public.is_role(array['Admin', 'Pricing', 'Operaciones', 'Ventas'])
);


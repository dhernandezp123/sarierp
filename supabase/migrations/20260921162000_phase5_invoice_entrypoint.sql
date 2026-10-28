-- Fase 5: fija explicitamente el entrypoint publico de facturacion para que
-- instalaciones limpias usen la implementacion tenant-aware.

create or replace function public.create_invoice_with_items(
  p_invoice jsonb,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted_result record;
begin
  select *
  into trusted_result
  from public.create_invoice_with_items_trusted(p_invoice, p_items);

  return query
  select invoice.id, invoice.invoice_number
  from public.invoices invoice
  where invoice.id = trusted_result.invoice_id
    and invoice.tenant_id = public.current_tenant_id();
end;
$$;

revoke all on function public.create_invoice_with_items(jsonb, jsonb)
  from public, anon;
grant execute on function public.create_invoice_with_items(jsonb, jsonb)
  to authenticated;

comment on function public.create_invoice_with_items(jsonb, jsonb) is
  'Entrypoint de facturacion que delega en la implementacion atomica por tenant.';

notify pgrst, 'reload schema';

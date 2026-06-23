-- Ejecutar en Supabase SQL Editor antes de imponer constraints financieros.
-- Solo devuelve conteos agregados; no modifica datos.

select 'multiple_active_cai_ranges' as check_name,
  greatest(count(*) - 1, 0) as conflict_groups
from public.cai_ranges
where is_active is true
union all
select 'invalid_cai_range_format', count(*)
from public.cai_ranges
where rango_desde !~ '^.*-[0-9]+$'
   or rango_hasta !~ '^.*-[0-9]+$'
   or substring(rango_desde from '^(.*-)[0-9]+$')
      is distinct from substring(rango_hasta from '^(.*-)[0-9]+$')
union all
select 'invalid_cai_range_order', count(*)
from public.cai_ranges
where rango_desde ~ '^.*-[0-9]+$'
  and rango_hasta ~ '^.*-[0-9]+$'
  and substring(rango_desde from '([0-9]+)$')::numeric
      > substring(rango_hasta from '([0-9]+)$')::numeric
union all
select 'expired_active_cai', count(*)
from public.cai_ranges
where is_active is true
  and fecha_limite_emision < current_date
union all
select 'fiscal_documents_without_cai', count(*)
from public.invoices
where invoice_type in ('Factura', 'Nota de Crédito', 'Nota de Débito')
  and cai is null
  and deleted_at is null
union all
select 'fiscal_numbers_outside_stamped_range', count(*)
from public.invoices
where invoice_type in ('Factura', 'Nota de Crédito', 'Nota de Débito')
  and deleted_at is null
  and invoice_number ~ '^.*-[0-9]+$'
  and rango_desde ~ '^.*-[0-9]+$'
  and rango_hasta ~ '^.*-[0-9]+$'
  and (
    substring(invoice_number from '([0-9]+)$')::numeric
      < substring(rango_desde from '([0-9]+)$')::numeric
    or substring(invoice_number from '([0-9]+)$')::numeric
      > substring(rango_hasta from '([0-9]+)$')::numeric
  )
union all
select 'invoices_without_items', count(*)
from public.invoices i
where i.deleted_at is null
  and not exists (
    select 1 from public.invoice_items ii where ii.invoice_id = i.id
  )
union all
select 'invoice_subtotal_mismatch', count(*)
from public.invoices i
where i.deleted_at is null
  and abs(
    i.subtotal - coalesce((
      select sum(ii.amount) from public.invoice_items ii where ii.invoice_id = i.id
    ), 0)
  ) > 0.01
union all
select 'payment_currency_mismatch', count(*)
from public.invoice_payments ip
join public.invoices i on i.id = ip.invoice_id
where ip.currency <> i.currency
union all
select 'overpaid_invoices', count(*)
from (
  select i.id
  from public.invoices i
  join public.invoice_payments ip on ip.invoice_id = i.id
    and ip.currency = i.currency
  where i.deleted_at is null
  group by i.id, i.total
  having sum(ip.amount) > i.total + 0.01
) conflicts
union all
select 'payments_on_void_invoices', count(*)
from public.invoice_payments ip
join public.invoices i on i.id = ip.invoice_id
where i.status = 'Anulada';

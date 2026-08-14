-- Los borradores y documentos anulados no constituyen cuentas por cobrar.

create or replace view public.invoice_receivables
with (security_invoker = true)
as
with balances as (
  select
    i.id as invoice_id,
    i.invoice_number,
    i.cliente_id,
    i.cliente_nombre,
    i.issue_date,
    i.due_date,
    i.currency,
    i.total as original_total,
    i.status as stored_status,
    coalesce(notes.credit_total, 0) as credit_notes,
    coalesce(notes.debit_total, 0) as debit_notes,
    public.invoice_adjusted_total(i.id) as adjusted_total,
    coalesce(payments.paid_total, 0) as paid_total
  from public.invoices i
  left join lateral (
    select
      coalesce(sum(n.total) filter (
        where n.invoice_type = 'Nota de Crédito'
      ), 0) as credit_total,
      coalesce(sum(n.total) filter (
        where n.invoice_type = 'Nota de Débito'
      ), 0) as debit_total
    from public.invoices n
    where n.parent_invoice_id = i.id
      and n.deleted_at is null
      and n.status not in ('Borrador', 'Anulada')
  ) notes on true
  left join lateral (
    select coalesce(sum(p.amount), 0) as paid_total
    from public.invoice_payments p
    where p.invoice_id = i.id
      and p.status = 'Aplicado'
  ) payments on true
  where i.invoice_type = 'Factura'
    and i.deleted_at is null
    and i.status not in ('Borrador', 'Anulada')
)
select
  balances.*,
  greatest(round(adjusted_total - paid_total, 2), 0::numeric) as balance,
  case
    when adjusted_total <= paid_total and paid_total > 0 then 'Pagada'
    when adjusted_total = 0 then 'Saldada'
    when due_date < current_date then 'Vencida'
    when paid_total > 0 then 'Parcialmente Pagada'
    else stored_status
  end as receivable_status,
  case
    when due_date < current_date
      and adjusted_total > paid_total
    then current_date - due_date
    else 0
  end as days_overdue
from balances;

revoke all on table public.invoice_receivables from public, anon;
grant select on table public.invoice_receivables to authenticated;

notify pgrst, 'reload schema';

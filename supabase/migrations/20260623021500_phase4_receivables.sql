-- Fase 4: saldo único de CxC, notas aplicadas y vencimiento automático.

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in (
    'Borrador', 'Enviada', 'Aprobada', 'Parcialmente Pagada',
    'Pagada', 'Saldada', 'Vencida', 'Anulada'
  ));

create or replace function public.invoice_adjusted_total(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(
    round(
      i.total
      - coalesce(sum(n.total) filter (
          where n.invoice_type = 'Nota de Crédito'
            and n.status not in ('Borrador', 'Anulada')
        ), 0)
      + coalesce(sum(n.total) filter (
          where n.invoice_type = 'Nota de Débito'
            and n.status not in ('Borrador', 'Anulada')
        ), 0),
      2
    ),
    0::numeric
  )
  from public.invoices i
  left join public.invoices n on n.parent_invoice_id = i.id
    and n.deleted_at is null
  where i.id = p_invoice_id
  group by i.id, i.total;
$$;

revoke all on function public.invoice_adjusted_total(uuid) from public, anon;
grant execute on function public.invoice_adjusted_total(uuid) to authenticated;

create or replace function public.validate_invoice_note_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.invoices%rowtype;
begin
  if new.invoice_type not in ('Nota de Crédito', 'Nota de Débito') then
    return new;
  end if;

  if new.parent_invoice_id is null then
    raise exception 'La nota requiere una factura relacionada';
  end if;

  select * into v_parent
  from public.invoices
  where id = new.parent_invoice_id
    and invoice_type = 'Factura'
    and deleted_at is null;

  if not found then
    raise exception 'La factura relacionada no existe';
  end if;

  if new.cliente_id is distinct from v_parent.cliente_id then
    raise exception 'La nota y la factura deben pertenecer al mismo cliente';
  end if;

  if new.currency is distinct from v_parent.currency then
    raise exception 'La nota y la factura deben usar la misma moneda';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_invoice_note_parent_trigger on public.invoices;
create trigger validate_invoice_note_parent_trigger
before insert or update of invoice_type, parent_invoice_id, cliente_id, currency
on public.invoices
for each row execute function public.validate_invoice_note_parent();

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
      coalesce(sum(n.total) filter (where n.invoice_type = 'Nota de Crédito'), 0) as credit_total,
      coalesce(sum(n.total) filter (where n.invoice_type = 'Nota de Débito'), 0) as debit_total
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

create or replace function public.refresh_invoice_receivable_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.invoices i
  set status = r.receivable_status,
      paid_date = case when r.receivable_status = 'Pagada' then i.paid_date else null end,
      updated_at = now()
  from public.invoice_receivables r
  where i.id = r.invoice_id
    and i.status not in ('Borrador', 'Anulada')
    and i.status is distinct from r.receivable_status;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_invoice_receivable_statuses()
  from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-invoice-receivable-statuses';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'refresh-invoice-receivable-statuses',
    '5 0 * * *',
    'select public.refresh_invoice_receivable_statuses()'
  );
end;
$$;

create or replace function public.enforce_invoice_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_paid numeric;
  v_adjusted_total numeric;
begin
  if new.status is not distinct from old.status
    and new.total is not distinct from old.total then
    return new;
  end if;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.invoice_payments p
  where p.invoice_id = new.id and p.status = 'Aplicado';

  v_adjusted_total := coalesce(public.invoice_adjusted_total(new.id), new.total);

  if new.status = 'Anulada' and v_paid > 0 then
    raise exception 'No se puede anular un documento con pagos aplicados; revierte los pagos primero';
  end if;
  if new.status = 'Pagada' and v_paid < v_adjusted_total then
    raise exception 'El documento no puede marcarse pagado mientras conserve saldo pendiente';
  end if;
  if new.status = 'Parcialmente Pagada'
    and (v_paid <= 0 or v_paid >= v_adjusted_total) then
    raise exception 'El estado de pago parcial no coincide con el saldo aplicado';
  end if;
  return new;
end;
$$;

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns table (payment_id uuid, invoice_status text, paid_total numeric, pending_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_paid numeric;
  v_adjusted_total numeric;
  v_new_status text;
begin
  if v_user_id is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para registrar pagos' using errcode = '42501';
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'El documento no existe o fue eliminado'; end if;
  if v_invoice.invoice_type not in ('Factura', 'Proforma') then
    raise exception 'Los pagos solo pueden aplicarse a facturas o proformas';
  end if;
  if v_invoice.status not in ('Aprobada', 'Parcialmente Pagada', 'Vencida') then
    raise exception 'El documento debe estar aprobado, parcialmente pagado o vencido para recibir pagos';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El monto del pago debe ser mayor que cero'; end if;
  if p_payment_date is null or p_payment_date > current_date then
    raise exception 'La fecha del pago es requerida y no puede ser futura';
  end if;
  if p_currency is distinct from v_invoice.currency then
    raise exception 'La moneda del pago debe coincidir con la moneda del documento';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.invoice_payments
  where invoice_id = v_invoice.id and status = 'Aplicado';
  v_adjusted_total := coalesce(public.invoice_adjusted_total(v_invoice.id), v_invoice.total);

  if round(v_paid + p_amount, 2) > round(v_adjusted_total, 2) then
    raise exception 'El pago supera el saldo pendiente ajustado por notas';
  end if;

  insert into public.invoice_payments (
    invoice_id, amount, currency, payment_date, payment_method,
    reference, notes, created_by, status
  ) values (
    v_invoice.id, round(p_amount, 2), p_currency, p_payment_date,
    nullif(btrim(p_payment_method), ''), nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''), v_user_id, 'Aplicado'
  ) returning id into v_payment_id;

  v_paid := round(v_paid + p_amount, 2);
  v_new_status := case
    when v_paid >= v_adjusted_total then 'Pagada'
    when v_invoice.due_date < current_date then 'Vencida'
    else 'Parcialmente Pagada'
  end;

  update public.invoices
  set status = v_new_status,
      paid_date = case when v_new_status = 'Pagada' then p_payment_date else null end,
      payment_method = case when v_new_status = 'Pagada' then nullif(btrim(p_payment_method), '') else payment_method end,
      payment_reference = case when v_new_status = 'Pagada' then nullif(btrim(p_reference), '') else payment_reference end,
      updated_by = v_user_id, updated_at = now()
  where id = v_invoice.id;

  insert into public.activity_logs (user_id, module, action, entity_type, entity_id, description, metadata)
  values (
    v_user_id, 'Facturación', 'Pago registrado', 'invoice', v_invoice.id,
    'Pago aplicado al documento ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
    jsonb_build_object('payment_id', v_payment_id, 'amount', round(p_amount, 2),
      'currency', p_currency, 'payment_date', p_payment_date,
      'adjusted_total', v_adjusted_total, 'invoice_status', v_new_status)
  );

  return query select v_payment_id, v_new_status, v_paid,
    greatest(round(v_adjusted_total - v_paid, 2), 0::numeric);
end;
$$;

create or replace function public.reverse_invoice_payment(p_payment_id uuid, p_reason text)
returns table (payment_id uuid, invoice_status text, paid_total numeric, pending_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.invoice_payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_paid numeric;
  v_adjusted_total numeric;
  v_new_status text;
begin
  if v_user_id is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para revertir pagos' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'El motivo del reverso es obligatorio'; end if;

  select * into v_payment from public.invoice_payments where id = p_payment_id for update;
  if not found then raise exception 'El pago no existe'; end if;
  if v_payment.status = 'Reversado' then raise exception 'El pago ya fue reversado'; end if;
  select * into v_invoice from public.invoices where id = v_payment.invoice_id for update;

  update public.invoice_payments set status = 'Reversado', reversed_at = now(),
    reversed_by = v_user_id, reversal_reason = btrim(p_reason)
  where id = v_payment.id;

  select coalesce(sum(amount), 0) into v_paid from public.invoice_payments
  where invoice_id = v_invoice.id and status = 'Aplicado';
  v_adjusted_total := coalesce(public.invoice_adjusted_total(v_invoice.id), v_invoice.total);
  v_new_status := case
    when v_invoice.status = 'Anulada' then 'Anulada'
    when v_paid >= v_adjusted_total and v_paid > 0 then 'Pagada'
    when v_adjusted_total = 0 then 'Saldada'
    when v_paid > 0 then 'Parcialmente Pagada'
    when v_invoice.due_date < current_date then 'Vencida'
    else 'Aprobada'
  end;

  update public.invoices set status = v_new_status,
    paid_date = case when v_new_status = 'Pagada' then paid_date else null end,
    payment_method = case when v_new_status = 'Pagada' then payment_method else null end,
    payment_reference = case when v_new_status = 'Pagada' then payment_reference else null end,
    updated_by = v_user_id, updated_at = now()
  where id = v_invoice.id;

  insert into public.activity_logs (user_id, module, action, entity_type, entity_id, description, metadata)
  values (
    v_user_id, 'Facturación', 'Pago reversado', 'invoice', v_invoice.id,
    'Pago reversado del documento ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
    jsonb_build_object('payment_id', v_payment.id, 'amount', v_payment.amount,
      'currency', v_payment.currency, 'reason', btrim(p_reason),
      'adjusted_total', v_adjusted_total, 'invoice_status', v_new_status)
  );

  return query select v_payment.id, v_new_status, v_paid,
    greatest(round(v_adjusted_total - v_paid, 2), 0::numeric);
end;
$$;

notify pgrst, 'reload schema';

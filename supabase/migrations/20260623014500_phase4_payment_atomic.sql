-- Fase 4: pagos de facturas atómicos, inmutables y reversables.

alter table public.invoice_payments
  add column if not exists status text not null default 'Aplicado',
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null,
  add column if not exists reversal_reason text;

alter table public.invoice_payments
  add constraint invoice_payments_status_check
  check (status in ('Aplicado', 'Reversado')),
  add constraint invoice_payments_positive_amount_check
  check (amount > 0) not valid,
  add constraint invoice_payments_currency_check
  check (currency in ('USD', 'HNL')) not valid,
  add constraint invoice_payments_reversal_metadata_check
  check (
    (status = 'Aplicado'
      and reversed_at is null
      and reversed_by is null
      and reversal_reason is null)
    or
    (status = 'Reversado'
      and reversed_at is not null
      and reversed_by is not null
      and nullif(btrim(reversal_reason), '') is not null)
  );

create index if not exists invoice_payments_applied_invoice_idx
  on public.invoice_payments (invoice_id, payment_date)
  where status = 'Aplicado';

alter table public.invoices
  drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in (
    'Borrador', 'Enviada', 'Aprobada', 'Parcialmente Pagada',
    'Pagada', 'Vencida', 'Anulada'
  ));

create or replace function public.enforce_invoice_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_paid numeric;
begin
  if new.status is not distinct from old.status
    and new.total is not distinct from old.total then
    return new;
  end if;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.invoice_payments p
  where p.invoice_id = new.id
    and p.status = 'Aplicado';

  if new.status = 'Anulada' and v_paid > 0 then
    raise exception 'No se puede anular un documento con pagos aplicados; revierte los pagos primero';
  end if;

  if new.status = 'Pagada' and v_paid < new.total then
    raise exception 'El documento no puede marcarse pagado mientras conserve saldo pendiente';
  end if;

  if new.status = 'Parcialmente Pagada'
    and (v_paid <= 0 or v_paid >= new.total) then
    raise exception 'El estado de pago parcial no coincide con el saldo aplicado';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_invoice_payment_status_trigger
  on public.invoices;
create trigger enforce_invoice_payment_status_trigger
before update of status, total
on public.invoices
for each row execute function public.enforce_invoice_payment_status();

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns table (
  payment_id uuid,
  invoice_status text,
  paid_total numeric,
  pending_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_paid numeric;
  v_new_status text;
begin
  if v_user_id is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para registrar pagos'
      using errcode = '42501';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'El documento no existe o fue eliminado';
  end if;

  if v_invoice.invoice_type not in ('Factura', 'Proforma') then
    raise exception 'Los pagos solo pueden aplicarse a facturas o proformas';
  end if;

  if v_invoice.status not in ('Aprobada', 'Parcialmente Pagada', 'Vencida') then
    raise exception 'El documento debe estar aprobado, parcialmente pagado o vencido para recibir pagos';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero';
  end if;

  if p_payment_date is null or p_payment_date > current_date then
    raise exception 'La fecha del pago es requerida y no puede ser futura';
  end if;

  if p_currency is distinct from v_invoice.currency then
    raise exception 'La moneda del pago debe coincidir con la moneda del documento';
  end if;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.invoice_payments p
  where p.invoice_id = v_invoice.id
    and p.status = 'Aplicado';

  if round(v_paid + p_amount, 2) > round(v_invoice.total, 2) then
    raise exception 'El pago supera el saldo pendiente';
  end if;

  insert into public.invoice_payments (
    invoice_id, amount, currency, payment_date, payment_method,
    reference, notes, created_by, status
  )
  values (
    v_invoice.id, round(p_amount, 2), p_currency, p_payment_date,
    nullif(btrim(p_payment_method), ''), nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''), v_user_id, 'Aplicado'
  )
  returning id into v_payment_id;

  v_paid := round(v_paid + p_amount, 2);
  v_new_status := case
    when v_paid >= round(v_invoice.total, 2) then 'Pagada'
    else 'Parcialmente Pagada'
  end;

  update public.invoices
  set status = v_new_status,
      paid_date = case when v_new_status = 'Pagada' then p_payment_date else null end,
      payment_method = case when v_new_status = 'Pagada' then nullif(btrim(p_payment_method), '') else payment_method end,
      payment_reference = case when v_new_status = 'Pagada' then nullif(btrim(p_reference), '') else payment_reference end,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_invoice.id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  )
  values (
    v_user_id, 'Facturación', 'Pago registrado', 'invoice', v_invoice.id,
    'Pago aplicado al documento ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', round(p_amount, 2),
      'currency', p_currency,
      'payment_date', p_payment_date,
      'invoice_status', v_new_status
    )
  );

  return query
  select v_payment_id, v_new_status, v_paid,
    greatest(round(v_invoice.total - v_paid, 2), 0::numeric);
end;
$$;

create or replace function public.reverse_invoice_payment(
  p_payment_id uuid,
  p_reason text
)
returns table (
  payment_id uuid,
  invoice_status text,
  paid_total numeric,
  pending_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.invoice_payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_paid numeric;
  v_new_status text;
begin
  if v_user_id is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para revertir pagos'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del reverso es obligatorio';
  end if;

  select * into v_payment
  from public.invoice_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'El pago no existe';
  end if;

  if v_payment.status = 'Reversado' then
    raise exception 'El pago ya fue reversado';
  end if;

  select * into v_invoice
  from public.invoices
  where id = v_payment.invoice_id
  for update;

  update public.invoice_payments
  set status = 'Reversado',
      reversed_at = now(),
      reversed_by = v_user_id,
      reversal_reason = btrim(p_reason)
  where id = v_payment.id;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.invoice_payments p
  where p.invoice_id = v_invoice.id
    and p.status = 'Aplicado';

  v_new_status := case
    when v_invoice.status = 'Anulada' then 'Anulada'
    when v_paid >= round(v_invoice.total, 2) then 'Pagada'
    when v_paid > 0 then 'Parcialmente Pagada'
    else 'Aprobada'
  end;

  update public.invoices
  set status = v_new_status,
      paid_date = case when v_new_status = 'Pagada' then paid_date else null end,
      payment_method = case when v_new_status = 'Pagada' then payment_method else null end,
      payment_reference = case when v_new_status = 'Pagada' then payment_reference else null end,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_invoice.id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  )
  values (
    v_user_id, 'Facturación', 'Pago reversado', 'invoice', v_invoice.id,
    'Pago reversado del documento ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'currency', v_payment.currency,
      'reason', btrim(p_reason),
      'invoice_status', v_new_status
    )
  );

  return query
  select v_payment.id, v_new_status, v_paid,
    greatest(round(v_invoice.total - v_paid, 2), 0::numeric);
end;
$$;

drop policy if exists invoice_payments_delete_policy on public.invoice_payments;
drop policy if exists invoice_payments_insert_policy on public.invoice_payments;
drop policy if exists invoice_payments_update_policy on public.invoice_payments;

revoke insert, update, delete on public.invoice_payments from anon, authenticated;
revoke all on function public.register_invoice_payment(uuid, numeric, text, date, text, text, text)
  from public, anon;
revoke all on function public.reverse_invoice_payment(uuid, text)
  from public, anon;
grant execute on function public.register_invoice_payment(uuid, numeric, text, date, text, text, text)
  to authenticated;
grant execute on function public.reverse_invoice_payment(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

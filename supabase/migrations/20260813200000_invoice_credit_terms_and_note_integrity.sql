-- Condiciones de credito por cliente y proteccion del saldo al aplicar notas.

alter table public.invoices
  add column if not exists payment_condition text,
  add column if not exists credit_days integer;

alter table public.invoices
  add constraint invoices_payment_condition_check
  check (payment_condition is null or payment_condition in ('Contado', 'Credito')) not valid,
  add constraint invoices_credit_days_check
  check (
    (payment_condition is null and credit_days is null)
    or (payment_condition = 'Contado' and credit_days = 0)
    or (payment_condition = 'Credito' and credit_days > 0)
  ) not valid;

update public.invoices invoice
set payment_condition = case
      when coalesce(client.dias_credito, 0) > 0
        or (
          lower(btrim(coalesce(client.condicion_pago, 'Contado'))) <> 'contado'
          and invoice.due_date > invoice.issue_date
        )
      then 'Credito'
      else 'Contado'
    end,
    credit_days = case
      when coalesce(client.dias_credito, 0) > 0 then client.dias_credito
      when lower(btrim(coalesce(client.condicion_pago, 'Contado'))) <> 'contado'
        and invoice.due_date > invoice.issue_date
      then invoice.due_date - invoice.issue_date
      else 0
    end
from public.clientes client
where invoice.cliente_id = client.id
  and invoice.invoice_type in ('Factura', 'Proforma')
  and invoice.payment_condition is null;

update public.invoices
set payment_condition = case
      when due_date > issue_date then 'Credito'
      else 'Contado'
    end,
    credit_days = case
      when due_date > issue_date then due_date - issue_date
      else 0
    end
where invoice_type in ('Factura', 'Proforma')
  and payment_condition is null;

alter table public.invoices validate constraint invoices_payment_condition_check;
alter table public.invoices validate constraint invoices_credit_days_check;

create or replace function public.set_invoice_credit_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_condition text;
  v_credit_days integer;
  v_is_credit boolean;
begin
  if new.invoice_type not in ('Factura', 'Proforma') then
    new.payment_condition := null;
    new.credit_days := null;
    new.due_date := null;
    return new;
  end if;

  select client.condicion_pago, coalesce(client.dias_credito, 0)
  into v_condition, v_credit_days
  from public.clientes client
  where client.id = new.cliente_id
    and client.deleted_at is null;

  if not found then
    raise exception 'El cliente de la factura no existe o fue eliminado';
  end if;

  v_is_credit := v_credit_days > 0
    or lower(btrim(coalesce(v_condition, 'Contado'))) <> 'contado';

  if v_is_credit and v_credit_days <= 0 then
    raise exception 'El cliente de credito debe tener dias de credito configurados';
  end if;

  new.payment_condition := case when v_is_credit then 'Credito' else 'Contado' end;
  new.credit_days := case when v_is_credit then v_credit_days else 0 end;
  new.due_date := case
    when v_is_credit then new.issue_date + v_credit_days
    else new.issue_date
  end;

  return new;
end;
$$;

drop trigger if exists set_invoice_credit_terms_trigger on public.invoices;
create trigger set_invoice_credit_terms_trigger
before insert or update of
  invoice_type, cliente_id, issue_date, due_date, payment_condition, credit_days
on public.invoices
for each row execute function public.set_invoice_credit_terms();

create or replace function public.validate_invoice_note_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.invoices%rowtype;
  v_credit_notes numeric;
  v_debit_notes numeric;
  v_paid numeric;
  v_projected_total numeric;
  v_is_applied boolean;
begin
  if tg_op = 'UPDATE' then
    if old.invoice_type in ('Nota de Crédito', 'Nota de Débito')
      and new.invoice_type is distinct from old.invoice_type then
      raise exception 'No se puede cambiar el tipo de una nota existente';
    end if;
  end if;

  if new.invoice_type not in ('Nota de Crédito', 'Nota de Débito') then
    return new;
  end if;

  select * into v_parent
  from public.invoices
  where id = new.parent_invoice_id
    and invoice_type = 'Factura'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'La factura relacionada no existe';
  end if;
  if v_parent.status = 'Anulada' then
    raise exception 'No se puede aplicar una nota a una factura anulada';
  end if;

  select
    coalesce(sum(note.total) filter (
      where note.invoice_type = 'Nota de Crédito'
    ), 0),
    coalesce(sum(note.total) filter (
      where note.invoice_type = 'Nota de Débito'
    ), 0)
  into v_credit_notes, v_debit_notes
  from public.invoices note
  where note.parent_invoice_id = v_parent.id
    and note.id is distinct from new.id
    and note.deleted_at is null
    and note.status not in ('Borrador', 'Anulada');

  select coalesce(sum(payment.amount), 0)
  into v_paid
  from public.invoice_payments payment
  where payment.invoice_id = v_parent.id
    and payment.status = 'Aplicado';

  v_is_applied := new.deleted_at is null
    and new.status not in ('Borrador', 'Anulada');
  if v_is_applied and v_parent.status not in (
    'Enviada', 'Aprobada', 'Parcialmente Pagada',
    'Pagada', 'Saldada', 'Vencida'
  ) then
    raise exception 'La factura debe estar emitida antes de aplicar una nota';
  end if;
  v_projected_total := v_parent.total - v_credit_notes + v_debit_notes;

  if v_is_applied and new.invoice_type = 'Nota de Crédito' then
    v_projected_total := v_projected_total - new.total;
  elsif v_is_applied and new.invoice_type = 'Nota de Débito' then
    v_projected_total := v_projected_total + new.total;
  end if;

  if round(v_projected_total, 2) < round(v_paid, 2) then
    raise exception 'La nota dejaria pagos aplicados por encima del total ajustado de la factura';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_invoice_note_balance_trigger on public.invoices;
create trigger validate_invoice_note_balance_trigger
before insert or update of
  invoice_type, parent_invoice_id, status, total, deleted_at
on public.invoices
for each row execute function public.validate_invoice_note_balance();

create or replace function public.prevent_invoice_annulment_with_active_notes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_type = 'Factura'
    and new.status = 'Anulada'
    and old.status is distinct from new.status
    and exists (
      select 1
      from public.invoices note
      where note.parent_invoice_id = new.id
        and note.invoice_type in ('Nota de Crédito', 'Nota de Débito')
        and note.deleted_at is null
        and note.status not in ('Borrador', 'Anulada')
    ) then
    raise exception 'Anula primero las notas de crédito o débito emitidas contra la factura';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_invoice_annulment_with_active_notes_trigger
  on public.invoices;
create trigger prevent_invoice_annulment_with_active_notes_trigger
before update of status on public.invoices
for each row execute function public.prevent_invoice_annulment_with_active_notes();

notify pgrst, 'reload schema';

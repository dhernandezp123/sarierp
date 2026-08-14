-- Clasificacion fiscal, punto de venta y desglose de pagos de facturas.

alter table public.invoice_payments
  add column if not exists invoice_fiscal_type text,
  add column if not exists point_of_sale text;

alter table public.invoice_payments
  add constraint invoice_payments_fiscal_type_check
  check (invoice_fiscal_type in ('Gravada', 'Mixta', 'Exenta', 'Exonerada', 'No aplica')) not valid,
  add constraint invoice_payments_point_of_sale_check
  check (point_of_sale is null or length(btrim(point_of_sale)) between 1 and 120) not valid;

create table if not exists public.invoice_payment_splits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.invoice_payments(id) on delete cascade,
  payment_method text not null,
  amount numeric(14,2) not null,
  reference text,
  created_at timestamptz not null default now(),
  constraint invoice_payment_splits_method_check
    check (payment_method in (
      'Cheque', 'Deposito', 'Transferencia', 'Tarjeta debito', 'Tarjeta credito'
    )),
  constraint invoice_payment_splits_positive_amount_check check (amount > 0),
  constraint invoice_payment_splits_payment_method_unique unique (payment_id, payment_method)
);

create index if not exists invoice_payment_splits_payment_id_idx
  on public.invoice_payment_splits (payment_id);

alter table public.invoice_payment_splits enable row level security;

drop policy if exists invoice_payment_splits_select_policy
  on public.invoice_payment_splits;
create policy invoice_payment_splits_select_policy
on public.invoice_payment_splits for select to authenticated
using (
  exists (
    select 1
    from public.invoice_payments payment
    where payment.id = invoice_payment_splits.payment_id
      and public.can_access_invoice(payment.invoice_id)
  )
);

revoke all on table public.invoice_payment_splits from public, anon;
revoke insert, update, delete on table public.invoice_payment_splits from authenticated;
grant select on table public.invoice_payment_splits to authenticated;

create or replace function public.register_invoice_payment_v2(
  p_invoice_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_date date,
  p_invoice_fiscal_type text,
  p_point_of_sale text,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null,
  p_payment_splits jsonb default '[]'::jsonb
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
  v_adjusted_total numeric;
  v_new_status text;
  v_invoice_payment_method text;
  v_split jsonb;
  v_split_count integer := 0;
  v_split_sum numeric := 0;
  v_split_method text;
  v_split_amount numeric;
begin
  if v_user_id is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para registrar pagos'
      using errcode = '42501';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and deleted_at is null
  for update;

  if not found then raise exception 'El documento no existe o fue eliminado'; end if;
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
  if nullif(btrim(coalesce(p_point_of_sale, '')), '') is null then
    raise exception 'Selecciona el punto de venta';
  end if;
  if length(btrim(p_point_of_sale)) > 120 then
    raise exception 'El punto de venta es demasiado largo';
  end if;
  if not (
    btrim(p_point_of_sale) = btrim(coalesce(v_invoice.lugar_emision, ''))
    or exists (
      select 1
      from public.cai_ranges cai
      where cai.is_active
        and nullif(btrim(coalesce(cai.lugar_emision, '')), '') is not null
        and btrim(cai.lugar_emision) = btrim(p_point_of_sale)
    )
    or exists (
      select 1
      from public.company_settings settings
      where btrim(p_point_of_sale) in (
        btrim(coalesce(settings.lugar_emision_defecto, '')),
        btrim(coalesce(settings.city, ''))
      )
    )
  ) then
    raise exception 'El punto de venta no pertenece a una ciudad configurada';
  end if;
  if p_payment_method is null
    or p_payment_method not in (
      'Cheque', 'Deposito', 'Transferencia',
      'Tarjeta debito', 'Tarjeta credito', 'Mixto'
    ) then
    raise exception 'La forma de pago no es valida';
  end if;
  if jsonb_typeof(coalesce(p_payment_splits, '[]'::jsonb)) <> 'array' then
    raise exception 'El desglose del pago debe ser un arreglo';
  end if;

  if v_invoice.invoice_type = 'Proforma' then
    if p_invoice_fiscal_type is distinct from 'No aplica' then
      raise exception 'La clasificacion fiscal no aplica a proformas';
    end if;
  elsif p_invoice_fiscal_type is null
    or p_invoice_fiscal_type not in ('Gravada', 'Mixta', 'Exenta', 'Exonerada') then
    raise exception 'Selecciona la clasificacion fiscal de la factura';
  elsif p_invoice_fiscal_type = 'Exonerada'
    and not ((coalesce(v_invoice.es_exonerado, false)
      or coalesce(v_invoice.importe_exonerado, 0) > 0)
      and coalesce(v_invoice.tax_amount, 0) <= 0
      and coalesce(v_invoice.importe_exento, 0) <= 0) then
    raise exception 'La factura no esta registrada como exonerada';
  elsif p_invoice_fiscal_type = 'Exenta'
    and (coalesce(v_invoice.tax_amount, 0) > 0
      or coalesce(v_invoice.importe_exento, 0) <= 0
      or coalesce(v_invoice.importe_exonerado, 0) > 0
      or coalesce(v_invoice.es_exonerado, false)) then
    raise exception 'La composicion de la factura no corresponde a una factura exenta';
  elsif p_invoice_fiscal_type = 'Mixta'
    and (
      (case when coalesce(v_invoice.tax_amount, 0) > 0 then 1 else 0 end)
      + (case when coalesce(v_invoice.importe_exento, 0) > 0 then 1 else 0 end)
      + (case when coalesce(v_invoice.importe_exonerado, 0) > 0 then 1 else 0 end)
    ) < 2 then
    raise exception 'La factura mixta debe contener al menos dos componentes fiscales';
  elsif p_invoice_fiscal_type = 'Gravada'
    and (coalesce(v_invoice.tax_amount, 0) <= 0
      or coalesce(v_invoice.importe_exento, 0) > 0
      or coalesce(v_invoice.importe_exonerado, 0) > 0
      or coalesce(v_invoice.es_exonerado, false)) then
    raise exception 'La composicion de la factura no corresponde a una factura gravada';
  end if;

  if p_payment_method = 'Mixto' then
    for v_split in
      select value from jsonb_array_elements(coalesce(p_payment_splits, '[]'::jsonb))
    loop
      v_split_method := v_split->>'payment_method';
      v_split_amount := coalesce((v_split->>'amount')::numeric, 0);

      if v_split_method not in (
        'Cheque', 'Deposito', 'Transferencia',
        'Tarjeta debito', 'Tarjeta credito'
      )
        or v_split_amount <= 0 then
        raise exception 'El desglose mixto contiene valores invalidos';
      end if;

      if nullif(btrim(coalesce(v_split->>'reference', '')), '') is null then
        raise exception 'Cada forma del pago mixto requiere referencia o voucher';
      end if;

      v_split_count := v_split_count + 1;
      v_split_sum := v_split_sum + round(v_split_amount, 2);
    end loop;

    if v_split_count < 2 then
      raise exception 'El pago mixto requiere al menos dos formas de pago';
    end if;
    if round(v_split_sum, 2) <> round(p_amount, 2) then
      raise exception 'La suma del pago mixto debe coincidir con el monto recibido';
    end if;
    if (
      select count(*)
      from (
        select value->>'payment_method'
        from jsonb_array_elements(coalesce(p_payment_splits, '[]'::jsonb))
        group by value->>'payment_method'
      ) methods
    ) <> v_split_count then
      raise exception 'No repitas una forma de pago en el desglose mixto';
    end if;
  elsif jsonb_array_length(coalesce(p_payment_splits, '[]'::jsonb)) > 0 then
    raise exception 'El desglose solo aplica a pagos mixtos';
  elsif nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'La forma de pago requiere numero de referencia o voucher';
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
    reference, notes, created_by, status, invoice_fiscal_type, point_of_sale
  ) values (
    v_invoice.id, round(p_amount, 2), p_currency, p_payment_date,
    p_payment_method, nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''), v_user_id, 'Aplicado',
    p_invoice_fiscal_type, btrim(p_point_of_sale)
  ) returning id into v_payment_id;

  if p_payment_method = 'Mixto' then
    insert into public.invoice_payment_splits (
      payment_id, payment_method, amount, reference
    )
    select
      v_payment_id,
      value->>'payment_method',
      round((value->>'amount')::numeric, 2),
      nullif(btrim(coalesce(value->>'reference', '')), '')
    from jsonb_array_elements(p_payment_splits);
  else
    insert into public.invoice_payment_splits (
      payment_id, payment_method, amount, reference
    ) values (
      v_payment_id, p_payment_method, round(p_amount, 2),
      nullif(btrim(p_reference), '')
    );
  end if;

  v_paid := round(v_paid + p_amount, 2);
  select case
    when bool_or(payment_method = 'Mixto') or count(distinct payment_method) > 1
      then 'Mixto'
    else min(payment_method)
  end
  into v_invoice_payment_method
  from public.invoice_payments
  where invoice_id = v_invoice.id and status = 'Aplicado';

  v_new_status := case
    when v_paid >= v_adjusted_total then 'Pagada'
    when v_invoice.due_date < current_date then 'Vencida'
    else 'Parcialmente Pagada'
  end;

  update public.invoices
  set status = v_new_status,
      paid_date = case when v_new_status = 'Pagada' then p_payment_date else null end,
      payment_method = case when v_new_status = 'Pagada' then v_invoice_payment_method else payment_method end,
      payment_reference = case
        when v_new_status = 'Pagada' and v_invoice_payment_method = 'Mixto' then null
        when v_new_status = 'Pagada' then nullif(btrim(p_reference), '')
        else payment_reference
      end,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_invoice.id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'Facturacion', 'Pago registrado', 'invoice', v_invoice.id,
    'Pago aplicado al documento ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', round(p_amount, 2),
      'currency', p_currency,
      'payment_date', p_payment_date,
      'invoice_fiscal_type', p_invoice_fiscal_type,
      'point_of_sale', btrim(p_point_of_sale),
      'payment_method', p_payment_method,
      'payment_splits', coalesce(p_payment_splits, '[]'::jsonb),
      'adjusted_total', v_adjusted_total,
      'invoice_status', v_new_status
    )
  );

  return query select v_payment_id, v_new_status, v_paid,
    greatest(round(v_adjusted_total - v_paid, 2), 0::numeric);
end;
$$;

revoke all on function public.register_invoice_payment_v2(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.register_invoice_payment_v2(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';

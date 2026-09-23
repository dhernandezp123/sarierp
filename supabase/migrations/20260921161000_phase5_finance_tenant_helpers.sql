-- Fase 5 SaaS: las RPC SECURITY DEFINER y vistas financieras fallan cerradas
-- cuando el registro solicitado no pertenece al tenant autenticado.

create or replace function public.can_access_invoice(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_finance()
    and public.current_tenant_id() is not null
    and exists (
      select 1
      from public.invoices invoice
      where invoice.id = p_invoice_id
        and invoice.tenant_id = public.current_tenant_id()
        and invoice.deleted_at is null
    )
$$;

create or replace function public.can_manage_cost_validation(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing'])
    and public.current_tenant_id() is not null
    and exists (
      select 1
      from public.quotations quotation
      where quotation.id = p_quotation_id
        and quotation.tenant_id = public.current_tenant_id()
        and quotation.deleted_at is null
        and quotation.status = 'Ganada'
    )
$$;

create or replace function public.can_manage_provider_invoice_item(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing', 'Operaciones'])
    and public.current_tenant_id() is not null
    and exists (
      select 1
      from public.quotations quotation
      where quotation.id = p_quotation_id
        and quotation.tenant_id = public.current_tenant_id()
        and quotation.deleted_at is null
        and quotation.status = 'Ganada'
    )
$$;

create or replace function public.can_select_provider_invoice_item(p_quotation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_active_user()
    and public.is_role(array['Admin', 'Contabilidad', 'Pricing', 'Operaciones'])
    and public.current_tenant_id() is not null
    and exists (
      select 1
      from public.quotations quotation
      where quotation.id = p_quotation_id
        and quotation.tenant_id = public.current_tenant_id()
        and quotation.deleted_at is null
        and quotation.status = 'Ganada'
    )
$$;

create or replace function public.activate_cai_range_trusted(p_range_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_range public.cai_ranges%rowtype;
begin
  if auth.uid() is null or v_tenant_id is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para activar rangos CAI'
      using errcode = '42501';
  end if;

  select * into v_range
  from public.cai_ranges
  where id = p_range_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'El rango CAI no existe';
  end if;
  if v_range.fecha_limite_emision < current_date then
    raise exception 'No se puede activar un rango CAI vencido';
  end if;
  if v_range.next_number > v_range.range_end then
    raise exception 'No se puede activar un rango CAI agotado';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('activate_cai_range:' || v_tenant_id::text || ':' || v_range.document_type)
  );

  update public.cai_ranges
  set is_active = false
  where tenant_id = v_tenant_id
    and document_type = v_range.document_type
    and is_active is true
    and id <> p_range_id;

  update public.cai_ranges
  set is_active = true
  where id = p_range_id
    and tenant_id = v_tenant_id;

  return p_range_id;
end;
$$;

-- Mantiene el contrato atomico vigente y agrega tenant explicito a cliente,
-- CAI, notas, documentos e items.
create or replace function public.create_invoice_with_items_trusted(
  p_invoice jsonb,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid := public.current_tenant_id();
  v_invoice_id uuid;
  v_invoice_number text;
  v_invoice_type text := p_invoice->>'invoice_type';
  v_is_fiscal boolean;
  v_issue_date date := coalesce((p_invoice->>'issue_date')::date, current_date);
  v_due_date date := nullif(p_invoice->>'due_date', '')::date;
  v_currency text := coalesce(nullif(p_invoice->>'currency', ''), 'USD');
  v_exchange_rate numeric := coalesce((p_invoice->>'exchange_rate')::numeric, 1);
  v_client public.clientes%rowtype;
  v_cai public.cai_ranges%rowtype;
  v_item jsonb;
  v_description text;
  v_quantity numeric;
  v_unit_price numeric;
  v_rate numeric;
  v_line_amount numeric;
  v_exempt numeric := 0;
  v_taxable_15 numeric := 0;
  v_taxable_18 numeric := 0;
  v_subtotal numeric;
  v_tax_15 numeric;
  v_tax_18 numeric;
  v_tax_total numeric;
  v_total numeric;
  v_sequence bigint;
  v_sequence_key text;
  v_parent public.invoices%rowtype;
  v_quotation_id uuid := nullif(p_invoice->>'quotation_id', '')::uuid;
begin
  if v_user_id is null or v_tenant_id is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturacion'
      using errcode = '42501';
  end if;

  if v_invoice_type not in (
    'Proforma', 'Factura', 'Nota de Crédito', 'Nota de Débito'
  ) then
    raise exception 'Tipo de documento invalido';
  end if;
  if v_currency not in ('USD', 'HNL') then
    raise exception 'Moneda invalida';
  end if;
  if v_currency = 'USD' and v_exchange_rate <= 0 then
    raise exception 'El tipo de cambio debe ser mayor que cero';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El documento debe contener al menos una linea';
  end if;

  select * into v_client
  from public.clientes client
  where client.id = (p_invoice->>'cliente_id')::uuid
    and client.tenant_id = v_tenant_id
    and client.deleted_at is null;

  if not found then
    raise exception 'El cliente no existe o fue eliminado';
  end if;

  if v_quotation_id is not null and not exists (
    select 1 from public.quotations quotation
    where quotation.id = v_quotation_id
      and quotation.tenant_id = v_tenant_id
      and quotation.deleted_at is null
  ) then
    raise exception 'La cotizacion no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  v_is_fiscal := v_invoice_type <> 'Proforma';
  if v_is_fiscal and nullif(btrim(coalesce(v_client.rtn, '')), '') is null then
    raise exception 'El cliente debe tener RTN para emitir un documento fiscal';
  end if;

  if v_invoice_type in ('Nota de Crédito', 'Nota de Débito') then
    if nullif(p_invoice->>'parent_invoice_id', '') is null then
      raise exception 'Las notas requieren un documento fiscal relacionado';
    end if;

    select * into v_parent
    from public.invoices invoice
    where invoice.id = (p_invoice->>'parent_invoice_id')::uuid
      and invoice.tenant_id = v_tenant_id
      and invoice.deleted_at is null
      and invoice.invoice_type = 'Factura';

    if not found or v_parent.cliente_id is distinct from v_client.id then
      raise exception 'El documento relacionado no es una factura valida del cliente';
    end if;
    if nullif(btrim(coalesce(p_invoice->>'motivo', '')), '') is null then
      raise exception 'El motivo es obligatorio para notas de credito o debito';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_rate := coalesce((v_item->>'isv_rate')::numeric, 0);
    if v_description = '' or v_quantity <= 0 or v_unit_price < 0 then
      raise exception 'Las lineas requieren descripcion, cantidad positiva y precio valido';
    end if;
    if v_rate not in (0, 15, 18) then
      raise exception 'La tasa ISV de una linea es invalida';
    end if;

    v_line_amount := round(v_quantity * v_unit_price, 2);
    if v_rate = 0 then
      v_exempt := v_exempt + v_line_amount;
    elsif v_rate = 15 then
      v_taxable_15 := v_taxable_15 + v_line_amount;
    else
      v_taxable_18 := v_taxable_18 + v_line_amount;
    end if;
  end loop;

  v_subtotal := round(v_exempt + v_taxable_15 + v_taxable_18, 2);
  v_tax_15 := round(v_taxable_15 * 0.15, 2);
  v_tax_18 := round(v_taxable_18 * 0.18, 2);
  v_tax_total := v_tax_15 + v_tax_18;
  v_total := v_subtotal + v_tax_total;

  if v_is_fiscal then
    select * into v_cai
    from public.cai_ranges cai
    where cai.tenant_id = v_tenant_id
      and cai.document_type = v_invoice_type
      and cai.is_active is true
    for update;

    if not found then
      raise exception 'No hay un rango CAI activo para %', v_invoice_type;
    end if;
    if v_issue_date > v_cai.fecha_limite_emision then
      raise exception 'El rango CAI esta vencido para la fecha de emision';
    end if;
    if v_cai.next_number > v_cai.range_end then
      raise exception 'El rango CAI para % esta agotado', v_invoice_type;
    end if;

    v_invoice_number := v_cai.number_prefix
      || lpad(v_cai.next_number::text, v_cai.number_width, '0');
    update public.cai_ranges
    set next_number = next_number + 1
    where id = v_cai.id and tenant_id = v_tenant_id;
  else
    v_sequence_key := 'PROFORMA-' || to_char(v_issue_date, 'YYYYMM');
    v_sequence := public.allocate_tenant_document_sequence(
      v_tenant_id, v_sequence_key, 1
    );
    v_invoice_number := 'SARI-PRO-' || to_char(v_issue_date, 'YYYYMM')
      || '-' || lpad(v_sequence::text, 3, '0');
  end if;

  insert into public.invoices (
    tenant_id, invoice_number, invoice_type, status, quotation_id, cliente_id,
    cliente_nombre, cliente_rtn, cliente_direccion, cliente_email,
    issue_date, due_date, subtotal, tax_rate, tax_amount, total,
    currency, exchange_rate, total_lps, notes, motivo, parent_invoice_id,
    created_by, cai, rango_desde, rango_hasta, fecha_limite_emision,
    lugar_emision, es_exonerado, orden_compra_exenta,
    no_constancia_exonerado, no_registro_sag, isv_18_rate,
    isv_18_amount, importe_exento, importe_exonerado
  ) values (
    v_tenant_id, v_invoice_number, v_invoice_type, 'Borrador',
    v_quotation_id, v_client.id,
    v_client.nombre, v_client.rtn, v_client.direccion, v_client.email_1,
    v_issue_date, v_due_date, v_subtotal, 15, v_tax_total, v_total,
    v_currency, v_exchange_rate,
    case when v_currency = 'USD' then round(v_total * v_exchange_rate, 2) else null end,
    nullif(p_invoice->>'notes', ''), nullif(p_invoice->>'motivo', ''),
    nullif(p_invoice->>'parent_invoice_id', '')::uuid, v_user_id,
    case when v_is_fiscal then v_cai.cai else null end,
    case when v_is_fiscal then v_cai.rango_desde else null end,
    case when v_is_fiscal then v_cai.rango_hasta else null end,
    case when v_is_fiscal then v_cai.fecha_limite_emision else null end,
    case when v_is_fiscal then v_cai.lugar_emision else null end,
    coalesce((p_invoice->>'es_exonerado')::boolean, false),
    nullif(p_invoice->>'orden_compra_exenta', ''),
    nullif(p_invoice->>'no_constancia_exonerado', ''),
    nullif(p_invoice->>'no_registro_sag', ''),
    case when v_taxable_18 > 0 then 18 else 0 end,
    v_tax_18, v_exempt, 0
  ) returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(v_item->>'description');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_rate := (v_item->>'isv_rate')::numeric;
    v_line_amount := round(v_quantity * v_unit_price, 2);

    insert into public.invoice_items (
      tenant_id, invoice_id, description, quantity, unit_price, amount,
      sort_order, isv_rate, tax_amount
    ) values (
      v_tenant_id, v_invoice_id, v_description, v_quantity, v_unit_price,
      v_line_amount, coalesce((v_item->>'sort_order')::integer, 0),
      v_rate, round(v_line_amount * v_rate / 100, 2)
    );
  end loop;

  return query select v_invoice_id, v_invoice_number;
end;
$$;

-- Encapsula las RPC existentes sin reescribir su logica contable. El wrapper
-- valida ownership antes de ejecutar el cuerpo atomico ya probado.
alter function public.create_invoice_from_quotation(jsonb, uuid)
  rename to create_invoice_from_quotation_tenant_internal;

create function public.create_invoice_from_quotation(
  p_invoice jsonb,
  p_quotation_id uuid
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not exists (
    select 1 from public.quotations quotation
    where quotation.id = p_quotation_id
      and quotation.tenant_id = v_tenant_id
      and quotation.deleted_at is null
  ) then
    raise exception 'La cotizacion no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  return query
  select result.invoice_id, result.invoice_number
  from public.create_invoice_from_quotation_tenant_internal(
    p_invoice, p_quotation_id
  ) result;
end;
$$;

revoke all on function public.create_invoice_from_quotation_tenant_internal(jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.create_invoice_from_quotation(jsonb, uuid)
  from public, anon;
grant execute on function public.create_invoice_from_quotation(jsonb, uuid)
  to authenticated;

alter function public.create_freight_account_payable(uuid)
  rename to create_freight_account_payable_tenant_internal;

create function public.create_freight_account_payable(p_quotation_id uuid)
returns table (account_payable_id uuid, was_created boolean, provider_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not exists (
    select 1 from public.quotations quotation
    where quotation.id = p_quotation_id
      and quotation.tenant_id = v_tenant_id
      and quotation.deleted_at is null
  ) then
    raise exception 'La cotizacion no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  return query
  select result.account_payable_id, result.was_created, result.provider_name
  from public.create_freight_account_payable_tenant_internal(p_quotation_id) result;
end;
$$;

revoke all on function public.create_freight_account_payable_tenant_internal(uuid)
  from public, anon, authenticated;
revoke all on function public.create_freight_account_payable(uuid)
  from public, anon;
grant execute on function public.create_freight_account_payable(uuid)
  to authenticated;

alter function public.register_invoice_payment(uuid, numeric, text, date, text, text, text)
  rename to register_invoice_payment_tenant_internal;

create function public.register_invoice_payment(
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
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not exists (
    select 1 from public.invoices invoice
    where invoice.id = p_invoice_id
      and invoice.tenant_id = v_tenant_id
      and invoice.deleted_at is null
  ) then
    raise exception 'El documento no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  return query
  select result.payment_id, result.invoice_status,
    result.paid_total, result.pending_balance
  from public.register_invoice_payment_tenant_internal(
    p_invoice_id, p_amount, p_currency, p_payment_date,
    p_payment_method, p_reference, p_notes
  ) result;
end;
$$;

revoke all on function public.register_invoice_payment_tenant_internal(
  uuid, numeric, text, date, text, text, text
) from public, anon, authenticated;
revoke all on function public.register_invoice_payment(
  uuid, numeric, text, date, text, text, text
) from public, anon;
grant execute on function public.register_invoice_payment(
  uuid, numeric, text, date, text, text, text
) to authenticated;

alter function public.register_invoice_payment_v2(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) rename to register_invoice_payment_v2_tenant_internal;

create function public.register_invoice_payment_v2(
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
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not exists (
    select 1 from public.invoices invoice
    where invoice.id = p_invoice_id
      and invoice.tenant_id = v_tenant_id
      and invoice.deleted_at is null
  ) then
    raise exception 'El documento no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoices invoice
    where invoice.id = p_invoice_id
      and invoice.tenant_id = v_tenant_id
      and btrim(p_point_of_sale) = btrim(coalesce(invoice.lugar_emision, ''))
    union all
    select 1 from public.cai_ranges cai
    where cai.tenant_id = v_tenant_id
      and cai.is_active
      and nullif(btrim(coalesce(cai.lugar_emision, '')), '') is not null
      and btrim(cai.lugar_emision) = btrim(p_point_of_sale)
    union all
    select 1 from public.company_settings settings
    where settings.tenant_id = v_tenant_id
      and btrim(p_point_of_sale) in (
        btrim(coalesce(settings.lugar_emision_defecto, '')),
        btrim(coalesce(settings.city, ''))
      )
  ) then
    raise exception 'El punto de venta no pertenece a una ciudad configurada';
  end if;

  return query
  select result.payment_id, result.invoice_status,
    result.paid_total, result.pending_balance
  from public.register_invoice_payment_v2_tenant_internal(
    p_invoice_id, p_amount, p_currency, p_payment_date,
    p_invoice_fiscal_type, p_point_of_sale, p_payment_method,
    p_reference, p_notes, p_payment_splits
  ) result;
end;
$$;

revoke all on function public.register_invoice_payment_v2_tenant_internal(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.register_invoice_payment_v2(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.register_invoice_payment_v2(
  uuid, numeric, text, date, text, text, text, text, text, jsonb
) to authenticated;

alter function public.reverse_invoice_payment(uuid, text)
  rename to reverse_invoice_payment_tenant_internal;

create function public.reverse_invoice_payment(p_payment_id uuid, p_reason text)
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
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null or not exists (
    select 1 from public.invoice_payments payment
    where payment.id = p_payment_id
      and payment.tenant_id = v_tenant_id
  ) then
    raise exception 'El pago no pertenece a la empresa activa'
      using errcode = '42501';
  end if;

  return query
  select result.payment_id, result.invoice_status,
    result.paid_total, result.pending_balance
  from public.reverse_invoice_payment_tenant_internal(p_payment_id, p_reason) result;
end;
$$;

revoke all on function public.reverse_invoice_payment_tenant_internal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.reverse_invoice_payment(uuid, text)
  from public, anon;
grant execute on function public.reverse_invoice_payment(uuid, text)
  to authenticated;

create or replace view public.invoice_receivables
with (security_invoker = true)
as
with balances as (
  select
    invoice.id as invoice_id,
    invoice.invoice_number,
    invoice.cliente_id,
    invoice.cliente_nombre,
    invoice.issue_date,
    invoice.due_date,
    invoice.currency,
    invoice.total as original_total,
    invoice.status as stored_status,
    coalesce(notes.credit_total, 0) as credit_notes,
    coalesce(notes.debit_total, 0) as debit_notes,
    public.invoice_adjusted_total(invoice.id) as adjusted_total,
    coalesce(payments.paid_total, 0) as paid_total
  from public.invoices invoice
  left join lateral (
    select
      coalesce(sum(note.total) filter (
        where note.invoice_type = 'Nota de Crédito'
      ), 0) as credit_total,
      coalesce(sum(note.total) filter (
        where note.invoice_type = 'Nota de Débito'
      ), 0) as debit_total
    from public.invoices note
    where note.tenant_id = invoice.tenant_id
      and note.parent_invoice_id = invoice.id
      and note.deleted_at is null
      and note.status not in ('Borrador', 'Anulada')
  ) notes on true
  left join lateral (
    select coalesce(sum(payment.amount), 0) as paid_total
    from public.invoice_payments payment
    where payment.tenant_id = invoice.tenant_id
      and payment.invoice_id = invoice.id
      and payment.status = 'Aplicado'
  ) payments on true
  where invoice.tenant_id = public.current_tenant_id()
    and invoice.invoice_type = 'Factura'
    and invoice.deleted_at is null
    and invoice.status not in ('Borrador', 'Anulada')
)
select
  invoice_id,
  invoice_number,
  cliente_id,
  cliente_nombre,
  issue_date,
  due_date,
  currency,
  original_total,
  stored_status,
  credit_notes,
  debit_notes,
  adjusted_total,
  paid_total,
  greatest(round(adjusted_total - paid_total, 2), 0::numeric) as balance,
  case
    when adjusted_total <= paid_total and paid_total > 0 then 'Pagada'
    when adjusted_total = 0 then 'Saldada'
    when due_date < current_date then 'Vencida'
    when paid_total > 0 then 'Parcialmente Pagada'
    else stored_status
  end as receivable_status,
  case
    when due_date < current_date and adjusted_total > paid_total
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
  v_tenant_id uuid := public.current_tenant_id();
  v_count integer;
begin
  if auth.uid() is null or v_tenant_id is null or not public.can_manage_finance() then
    raise exception 'No tienes permiso para actualizar cuentas por cobrar'
      using errcode = '42501';
  end if;

  update public.invoices invoice
  set status = receivable.receivable_status,
      paid_date = case
        when receivable.receivable_status = 'Pagada' then invoice.paid_date
        else null
      end,
      updated_at = now()
  from public.invoice_receivables receivable
  where invoice.id = receivable.invoice_id
    and invoice.tenant_id = v_tenant_id
    and invoice.status not in ('Borrador', 'Anulada')
    and invoice.status is distinct from receivable.receivable_status;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Variante interna para triggers o procesos confiables con tenant explicito.
create or replace function public.allocate_internal_hbl_number_for_tenant(
  p_tenant_id uuid,
  p_number_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_tenant uuid := public.current_tenant_id();
  v_date date := coalesce(
    p_number_date,
    timezone('America/Tegucigalpa', clock_timestamp())::date
  );
  v_prefix text := 'SARI-HBL-' || to_char(v_date, 'YYYYMMDD') || '-';
  v_existing_max integer;
  v_next integer;
begin
  if p_tenant_id is null then
    raise exception 'Tenant obligatorio para generar HBL';
  end if;
  if auth.uid() is not null and (
    v_current_tenant is null or p_tenant_id is distinct from v_current_tenant
  ) then
    raise exception 'No se puede consumir un contador HBL de otra empresa'
      using errcode = '42501';
  end if;

  select coalesce(max(
    case
      when substring(bl.bl_number from char_length(v_prefix) + 1) ~ '^[0-9]+$'
        then substring(bl.bl_number from char_length(v_prefix) + 1)::integer
      else null
    end
  ), 0)
  into v_existing_max
  from public.bills_of_lading bl
  where bl.tenant_id = p_tenant_id
    and bl.bl_type = 'HBL'
    and bl.bl_number like v_prefix || '%';

  insert into public.hbl_number_counters as counter (
    tenant_id, number_date, last_value, updated_at
  ) values (
    p_tenant_id, v_date, v_existing_max + 1, clock_timestamp()
  )
  on conflict (tenant_id, number_date) do update
  set last_value = greatest(counter.last_value, excluded.last_value - 1) + 1,
      updated_at = clock_timestamp()
  returning last_value into v_next;

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.allocate_internal_hbl_number(p_number_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null then
    raise exception 'No autorizado para generar HBL' using errcode = '42501';
  end if;
  return public.allocate_internal_hbl_number_for_tenant(v_tenant_id, p_number_date);
end;
$$;

create or replace function public.assign_hbl_number_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := coalesce(
    new.tenant_id,
    (select booking.tenant_id from public.bookings booking where booking.id = new.booking_id),
    public.current_tenant_id()
  );
begin
  if new.bl_type = 'HBL' and nullif(btrim(new.bl_number), '') is null then
    new.bl_number := public.allocate_internal_hbl_number_for_tenant(
      v_tenant_id,
      timezone('America/Tegucigalpa', clock_timestamp())::date
    );
  end if;
  return new;
end;
$$;

revoke all on function public.allocate_internal_hbl_number_for_tenant(uuid, date)
  from public, anon, authenticated;
revoke all on function public.allocate_internal_hbl_number(date)
  from public, anon, authenticated;

comment on function public.allocate_tenant_document_sequence(uuid, text, bigint) is
  'Numerador atomico interno por tenant; no acepta consumo cross-tenant.';
comment on function public.create_invoice_with_items_trusted(jsonb, jsonb) is
  'Crea documento e items atomicos usando cliente, CAI y secuencia del tenant activo.';
comment on view public.invoice_receivables is
  'Cuentas por cobrar calculadas solo para el tenant autenticado.';

notify pgrst, 'reload schema';

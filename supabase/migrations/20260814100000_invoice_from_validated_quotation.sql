-- Facturacion trazable desde cotizaciones con costos validados.

alter table public.invoice_items
  add column if not exists source_pricing_item_id uuid
  references public.pricing_items(id) on delete set null;

create unique index if not exists invoice_items_unique_pricing_source_idx
  on public.invoice_items (invoice_id, source_pricing_item_id)
  where source_pricing_item_id is not null;

create unique index if not exists invoices_one_active_factura_per_quotation_idx
  on public.invoices (quotation_id)
  where quotation_id is not null
    and invoice_type = 'Factura'
    and status <> 'Anulada'
    and deleted_at is null;

create or replace function public.invalidate_quotation_financial_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation_id uuid;
begin
  v_quotation_id := case when tg_op = 'DELETE'
    then old.quotation_id
    else new.quotation_id
  end;

  update public.quotations
  set financial_validation_status = 'Pendiente'
  where id = v_quotation_id
    and financial_validation_status = 'Validado';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists pricing_items_invalidate_financial_validation
  on public.pricing_items;
create trigger pricing_items_invalidate_financial_validation
after insert or delete or update of
  item_type, description, cost_amount, sale_amount, currency, quantity,
  taxable, tax_rate, tax_amount, total_amount, deleted_at
on public.pricing_items
for each row execute function public.invalidate_quotation_financial_validation();

drop trigger if exists provider_items_invalidate_financial_validation
  on public.provider_invoice_items;
create trigger provider_items_invalidate_financial_validation
after insert or delete or update of
  supplier, invoice_number, description, quantity, unit_cost, currency,
  tax_rate_id, tax_amount, total_cost, invoice_date, is_taxable, deleted_at
on public.provider_invoice_items
for each row execute function public.invalidate_quotation_financial_validation();

create or replace function public.guard_quotation_financial_validation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.financial_validation_status = 'Validado'
    and (
      tg_op = 'INSERT'
      or old.financial_validation_status is distinct from 'Validado'
    ) then
    if auth.uid() is null
      or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
      raise exception 'Solo Finanzas o Contabilidad puede validar los costos'
        using errcode = '42501';
    end if;

    if new.status is distinct from 'Ganada' then
      raise exception 'Solo una cotizacion ganada puede validarse para facturacion';
    end if;

    if not exists (
      select 1
      from public.pricing_items pi
      where pi.quotation_id = new.id
        and pi.deleted_at is null
    ) then
      raise exception 'La cotizacion no tiene lineas comerciales para facturar';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_quotation_financial_validation_trigger
  on public.quotations;
create trigger guard_quotation_financial_validation_trigger
before insert or update of financial_validation_status on public.quotations
for each row execute function public.guard_quotation_financial_validation();

create or replace function public.create_manual_invoice_with_items(
  p_invoice jsonb,
  p_items jsonb
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(p_invoice->>'quotation_id', '') is not null then
    raise exception 'Usa el flujo de cotizacion validada para vincular una factura';
  end if;

  return query
  select created.invoice_id, created.invoice_number
  from public.create_invoice_with_items(
    p_invoice - 'quotation_id',
    p_items
  ) created;
end;
$$;

create or replace function public.create_invoice_from_quotation(
  p_invoice jsonb,
  p_quotation_id uuid
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.quotations%rowtype;
  v_items jsonb;
  v_invoice_id uuid;
  v_invoice_number text;
  v_currency text;
begin
  if auth.uid() is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturacion'
      using errcode = '42501';
  end if;

  if p_invoice->>'invoice_type' is distinct from 'Factura' then
    raise exception 'La vinculacion de cotizacion solo aplica a Facturas';
  end if;

  select * into v_quotation
  from public.quotations
  where id = p_quotation_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'La cotizacion no existe o fue eliminada';
  end if;
  if v_quotation.status is distinct from 'Ganada' then
    raise exception 'La cotizacion debe estar Ganada antes de facturar';
  end if;
  if v_quotation.financial_validation_status is distinct from 'Validado' then
    raise exception 'Los costos de la cotizacion deben estar validados antes de facturar';
  end if;
  if nullif(p_invoice->>'cliente_id', '')::uuid is distinct from v_quotation.cliente_id then
    raise exception 'El cliente de la factura no coincide con la cotizacion';
  end if;
  if exists (
    select 1
    from public.invoices i
    where i.quotation_id = p_quotation_id
      and i.invoice_type = 'Factura'
      and i.status <> 'Anulada'
      and i.deleted_at is null
  ) then
    raise exception 'La cotizacion ya tiene una factura activa';
  end if;
  if exists (
    select 1
    from public.pricing_items pi
    where pi.quotation_id = p_quotation_id
      and pi.deleted_at is null
      and (
        nullif(btrim(pi.description), '') is null
        or coalesce(pi.quantity, 0) <= 0
        or coalesce(pi.sale_amount, -1) < 0
        or (case when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0) else 0 end)
          not in (0, 15, 18)
      )
  ) then
    raise exception 'La cotizacion contiene lineas no facturables; revisa cantidad, precio e ISV';
  end if;

  select
    case when count(distinct coalesce(nullif(currency, ''), 'USD')) = 1
      then min(coalesce(nullif(currency, ''), 'USD'))
      else null
    end,
    jsonb_agg(
      jsonb_build_object(
        'source_pricing_item_id', source_pricing_item_id,
        'description', description,
        'quantity', quantity,
        'unit_price', unit_price,
        'isv_rate', isv_rate,
        'sort_order', sort_order
      ) order by sort_order
    )
  into v_currency, v_items
  from (
    select
      pi.id as source_pricing_item_id,
      pi.description,
      pi.quantity,
      pi.sale_amount as unit_price,
      case when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0) else 0 end as isv_rate,
      row_number() over (order by pi.created_at, pi.id)::integer - 1 as sort_order,
      pi.currency
    from public.pricing_items pi
    where pi.quotation_id = p_quotation_id
      and pi.deleted_at is null
  ) source_lines;

  if v_items is null or jsonb_array_length(v_items) = 0 then
    raise exception 'La cotizacion no tiene lineas comerciales para facturar';
  end if;
  if v_currency is null or v_currency not in ('USD', 'HNL') then
    raise exception 'Todas las lineas de la cotizacion deben usar una sola moneda valida';
  end if;
  if coalesce(nullif(p_invoice->>'currency', ''), 'USD') is distinct from v_currency then
    raise exception 'La moneda de la factura debe coincidir con las lineas de la cotizacion';
  end if;

  select created.invoice_id, created.invoice_number
  into v_invoice_id, v_invoice_number
  from public.create_invoice_with_items(
    p_invoice || jsonb_build_object('quotation_id', p_quotation_id),
    v_items
  ) created;

  update public.invoice_items ii
  set source_pricing_item_id = (line.value->>'source_pricing_item_id')::uuid
  from jsonb_array_elements(v_items) line(value)
  where ii.invoice_id = v_invoice_id
    and ii.sort_order = (line.value->>'sort_order')::integer;

  return query select v_invoice_id, v_invoice_number;
end;
$$;

revoke all on function public.create_invoice_with_items(jsonb, jsonb)
  from authenticated;
revoke all on function public.create_manual_invoice_with_items(jsonb, jsonb)
  from public, anon;
revoke all on function public.create_invoice_from_quotation(jsonb, uuid)
  from public, anon;

grant execute on function public.create_manual_invoice_with_items(jsonb, jsonb)
  to authenticated;
grant execute on function public.create_invoice_from_quotation(jsonb, uuid)
  to authenticated;

notify pgrst, 'reload schema';

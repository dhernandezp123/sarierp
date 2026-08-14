-- Demo conserva el flujo cotizacion -> documento -> cobro sin emitir facturas fiscales.

create unique index if not exists invoices_one_active_demo_document_per_quotation_idx
  on public.invoices (quotation_id)
  where quotation_id is not null
    and invoice_type in ('Factura', 'Proforma')
    and status <> 'Anulada'
    and deleted_at is null;

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
  v_is_restricted_demo boolean := public.is_restricted_demo_context();
  v_required_document_type text;
begin
  if auth.uid() is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturacion'
      using errcode = '42501';
  end if;

  v_required_document_type := case
    when v_is_restricted_demo then 'Proforma'
    else 'Factura'
  end;

  if p_invoice->>'invoice_type' is distinct from v_required_document_type then
    raise exception 'El ambiente actual requiere un documento de tipo %',
      v_required_document_type;
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
    raise exception 'El cliente del documento no coincide con la cotizacion';
  end if;
  if exists (
    select 1
    from public.invoices i
    where i.quotation_id = p_quotation_id
      and (
        (v_is_restricted_demo and i.invoice_type in ('Factura', 'Proforma'))
        or (not v_is_restricted_demo and i.invoice_type = 'Factura')
      )
      and i.status <> 'Anulada'
      and i.deleted_at is null
  ) then
    raise exception 'La cotizacion ya tiene un documento activo';
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
    raise exception 'La moneda del documento debe coincidir con las lineas de la cotizacion';
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

revoke all on function public.create_invoice_from_quotation(jsonb, uuid)
  from public, anon;
grant execute on function public.create_invoice_from_quotation(jsonb, uuid)
  to authenticated;

notify pgrst, 'reload schema';

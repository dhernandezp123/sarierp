-- BILL-POS-01: CAI y correlativos independientes por oficina, tenant y tipo.
alter table public.company_settings
  add column billing_points_of_sale text[] not null default array['Principal'];
update public.company_settings
set billing_points_of_sale = array['San Pedro Sula', 'Tegucigalpa']
where tenant_id = '00000000-0000-4000-8000-000000000001';

create function public.get_billing_points_of_sale()
returns text[] language sql stable security definer set search_path = public as $$
  select case when public.is_approved_active_user() and public.current_tenant_id() is not null
    then coalesce(
      (select settings.billing_points_of_sale from public.company_settings settings
       where settings.tenant_id = public.current_tenant_id()),
      case when public.current_tenant_id() = '00000000-0000-4000-8000-000000000001'::uuid
        then array['San Pedro Sula', 'Tegucigalpa'] else array['Principal'] end
    ) else array[]::text[] end
$$;
revoke all on function public.get_billing_points_of_sale() from public, anon;
grant execute on function public.get_billing_points_of_sale() to authenticated, service_role;

alter table public.cai_ranges add column point_of_sale text;
update public.cai_ranges
set point_of_sale = case when tenant_id = '00000000-0000-4000-8000-000000000001'::uuid
  then 'San Pedro Sula' else 'Principal' end;
alter table public.cai_ranges alter column point_of_sale set not null;
alter table public.invoices add column point_of_sale text;
-- Los documentos existentes conservan íntegros su CAI, número y snapshot.

create function public.guard_billing_points_of_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if cardinality(new.billing_points_of_sale) = 0 or exists (
    select 1 from unnest(new.billing_points_of_sale) point
    where point is null or point <> btrim(point) or length(point) not between 1 and 120
  ) or (select count(distinct lower(point)) <> count(*) from unnest(new.billing_points_of_sale) point) then
    raise exception 'Los puntos de venta requieren nombres únicos de 1 a 120 caracteres';
  end if;
  if exists (
    select 1 from public.cai_ranges cai where cai.tenant_id = new.tenant_id
      and not (cai.point_of_sale = any(new.billing_points_of_sale))
  ) then
    raise exception 'No puedes quitar o renombrar un punto de venta que tiene rangos CAI registrados';
  end if;
  return new;
end;
$$;
create trigger guard_billing_points_of_sale
before insert or update of billing_points_of_sale on public.company_settings
for each row execute function public.guard_billing_points_of_sale();

create function public.prepare_cai_point_of_sale()
returns trigger language plpgsql security definer set search_path = public as $$
declare points text[];
begin
  select settings.billing_points_of_sale into points from public.company_settings settings
  where settings.tenant_id = new.tenant_id;
  points := coalesce(points, case when new.tenant_id = '00000000-0000-4000-8000-000000000001'::uuid
    then array['San Pedro Sula', 'Tegucigalpa'] else array['Principal'] end);
  new.point_of_sale := coalesce(nullif(btrim(new.point_of_sale), ''), points[1]);
  if not (new.point_of_sale = any(points)) then
    raise exception 'El punto de venta no está configurado para esta empresa';
  end if;
  if tg_op = 'UPDATE' and new.point_of_sale is distinct from old.point_of_sale then
    raise exception 'El punto de venta de un rango CAI registrado no se puede cambiar';
  end if;
  new.lugar_emision := coalesce(nullif(btrim(new.lugar_emision), ''), new.point_of_sale);
  return new;
end;
$$;
-- tenant_guard corre antes de zz_cai_point_of_sale y deriva el tenant de sesión.
create trigger zz_cai_point_of_sale
before insert or update on public.cai_ranges
for each row execute function public.prepare_cai_point_of_sale();

create function public.preserve_invoice_point_of_sale()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.point_of_sale is distinct from old.point_of_sale then
    raise exception 'El punto de venta de un documento numerado no se puede cambiar';
  end if;
  return new;
end;
$$;
create trigger preserve_invoice_point_of_sale before update of point_of_sale on public.invoices
for each row execute function public.preserve_invoice_point_of_sale();

revoke all on function public.guard_billing_points_of_sale(),
  public.prepare_cai_point_of_sale(), public.preserve_invoice_point_of_sale()
  from public, anon, authenticated;

drop index public.cai_ranges_one_active_per_tenant_document_type_idx;
create unique index cai_ranges_one_active_per_tenant_point_document_idx
  on public.cai_ranges(tenant_id, point_of_sale, document_type) where is_active;

create or replace function public.activate_cai_range_trusted(p_range_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_range public.cai_ranges%rowtype;
begin
  if auth.uid() is null or v_tenant_id is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para activar rangos CAI' using errcode = '42501';
  end if;
  select * into v_range from public.cai_ranges
  where id = p_range_id and tenant_id = v_tenant_id;
  if not found then raise exception 'El rango CAI no existe'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'cai:' || v_tenant_id::text || ':' || v_range.point_of_sale || ':' || v_range.document_type, 0));
  select * into v_range from public.cai_ranges
  where id = p_range_id and tenant_id = v_tenant_id for update;
  if not found then raise exception 'El rango CAI no existe'; end if;
  if v_range.fecha_limite_emision < current_date then raise exception 'No se puede activar un rango CAI vencido'; end if;
  if v_range.next_number > v_range.range_end then raise exception 'No se puede activar un rango CAI agotado'; end if;
  update public.cai_ranges set is_active = false
  where tenant_id = v_tenant_id and point_of_sale = v_range.point_of_sale
    and document_type = v_range.document_type and is_active and id <> p_range_id;
  update public.cai_ranges set is_active = true where id = p_range_id and tenant_id = v_tenant_id;
  return p_range_id;
end;
$$;

create or replace function public.activate_cai_range(p_range_id uuid)
returns uuid language sql security definer set search_path = public as $$
  select public.activate_cai_range_trusted(p_range_id)
$$;

-- Conserva la transacción de emisión, impuestos e items; selecciona CAI por oficina.
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
  v_point_of_sale text := nullif(btrim(p_invoice->>'point_of_sale'), '');
  v_points text[];
  v_parent_point text;
begin
  if v_user_id is null or v_tenant_id is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturacion'
      using errcode = '42501';
  end if;

  v_points := public.get_billing_points_of_sale();
  v_point_of_sale := coalesce(v_point_of_sale, v_points[1]);
  if v_point_of_sale is null or not (v_point_of_sale = any(v_points)) then
    raise exception 'Selecciona un punto de venta configurado para esta empresa';
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
    v_parent_point := v_parent.point_of_sale;
    if v_parent_point is null then
      select cai.point_of_sale into v_parent_point from public.cai_ranges cai
      where cai.tenant_id = v_tenant_id and cai.cai = v_parent.cai
        and cai.rango_desde = v_parent.rango_desde
      order by cai.created_at limit 1;
    end if;
    v_parent_point := coalesce(v_parent_point, v_points[1]);
    if nullif(btrim(p_invoice->>'point_of_sale'), '') is null then v_point_of_sale := v_parent_point; end if;
    if v_point_of_sale is distinct from v_parent_point then
      raise exception 'La nota debe emitirse en el punto de venta de la factura relacionada';
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
    perform pg_advisory_xact_lock(hashtextextended(
      'cai:' || v_tenant_id::text || ':' || v_point_of_sale || ':' || v_invoice_type, 0));
    select * into v_cai
    from public.cai_ranges cai
    where cai.tenant_id = v_tenant_id
      and cai.point_of_sale = v_point_of_sale
      and cai.document_type = v_invoice_type
      and cai.is_active is true
    for update;

    if not found then
      raise exception 'No hay un rango CAI activo para % en %', v_invoice_type, v_point_of_sale;
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
    lugar_emision, point_of_sale, es_exonerado, orden_compra_exenta,
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
    v_point_of_sale,
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



-- Permite registrar el próximo correlativo si la oficina ya utilizó parte del rango.
create or replace function public.prepare_cai_range_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prefix text;
  v_end_prefix text;
  v_start_text text;
  v_end_text text;
begin
  v_prefix := substring(new.rango_desde from '^(.*-)[0-9]+$');
  v_end_prefix := substring(new.rango_hasta from '^(.*-)[0-9]+$');
  v_start_text := substring(new.rango_desde from '([0-9]+)$');
  v_end_text := substring(new.rango_hasta from '([0-9]+)$');

  if v_prefix is null
    or v_end_prefix is null
    or v_prefix <> v_end_prefix
    or v_start_text is null
    or v_end_text is null then
    raise exception 'El formato de rango CAI es inválido o sus prefijos no coinciden';
  end if;

  new.number_prefix := v_prefix;
  new.number_width := length(v_start_text);
  new.range_start := v_start_text::bigint;
  new.range_end := v_end_text::bigint;

  if new.range_start > new.range_end then
    raise exception 'El inicio del rango CAI no puede ser mayor que el final';
  end if;

  if new.next_number is null then
    new.next_number := new.range_start;
  elsif new.next_number < new.range_start
    or new.next_number > new.range_end + 1 then
    raise exception 'El correlativo actual está fuera del rango CAI';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

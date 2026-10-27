-- FIN-01 / etapa 1. No asigna oficinas a clientes por inferencia geográfica.
create table public.billing_offices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  establishment_code text not null default '' check (establishment_code = '' or establishment_code ~ '^[0-9]{3}$'),
  emission_point_code text not null default '' check (emission_point_code = '' or emission_point_code ~ '^[0-9]{3}$'),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(tenant_id, id), unique(tenant_id, name)
);
alter table public.billing_offices enable row level security;
revoke all on public.billing_offices from public, anon, authenticated;
grant select, insert, update on public.billing_offices to authenticated;
create policy billing_offices_read on public.billing_offices for select to authenticated
using (tenant_id = public.current_tenant_id() and public.is_approved_active_user()
  and public.is_role(array['Admin','Ventas','Pricing','Operaciones','Contabilidad','Finanzas']));
create policy billing_offices_insert on public.billing_offices for insert to authenticated
with check (tenant_id = public.current_tenant_id() and public.is_approved_active_user()
  and public.is_role(array['Admin','Contabilidad']));
create policy billing_offices_update on public.billing_offices for update to authenticated
using (tenant_id = public.current_tenant_id() and public.is_approved_active_user()
  and public.is_role(array['Admin','Contabilidad']))
with check (tenant_id = public.current_tenant_id() and public.is_approved_active_user()
  and public.is_role(array['Admin','Contabilidad']));

insert into public.billing_offices(tenant_id, name)
select s.tenant_id, p.name from public.company_settings s,
lateral unnest(s.billing_points_of_sale) p(name);
-- No copia domicilio de SPS a TGU: cada ficha debe revisarse antes de emitir.
alter table public.clientes add column billing_office_id uuid;
alter table public.clientes add constraint clientes_billing_office_fk
foreign key(tenant_id, billing_office_id) references public.billing_offices(tenant_id,id);
alter table public.invoices add column billing_office_id uuid;
alter table public.invoices add column issuer_snapshot jsonb;
alter table public.invoices add constraint invoices_billing_office_fk
foreign key(tenant_id, billing_office_id) references public.billing_offices(tenant_id,id);

create function public.guard_billing_office()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.tenant_id <> old.tenant_id or new.id <> old.id) then
    raise exception 'La identidad de la oficina no puede cambiar';
  end if;
  if tg_op = 'UPDATE' and new.name <> old.name and (
    exists(select 1 from public.cai_ranges where tenant_id=old.tenant_id and point_of_sale=old.name)
    or exists(select 1 from public.invoices where tenant_id=old.tenant_id and billing_office_id=old.id)
  ) then raise exception 'La oficina con documentos o CAI conserva su nombre'; end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger billing_office_guard before update on public.billing_offices
for each row execute function public.guard_billing_office();

create function public.sync_billing_office_names()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.company_settings set billing_points_of_sale = (
    select array_agg(name order by name) from public.billing_offices where tenant_id=new.tenant_id
  ) where tenant_id=new.tenant_id;
  return new;
end $$;
create trigger billing_office_sync after insert or update of name on public.billing_offices
for each row execute function public.sync_billing_office_names();

create or replace function public.get_billing_points_of_sale()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(name order by name), array[]::text[])
  from public.billing_offices where tenant_id=public.current_tenant_id() and is_active
    and public.is_approved_active_user()
    and public.is_role(array['Admin','Ventas','Pricing','Operaciones','Contabilidad','Finanzas'])
$$;

create function public.capture_invoice_issuer()
returns trigger language plpgsql security definer set search_path = public as $$
declare office public.billing_offices%rowtype; settings public.company_settings%rowtype;
begin
  if tg_op='UPDATE' then
    if new.issuer_snapshot is distinct from old.issuer_snapshot
      or new.billing_office_id is distinct from old.billing_office_id then
      raise exception 'El emisor de un documento numerado no puede cambiar';
    end if;
    return new;
  end if;
  if new.invoice_type in ('Nota de Crédito','Nota de Débito') then
    select billing_office_id into new.billing_office_id from public.invoices
    where id=new.parent_invoice_id and tenant_id=new.tenant_id;
    if new.billing_office_id is null then
      select id into new.billing_office_id from public.billing_offices
      where tenant_id=new.tenant_id and name=new.point_of_sale;
    end if;
  else
    select billing_office_id into new.billing_office_id from public.clientes
    where id=new.cliente_id and tenant_id=new.tenant_id;
  end if;
  select * into office from public.billing_offices
  where id=new.billing_office_id and tenant_id=new.tenant_id and is_active;
  if not found then raise exception 'Asigna una oficina de facturación activa al cliente'; end if;
  if office.name is distinct from new.point_of_sale then
    raise exception 'La factura debe usar la oficina asignada al cliente';
  end if;
  select * into settings from public.company_settings where tenant_id=new.tenant_id;
  if nullif(btrim(settings.legal_name),'') is null or nullif(btrim(settings.rtn),'') is null
    or nullif(btrim(settings.address),'') is null or nullif(btrim(office.address),'') is null
    or nullif(btrim(office.phone),'') is null or nullif(btrim(office.email),'') is null
    or office.establishment_code='' or office.emission_point_code='' then
    raise exception 'Completa nombre, RTN y domicilio fiscal de empresa y dirección, teléfono, correo y códigos SAR de la oficina';
  end if;
  if new.cai is not null and left(new.invoice_number,7) <>
    office.establishment_code || '-' || office.emission_point_code then
    raise exception 'El prefijo CAI no corresponde a los códigos SAR de la oficina';
  end if;
  new.issuer_snapshot := jsonb_build_object('legal_name',settings.legal_name,
    'trade_name',settings.trade_name,'rtn',settings.rtn,'fiscal_address',settings.address,
    'address',office.address,'phone',office.phone,'email',office.email,
    'office_name',office.name,'invoice_footer_note',settings.invoice_footer_note);
  return new;
end $$;
create trigger zz_invoice_issuer before insert or update on public.invoices
for each row execute function public.capture_invoice_issuer();

alter table public.cai_ranges drop constraint cai_ranges_document_type_check;
alter table public.cai_ranges add constraint cai_ranges_document_type_check check
(document_type in ('Factura','Nota de Crédito','Nota de Débito','Boleta de Compra','Comprobante de Retención','Guía de Remisión'));

create function public.validate_fiscal_range_format()
returns trigger language plpgsql set search_path = public as $$
declare code text;
begin
  if tg_op='UPDATE' and new.rango_desde=old.rango_desde and new.rango_hasta=old.rango_hasta
    and new.document_type=old.document_type then return new; end if;
  code := case new.document_type when 'Factura' then '01' when 'Nota de Crédito' then '06'
    when 'Nota de Débito' then '07' when 'Boleta de Compra' then '11'
    when 'Comprobante de Retención' then '05' when 'Guía de Remisión' then '08' end;
  if new.rango_desde !~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}-[0-9]{8}$'
    or new.rango_hasta !~ '^[0-9]{3}-[0-9]{3}-[0-9]{2}-[0-9]{8}$'
    or substring(new.rango_desde,9,2) is distinct from code
    or substring(new.rango_hasta,9,2) is distinct from code then
    raise exception 'Formato SAR inválido: verifica establecimiento, punto, tipo y ocho dígitos correlativos';
  end if;
  return new;
end $$;
create trigger fiscal_range_format before insert or update on public.cai_ranges
for each row execute function public.validate_fiscal_range_format();

revoke all on function public.guard_billing_office(), public.sync_billing_office_names(),
  public.capture_invoice_issuer(), public.validate_fiscal_range_format() from public,anon,authenticated;

notify pgrst, 'reload schema';

alter table public.company_settings
  add column usa_legal_name text not null default '',
  add column usa_address text not null default '',
  add column usa_phone text not null default '',
  add column usa_email text not null default '',
  add column usa_website text not null default '';

create function public.capture_manual_invoice_issuer()
returns trigger language plpgsql security definer set search_path=public as $$
declare settings public.company_settings%rowtype;
begin
  select * into settings from public.company_settings where tenant_id=new.tenant_id;
  if nullif(btrim(settings.usa_legal_name),'') is null or nullif(btrim(settings.usa_address),'') is null
    or nullif(btrim(settings.usa_phone),'') is null or nullif(btrim(settings.usa_email),'') is null then
    raise exception 'Completa el emisor SARI USA en Configuración de empresa';
  end if;
  new.data := jsonb_set(new.data,'{issuer}',jsonb_build_object('name',settings.usa_legal_name,
    'address',settings.usa_address,'phone',settings.usa_phone,'email',settings.usa_email,'website',settings.usa_website));
  return new;
end $$;
create trigger zz_manual_invoice_issuer before insert on public.manual_invoices
for each row execute function public.capture_manual_invoice_issuer();
revoke all on function public.capture_manual_invoice_issuer() from public,anon,authenticated;

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

  if v_invoice_type not in ('Nota de Crédito', 'Nota de Débito') then
    select name into v_parent_point from public.billing_offices
    where id=v_client.billing_office_id and tenant_id=v_tenant_id and is_active;
    if not found then raise exception 'Asigna una oficina de facturación activa al cliente'; end if;
    if nullif(btrim(p_invoice->>'point_of_sale'),'') is not null
      and p_invoice->>'point_of_sale' <> v_parent_point then
      raise exception 'La factura debe usar la oficina asignada al cliente';
    end if;
    v_point_of_sale := v_parent_point;
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

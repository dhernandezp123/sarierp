-- Fase 4: rangos CAI tipados, correlativo persistente y activación atómica.

alter table public.cai_ranges
  add column if not exists document_type text not null default 'Factura',
  add column if not exists number_prefix text,
  add column if not exists number_width integer,
  add column if not exists range_start bigint,
  add column if not exists range_end bigint,
  add column if not exists next_number bigint;

update public.cai_ranges cr
set
  number_prefix = substring(cr.rango_desde from '^(.*-)[0-9]+$'),
  number_width = length(substring(cr.rango_desde from '([0-9]+)$')),
  range_start = substring(cr.rango_desde from '([0-9]+)$')::bigint,
  range_end = substring(cr.rango_hasta from '([0-9]+)$')::bigint
where cr.number_prefix is null
   or cr.number_width is null
   or cr.range_start is null
   or cr.range_end is null;

update public.cai_ranges cr
set next_number = greatest(
  cr.range_start,
  coalesce((
    select max(substring(i.invoice_number from '([0-9]+)$')::bigint) + 1
    from public.invoices i
    where i.cai = cr.cai
      and i.invoice_number ~ '^.*-[0-9]+$'
      and i.deleted_at is null
  ), cr.range_start)
)
where cr.next_number is null;

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

  if tg_op = 'INSERT' or new.next_number is null then
    new.next_number := new.range_start;
  elsif new.next_number < new.range_start
    or new.next_number > new.range_end + 1 then
    raise exception 'El correlativo actual está fuera del rango CAI';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_cai_range_metadata_trigger
  on public.cai_ranges;
create trigger prepare_cai_range_metadata_trigger
before insert or update of rango_desde, rango_hasta, next_number
on public.cai_ranges
for each row execute function public.prepare_cai_range_metadata();

alter table public.cai_ranges
  alter column number_prefix set not null,
  alter column number_width set not null,
  alter column range_start set not null,
  alter column range_end set not null,
  alter column next_number set not null;

alter table public.cai_ranges
  add constraint cai_ranges_document_type_check
  check (document_type in ('Factura', 'Nota de Crédito', 'Nota de Débito'));

alter table public.cai_ranges
  add constraint cai_ranges_numeric_bounds_check
  check (
    range_start >= 0
    and range_end >= range_start
    and next_number between range_start and range_end + 1
    and number_width > 0
  );

create unique index if not exists cai_ranges_one_active_per_document_type_idx
  on public.cai_ranges (document_type)
  where is_active is true;

create or replace function public.activate_cai_range(p_range_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_range public.cai_ranges%rowtype;
begin
  if auth.uid() is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para activar rangos CAI'
      using errcode = '42501';
  end if;

  select * into v_range
  from public.cai_ranges
  where id = p_range_id
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
    hashtext('activate_cai_range:' || v_range.document_type)
  );

  update public.cai_ranges
  set is_active = false
  where document_type = v_range.document_type
    and is_active is true
    and id <> p_range_id;

  update public.cai_ranges
  set is_active = true
  where id = p_range_id;

  return p_range_id;
end;
$$;

revoke all on function public.activate_cai_range(uuid) from public, anon;
grant execute on function public.activate_cai_range(uuid) to authenticated;

alter table public.invoice_items
  add column if not exists isv_rate numeric(5,2) not null default 0,
  add column if not exists tax_amount numeric(14,2) not null default 0;

alter table public.invoice_items
  add constraint invoice_items_isv_rate_check
  check (isv_rate in (0, 15, 18));

create table if not exists public.document_sequences (
  sequence_key text primary key,
  next_value bigint not null check (next_value > 0)
);

revoke all on table public.document_sequences from public, anon, authenticated;

create or replace function public.create_invoice_with_items(
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
begin
  if v_user_id is null
    or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No tienes permiso para crear documentos de facturación'
      using errcode = '42501';
  end if;

  if v_invoice_type not in (
    'Proforma', 'Factura', 'Nota de Crédito', 'Nota de Débito'
  ) then
    raise exception 'Tipo de documento inválido';
  end if;

  if v_currency not in ('USD', 'HNL') then
    raise exception 'Moneda inválida';
  end if;

  if v_currency = 'USD' and v_exchange_rate <= 0 then
    raise exception 'El tipo de cambio debe ser mayor que cero';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El documento debe contener al menos una línea';
  end if;

  select * into v_client
  from public.clientes
  where id = (p_invoice->>'cliente_id')::uuid
    and deleted_at is null;

  if not found then
    raise exception 'El cliente no existe o fue eliminado';
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
    from public.invoices
    where id = (p_invoice->>'parent_invoice_id')::uuid
      and deleted_at is null
      and invoice_type = 'Factura';

    if not found or v_parent.cliente_id is distinct from v_client.id then
      raise exception 'El documento relacionado no es una factura válida del cliente';
    end if;

    if nullif(btrim(coalesce(p_invoice->>'motivo', '')), '') is null then
      raise exception 'El motivo es obligatorio para notas de crédito o débito';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_rate := coalesce((v_item->>'isv_rate')::numeric, 0);

    if v_description = '' or v_quantity <= 0 or v_unit_price < 0 then
      raise exception 'Las líneas requieren descripción, cantidad positiva y precio válido';
    end if;

    if v_rate not in (0, 15, 18) then
      raise exception 'La tasa ISV de una línea es inválida';
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
    from public.cai_ranges
    where document_type = v_invoice_type
      and is_active is true
    for update;

    if not found then
      raise exception 'No hay un rango CAI activo para %', v_invoice_type;
    end if;

    if v_issue_date > v_cai.fecha_limite_emision then
      raise exception 'El rango CAI está vencido para la fecha de emisión';
    end if;

    if v_cai.next_number > v_cai.range_end then
      raise exception 'El rango CAI para % está agotado', v_invoice_type;
    end if;

    v_invoice_number := v_cai.number_prefix
      || lpad(v_cai.next_number::text, v_cai.number_width, '0');

    update public.cai_ranges
    set next_number = next_number + 1
    where id = v_cai.id;
  else
    v_sequence_key := 'PROFORMA-' || to_char(v_issue_date, 'YYYYMM');

    insert into public.document_sequences (sequence_key, next_value)
    values (v_sequence_key, 2)
    on conflict (sequence_key) do update
      set next_value = public.document_sequences.next_value + 1
    returning next_value - 1 into v_sequence;

    v_invoice_number := 'SARI-PRO-'
      || to_char(v_issue_date, 'YYYYMM')
      || '-'
      || lpad(v_sequence::text, 3, '0');
  end if;

  insert into public.invoices (
    invoice_number, invoice_type, status, quotation_id, cliente_id,
    cliente_nombre, cliente_rtn, cliente_direccion, cliente_email,
    issue_date, due_date, subtotal, tax_rate, tax_amount, total,
    currency, exchange_rate, total_lps, notes, motivo, parent_invoice_id,
    created_by, cai, rango_desde, rango_hasta, fecha_limite_emision,
    lugar_emision, es_exonerado, orden_compra_exenta,
    no_constancia_exonerado, no_registro_sag, isv_18_rate,
    isv_18_amount, importe_exento, importe_exonerado
  )
  values (
    v_invoice_number, v_invoice_type, 'Borrador',
    nullif(p_invoice->>'quotation_id', '')::uuid, v_client.id,
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
  )
  returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(v_item->>'description');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_rate := (v_item->>'isv_rate')::numeric;
    v_line_amount := round(v_quantity * v_unit_price, 2);

    insert into public.invoice_items (
      invoice_id, description, quantity, unit_price, amount,
      sort_order, isv_rate, tax_amount
    )
    values (
      v_invoice_id, v_description, v_quantity, v_unit_price, v_line_amount,
      coalesce((v_item->>'sort_order')::integer, 0), v_rate,
      round(v_line_amount * v_rate / 100, 2)
    );
  end loop;

  return query select v_invoice_id, v_invoice_number;
end;
$$;

revoke all on function public.create_invoice_with_items(jsonb, jsonb)
  from public, anon;
grant execute on function public.create_invoice_with_items(jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

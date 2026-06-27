-- Fase 5: creacion atomica de cotizacion con tablas hijas.

create or replace function public.create_quotation_with_child_lines(
  p_quotation_data jsonb,
  p_container_lines jsonb default '[]'::jsonb,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_pricing_items jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  quotation_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quotation_id uuid := coalesce((p_quotation_data->>'id')::uuid, gen_random_uuid());
  v_quotation_number text;
  v_item jsonb;
begin
  if v_user_id is null
    or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No tienes permiso para crear cotizaciones'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_container_lines, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_cargo_lines, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_pricing_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Los detalles de cotizacion deben enviarse como arreglos';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_container_lines, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'container_type_name', '')), '') is null
      or coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
      raise exception 'Las lineas de contenedor contienen valores invalidos';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_cargo_lines, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'package_type', '')), '') is null
      or coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
      raise exception 'Las lineas de carga contienen valores invalidos';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_pricing_items, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'description', '')), '') is null
      or coalesce((v_item->>'quantity')::numeric, 0) <= 0
      or coalesce((v_item->>'cost_amount')::numeric, 0) < 0
      or coalesce((v_item->>'sale_amount')::numeric, 0) < 0
      or coalesce((v_item->>'tax_amount')::numeric, 0) < 0
      or coalesce((v_item->>'total_amount')::numeric, 0) < 0 then
      raise exception 'Los cargos de pricing contienen valores invalidos';
    end if;
  end loop;

  insert into public.quotations (
    id, cliente_id, created_by, status, incoterm, tipo_transporte,
    origen, destino, puerto_origen, puerto_destino, peso_kg,
    volumen_cbm, cantidad_bultos, observaciones, valid_until,
    contact_name, contact_email, contact_phone, container_type,
    gross_weight, commodity, quote_type, pickup_address,
    commercial_value, requires_insurance, fob_value, freight_value,
    insurance_markup_percentage, insurance_rate, insurance_cost,
    preferred_carrier, target_rate, transit_time, delivery_address,
    container_qty, package_type, package_details, pricing_notes,
    service_product, trade_direction, peso_lbs, volumen_ft3,
    duplicated_from, client_notes, created_at
  ) values (
    v_quotation_id,
    nullif(p_quotation_data->>'cliente_id', '')::uuid,
    v_user_id,
    coalesce(nullif(p_quotation_data->>'status', ''), 'Solicitud'),
    nullif(p_quotation_data->>'incoterm', ''),
    nullif(p_quotation_data->>'tipo_transporte', ''),
    nullif(p_quotation_data->>'origen', ''),
    nullif(p_quotation_data->>'destino', ''),
    nullif(p_quotation_data->>'puerto_origen', ''),
    nullif(p_quotation_data->>'puerto_destino', ''),
    nullif(p_quotation_data->>'peso_kg', '')::numeric,
    nullif(p_quotation_data->>'volumen_cbm', '')::numeric,
    nullif(p_quotation_data->>'cantidad_bultos', '')::integer,
    nullif(p_quotation_data->>'observaciones', ''),
    nullif(p_quotation_data->>'valid_until', '')::date,
    nullif(p_quotation_data->>'contact_name', ''),
    nullif(p_quotation_data->>'contact_email', ''),
    nullif(p_quotation_data->>'contact_phone', ''),
    nullif(p_quotation_data->>'container_type', ''),
    nullif(p_quotation_data->>'gross_weight', '')::numeric,
    nullif(p_quotation_data->>'commodity', ''),
    nullif(p_quotation_data->>'quote_type', ''),
    nullif(p_quotation_data->>'pickup_address', ''),
    nullif(p_quotation_data->>'commercial_value', '')::numeric,
    coalesce((p_quotation_data->>'requires_insurance')::boolean, false),
    nullif(p_quotation_data->>'fob_value', '')::numeric,
    nullif(p_quotation_data->>'freight_value', '')::numeric,
    nullif(p_quotation_data->>'insurance_markup_percentage', '')::numeric,
    nullif(p_quotation_data->>'insurance_rate', '')::numeric,
    nullif(p_quotation_data->>'insurance_cost', '')::numeric,
    nullif(p_quotation_data->>'preferred_carrier', ''),
    nullif(p_quotation_data->>'target_rate', '')::numeric,
    nullif(p_quotation_data->>'transit_time', ''),
    nullif(p_quotation_data->>'delivery_address', ''),
    nullif(p_quotation_data->>'container_qty', '')::numeric,
    nullif(p_quotation_data->>'package_type', ''),
    nullif(p_quotation_data->>'package_details', ''),
    nullif(p_quotation_data->>'pricing_notes', ''),
    nullif(p_quotation_data->>'service_product', ''),
    coalesce(nullif(p_quotation_data->>'trade_direction', ''), 'import'),
    nullif(p_quotation_data->>'peso_lbs', '')::numeric,
    nullif(p_quotation_data->>'volumen_ft3', '')::numeric,
    nullif(p_quotation_data->>'duplicated_from', '')::uuid,
    nullif(p_quotation_data->>'client_notes', ''),
    now()
  )
  returning quotations.quotation_number into v_quotation_number;

  insert into public.quotation_containers (
    quotation_id, container_type_id, container_type_name, quantity, notes
  )
  select
    v_quotation_id,
    nullif(value->>'container_type_id', '')::uuid,
    btrim(value->>'container_type_name'),
    coalesce((value->>'quantity')::numeric, 1),
    nullif(value->>'notes', '')
  from jsonb_array_elements(coalesce(p_container_lines, '[]'::jsonb));

  insert into public.quotation_cargo_lines (
    quotation_id, quantity, package_type, length, width, height,
    dimension_unit, weight_lbs, ft3, cbm
  )
  select
    v_quotation_id,
    coalesce((value->>'quantity')::numeric, 1),
    btrim(value->>'package_type'),
    nullif(value->>'length', '')::numeric,
    nullif(value->>'width', '')::numeric,
    nullif(value->>'height', '')::numeric,
    coalesce(nullif(value->>'dimension_unit', ''), 'in'),
    nullif(value->>'weight_lbs', '')::numeric,
    nullif(value->>'ft3', '')::numeric,
    nullif(value->>'cbm', '')::numeric
  from jsonb_array_elements(coalesce(p_cargo_lines, '[]'::jsonb));

  insert into public.pricing_items (
    quotation_id, item_type, description, cost_amount, sale_amount,
    currency, supplier, notes, created_by, quantity, taxable, tax_rate,
    tax_amount, total_amount, rate_code
  )
  select
    v_quotation_id,
    coalesce(nullif(value->>'item_type', ''), 'Otro'),
    btrim(value->>'description'),
    coalesce((value->>'cost_amount')::numeric, 0),
    coalesce((value->>'sale_amount')::numeric, 0),
    coalesce(nullif(value->>'currency', ''), 'USD'),
    nullif(value->>'supplier', ''),
    nullif(value->>'notes', ''),
    v_user_id,
    coalesce((value->>'quantity')::numeric, 1),
    coalesce((value->>'taxable')::boolean, false),
    coalesce((value->>'tax_rate')::numeric, 0),
    coalesce((value->>'tax_amount')::numeric, 0),
    coalesce((value->>'total_amount')::numeric, 0),
    nullif(value->>'rate_code', '')
  from jsonb_array_elements(coalesce(p_pricing_items, '[]'::jsonb));

  return query select v_quotation_id, v_quotation_number;
end;
$$;

revoke all on function public.create_quotation_with_child_lines(jsonb, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_quotation_with_child_lines(jsonb, jsonb, jsonb, jsonb)
  to authenticated;

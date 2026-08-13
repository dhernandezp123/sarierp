-- Evita estados parciales al reemplazar tarifas y lineas de carga desde la UI.

create or replace function public.replace_client_rates(
  p_cliente_id uuid,
  p_destination text,
  p_destination_rate_codes jsonb default '[]'::jsonb,
  p_global_rate_codes jsonb default '[]'::jsonb,
  p_rows jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null
    or not public.is_approved_active_user()
    or not public.can_select_cliente(p_cliente_id) then
    raise exception 'No tienes permiso para modificar las tarifas del cliente'
      using errcode = '42501';
  end if;

  if p_destination not in ('SPS', 'TGU') then
    raise exception 'El destino de tarifa no es valido';
  end if;

  if jsonb_typeof(coalesce(p_destination_rate_codes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_global_rate_codes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'Las tarifas deben enviarse como arreglos';
  end if;

  perform 1 from public.clientes c where c.id = p_cliente_id for update;
  if not found then
    raise exception 'El cliente no existe';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'rate_code', '')), '') is null
      or nullif(btrim(coalesce(v_item->>'rate_label', '')), '') is null
      or nullif(btrim(coalesce(v_item->>'category', '')), '') is null
      or coalesce((v_item->>'amount')::numeric, 0) < 0
      or coalesce(nullif(v_item->>'miami_rate_destination', ''), p_destination) not in (p_destination) then
      raise exception 'Las tarifas contienen valores invalidos';
    end if;
  end loop;

  delete from public.client_rates cr
  where cr.cliente_id = p_cliente_id
    and cr.miami_rate_destination = p_destination
    and cr.rate_code in (
      select jsonb_array_elements_text(coalesce(p_destination_rate_codes, '[]'::jsonb))
    );

  delete from public.client_rates cr
  where cr.cliente_id = p_cliente_id
    and cr.miami_rate_destination is null
    and cr.rate_code in (
      select jsonb_array_elements_text(coalesce(p_global_rate_codes, '[]'::jsonb))
    );

  insert into public.client_rates (
    cliente_id, rate_code, rate_label, category, unit, currency, amount,
    is_active, valid_from, valid_to, miami_rate_destination, notes
  )
  select
    p_cliente_id,
    btrim(value->>'rate_code'),
    btrim(value->>'rate_label'),
    btrim(value->>'category'),
    nullif(value->>'unit', ''),
    coalesce(nullif(value->>'currency', ''), 'USD'),
    coalesce((value->>'amount')::numeric, 0),
    coalesce((value->>'is_active')::boolean, true),
    nullif(value->>'valid_from', '')::date,
    nullif(value->>'valid_to', '')::date,
    nullif(value->>'miami_rate_destination', ''),
    nullif(value->>'notes', '')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.replace_agent_quote_container_rates(
  p_agent_quote_id uuid,
  p_rates jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation_id uuid;
  v_item jsonb;
  v_count integer := 0;
begin
  select aq.quotation_id into v_quotation_id
  from public.agent_quotes aq
  where aq.id = p_agent_quote_id
  for update;

  if v_quotation_id is null
    or auth.uid() is null
    or not public.is_approved_active_user()
    or not public.can_select_quotation(v_quotation_id) then
    raise exception 'No tienes permiso para modificar las tarifas del agente'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_rates, '[]'::jsonb)) <> 'array' then
    raise exception 'Las tarifas de contenedor deben enviarse como arreglo';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'container_type_name', '')), '') is null
      or coalesce((v_item->>'quantity')::numeric, 0) <= 0
      or coalesce((v_item->>'ocean_freight')::numeric, 0) < 0 then
      raise exception 'Las tarifas de contenedor contienen valores invalidos';
    end if;
  end loop;

  delete from public.agent_quote_container_rates aqcr
  where aqcr.agent_quote_id = p_agent_quote_id;

  insert into public.agent_quote_container_rates (
    agent_quote_id, quotation_container_id, container_type_name,
    quantity, ocean_freight, total_ocean_freight
  )
  select
    p_agent_quote_id,
    nullif(value->>'quotation_container_id', '')::uuid,
    btrim(value->>'container_type_name'),
    coalesce((value->>'quantity')::numeric, 1),
    coalesce((value->>'ocean_freight')::numeric, 0),
    coalesce((value->>'total_ocean_freight')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.replace_quotation_cargo_with_totals(
  p_quotation_id uuid,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_peso_lbs numeric default null,
  p_peso_kg numeric default null,
  p_volumen_ft3 numeric default null,
  p_volumen_cbm numeric default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null
    or not public.is_role(array['Admin', 'Pricing'])
    or not public.can_select_quotation(p_quotation_id) then
    raise exception 'No tienes permiso para modificar la carga de la cotizacion'
      using errcode = '42501';
  end if;

  perform 1
  from public.quotations q
  where q.id = p_quotation_id and q.deleted_at is null
  for update;
  if not found then
    raise exception 'La cotizacion no existe o fue eliminada';
  end if;

  if jsonb_typeof(coalesce(p_cargo_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Las lineas de carga deben enviarse como arreglo';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_cargo_lines, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'package_type', '')), '') is null
      or coalesce((v_item->>'quantity')::numeric, 0) <= 0 then
      raise exception 'Las lineas de carga contienen valores invalidos';
    end if;
  end loop;

  delete from public.quotation_cargo_lines qcl
  where qcl.quotation_id = p_quotation_id;

  insert into public.quotation_cargo_lines (
    quotation_id, quantity, package_type, length, width, height,
    dimension_unit, weight_lbs, ft3, cbm
  )
  select
    p_quotation_id,
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

  get diagnostics v_count = row_count;

  update public.quotations q
  set peso_lbs = p_peso_lbs,
      peso_kg = p_peso_kg,
      volumen_ft3 = p_volumen_ft3,
      volumen_cbm = p_volumen_cbm
  where q.id = p_quotation_id;

  return v_count;
end;
$$;

revoke all on function public.replace_client_rates(uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.replace_client_rates(uuid, text, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.replace_agent_quote_container_rates(uuid, jsonb) from public, anon;
grant execute on function public.replace_agent_quote_container_rates(uuid, jsonb) to authenticated;

revoke all on function public.replace_quotation_cargo_with_totals(uuid, jsonb, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.replace_quotation_cargo_with_totals(uuid, jsonb, numeric, numeric, numeric, numeric) to authenticated;

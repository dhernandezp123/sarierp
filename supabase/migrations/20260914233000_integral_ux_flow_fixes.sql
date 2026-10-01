-- INT-20260914: CAI, guardado/envío de cotizaciones y shipments Miami.
-- No corrige fechas históricas por inferencia. Auditar con el SQL de docs/uat.

create or replace function public.guard_cai_calendar_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if not isfinite(new.fecha_limite_emision)
    or new.fecha_limite_emision not between date '0001-01-01' and date '9999-12-31' then
    if tg_op = 'INSERT' or new.is_active
      or new.fecha_limite_emision is distinct from old.fecha_limite_emision then
      raise exception 'Fecha límite CAI inválida: usa un año de cuatro dígitos y verifica el documento original'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_cai_calendar_date
before insert or update of fecha_limite_emision, is_active on public.cai_ranges
for each row execute function public.guard_cai_calendar_date();

-- También impide emitir usando un rango histórico activo con fecha corrupta.
-- La excepción revierte toda la emisión y el consumo del correlativo.
create or replace function public.guard_invoice_cai_calendar_date()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fecha_limite_emision is not null and (
    not isfinite(new.fecha_limite_emision)
    or new.fecha_limite_emision not between date '0001-01-01' and date '9999-12-31'
  ) then
    raise exception 'La fecha límite del CAI es inválida. Verifica el rango antes de emitir'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_invoice_cai_calendar_date
before insert on public.invoices
for each row execute function public.guard_invoice_cai_calendar_date();

-- INVOKER: conserva la política UPDATE de quotations; no amplía roles.
create or replace function public.save_quotation_edit(
  p_quotation_id uuid,
  p_expected_status text,
  p_quotation_data jsonb,
  p_replace_containers boolean default false,
  p_container_lines jsonb default '[]'::jsonb,
  p_replace_cargo boolean default false,
  p_cargo_lines jsonb default '[]'::jsonb,
  p_replace_pricing boolean default false,
  p_pricing_items jsonb default '[]'::jsonb,
  p_send_to_pricing boolean default false
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_old public.quotations%rowtype;
  v_new public.quotations%rowtype;
begin
  if auth.uid() is null or not public.can_update_quotation(p_quotation_id) then
    raise exception 'No tienes permiso para editar esta cotización' using errcode = '42501';
  end if;
  select q.* into v_old from public.quotations q
    where q.id = p_quotation_id and q.deleted_at is null for update;
  if not found then
    raise exception 'Cotización no disponible' using errcode = '42501';
  end if;
  if v_old.status is distinct from p_expected_status then
    raise exception 'La cotización cambió de estado. Recarga antes de guardar' using errcode = '40001';
  end if;
  if p_quotation_data is null or jsonb_typeof(p_quotation_data) <> 'object' then
    raise exception 'Datos de cotización inválidos' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(p_quotation_data) k
    where k <> all(array['cliente_id', 'service_product', 'quote_type', 'valid_until', 'contact_name', 'contact_email', 'contact_phone', 'incoterm', 'tipo_transporte', 'origen', 'destino', 'puerto_origen', 'puerto_destino', 'pickup_address', 'delivery_address', 'preferred_carrier', 'transit_time', 'target_rate', 'container_type', 'package_type', 'package_details', 'peso_kg', 'peso_lbs', 'gross_weight', 'volumen_cbm', 'volumen_ft3', 'cantidad_bultos', 'commodity', 'requires_insurance', 'commercial_value', 'pricing_notes', 'observaciones', 'client_notes', 'total_cost', 'total_sale', 'profit_amount', 'gp_percentage'])) then
    raise exception 'El formulario contiene campos no editables' using errcode = '23514';
  end if;
  select * into v_new from jsonb_populate_record(v_old, p_quotation_data);
  if v_new.cliente_id is null or nullif(btrim(v_new.commodity), '') is null then
    raise exception 'Cliente y descripción de carga son requeridos' using errcode = '23514';
  end if;
  if p_send_to_pricing and (
    v_old.status not in ('Borrador', 'Pricing Aprobado', 'Enviada al Cliente')
    or nullif(btrim(v_new.tipo_transporte), '') is null
    or nullif(btrim(v_new.quote_type), '') is null
  ) then
    raise exception 'No se puede enviar a Pricing desde este estado o faltan datos de transporte' using errcode = '23514';
  end if;
  if p_replace_pricing and coalesce(v_new.service_product, '') not in ('miami_lcl', 'miami_air') then
    raise exception 'El editor solo puede reemplazar cargos automáticos Miami' using errcode = '23514';
  end if;
  if (v_new.quote_type in ('FCL', 'FTL') and p_replace_containers and jsonb_array_length(p_container_lines) = 0)
    or ((v_new.quote_type in ('LCL', 'LTL', 'Courier', 'Consolidado') or v_new.service_product in ('miami_lcl', 'miami_air'))
      and p_replace_cargo and jsonb_array_length(p_cargo_lines) = 0) then
    raise exception 'Agrega al menos una línea de carga o contenedor' using errcode = '23514';
  end if;
  update public.quotations q set
    cliente_id = v_new.cliente_id,
    service_product = v_new.service_product,
    quote_type = v_new.quote_type,
    valid_until = v_new.valid_until,
    contact_name = v_new.contact_name,
    contact_email = v_new.contact_email,
    contact_phone = v_new.contact_phone,
    incoterm = v_new.incoterm,
    tipo_transporte = v_new.tipo_transporte,
    origen = v_new.origen,
    destino = v_new.destino,
    puerto_origen = v_new.puerto_origen,
    puerto_destino = v_new.puerto_destino,
    pickup_address = v_new.pickup_address,
    delivery_address = v_new.delivery_address,
    preferred_carrier = v_new.preferred_carrier,
    transit_time = v_new.transit_time,
    target_rate = v_new.target_rate,
    container_type = v_new.container_type,
    package_type = v_new.package_type,
    package_details = v_new.package_details,
    peso_kg = v_new.peso_kg,
    peso_lbs = v_new.peso_lbs,
    gross_weight = v_new.gross_weight,
    volumen_cbm = v_new.volumen_cbm,
    volumen_ft3 = v_new.volumen_ft3,
    cantidad_bultos = v_new.cantidad_bultos,
    commodity = v_new.commodity,
    requires_insurance = v_new.requires_insurance,
    commercial_value = v_new.commercial_value,
    pricing_notes = v_new.pricing_notes,
    observaciones = v_new.observaciones,
    client_notes = v_new.client_notes,
    total_cost = v_new.total_cost,
    total_sale = v_new.total_sale,
    profit_amount = v_new.profit_amount,
    gp_percentage = v_new.gp_percentage
  where q.id = p_quotation_id;
  if not found then
    raise exception 'No se pudo guardar la cotización' using errcode = '42501';
  end if;
  if p_replace_containers or p_replace_cargo or p_replace_pricing then
    perform public.replace_quotation_child_lines(p_quotation_id,
      p_replace_containers, p_container_lines, p_replace_cargo, p_cargo_lines,
      p_replace_pricing, p_pricing_items);
  end if;
  if p_send_to_pricing then
    update public.quotations set status = 'Pendiente de Fijar Precios' where id = p_quotation_id;
    insert into public.quotation_status_history(quotation_id, old_status, new_status, changed_by)
      values (p_quotation_id, v_old.status, 'Pendiente de Fijar Precios', auth.uid());
  end if;
  insert into public.activity_logs(user_id, module, action, entity_type, entity_id, description)
    values (auth.uid(), 'quotations', case when p_send_to_pricing then 'resend_to_pricing' else 'quotation_edit_saved' end,
      'quotation', p_quotation_id, 'Formulario y detalle guardados en una transacción');
  return p_quotation_id;
end;
$$;
revoke all on function public.save_quotation_edit(uuid, text, jsonb, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean) from public, anon;
grant execute on function public.save_quotation_edit(uuid, text, jsonb, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean) to authenticated;

-- Definición canónica preservada; solo Miami puede prescindir de tarifa de agente.
create or replace function public.create_shipment_from_quotation(
  p_quotation_id uuid,
  p_creation_key text default 'default'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quotation public.quotations%rowtype;
  v_agent public.agent_quotes%rowtype;
  v_existing public.shipments%rowtype;
  v_existing_count integer;
  v_shipment_id uuid := gen_random_uuid();
  v_si public.shipping_instructions%rowtype;
  v_shipment public.shipments%rowtype;
  v_container_qty integer;
  v_container_type text;
  v_creation_key text :=
    coalesce(nullif(btrim(p_creation_key), ''), 'default');
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticación'
      using errcode = '42501';
  end if;

  select q.*
  into v_quotation
  from public.quotations q
  where q.id = p_quotation_id
    and q.deleted_at is null
  for update;

  if not found then
    raise exception 'Cotización no encontrada'
      using errcode = 'P0002';
  end if;

  if not public.can_insert_shipping_instruction(p_quotation_id, v_user_id) then
    raise exception 'No autorizado para crear el shipment'
      using errcode = '42501';
  end if;

  if v_quotation.cliente_id is null then
    raise exception 'La cotización requiere un cliente antes de crear el shipment'
      using errcode = '23514';
  end if;

  select shipment.*
  into v_existing
  from public.shipments shipment
  where shipment.quotation_id = p_quotation_id
    and shipment.metadata ->> 'creation_key' = v_creation_key
  order by shipment.created_at
  limit 1;

  if found then
    select si.*
    into v_si
    from public.shipping_instructions si
    where si.id = v_existing.shipping_instruction_id;

    return jsonb_build_object(
      'shipment', to_jsonb(v_existing),
      'shipping_instruction', to_jsonb(v_si),
      'created', false
    );
  end if;

  select count(*)::integer, min(shipment.id::text)::uuid
  into v_existing_count, v_shipment_id
  from public.shipments shipment
  where shipment.quotation_id = p_quotation_id;

  if v_existing_count = 1 and v_creation_key = 'default' then
    select shipment.*
    into v_existing
    from public.shipments shipment
    where shipment.id = v_shipment_id;

    select si.*
    into v_si
    from public.shipping_instructions si
    where si.id = v_existing.shipping_instruction_id;

    return jsonb_build_object(
      'shipment', to_jsonb(v_existing),
      'shipping_instruction', to_jsonb(v_si),
      'created', false
    );
  elsif v_existing_count > 1 and v_creation_key = 'default' then
    raise exception 'La cotización tiene varios shipments; indica una clave de creación explícita'
      using errcode = '23505';
  end if;

  v_shipment_id := gen_random_uuid();

  if v_quotation.status is distinct from 'Ganada' then
    raise exception 'La cotización debe estar Ganada antes de crear un shipment'
      using errcode = '23514';
  end if;

  select aq.*
  into v_agent
  from public.agent_quotes aq
  where aq.quotation_id = p_quotation_id
    and aq.is_selected is true
    and aq.deleted_at is null
  order by aq.created_at desc
  limit 1;

  if not found and coalesce(v_quotation.service_product, '') not in ('miami_lcl', 'miami_air') then
    raise exception 'Selecciona una tarifa de agente antes de crear el shipment'
      using errcode = '23514';
  end if;

  perform set_config('app.shipment_creation_mode', 'canonical_rpc', true);

  select
    coalesce(sum(qc.quantity), 0)::integer,
    string_agg(
      trim(to_char(qc.quantity, 'FM999999990D##'))
        || ' x ' || qc.container_type_name,
      ', ' order by qc.created_at, qc.id
    )
  into v_container_qty, v_container_type
  from public.quotation_containers qc
  where qc.quotation_id = p_quotation_id;

  insert into public.shipping_instructions (
    id,
    quotation_id,
    client_id,
    created_by,
    carrier,
    agent_name,
    container_qty,
    container_type,
    origin_address,
    destination_address,
    free_days,
    freight_terms,
    release_type,
    hbl_freight_visibility,
    printed_at_destination,
    insurance_requested,
    shipment_status,
    operational_status
  ) values (
    v_shipment_id,
    v_quotation.id,
    v_quotation.cliente_id,
    v_user_id,
    nullif(btrim(coalesce(v_agent.carrier, '')), ''),
    nullif(btrim(coalesce(v_agent.agente_nombre, '')), ''),
    nullif(v_container_qty, 0),
    coalesce(
      nullif(v_container_type, ''),
      nullif(btrim(coalesce(v_quotation.quote_type, '')), '')
    ),
    nullif(btrim(coalesce(v_quotation.origen, '')), ''),
    nullif(btrim(coalesce(v_quotation.destino, '')), ''),
    v_agent.free_days_destination::text,
    'Collect',
    'Express Release',
    'No Freight Charges',
    true,
    coalesce(v_quotation.requires_insurance, false),
    'Pendiente Validación',
    'Pendiente Validación'
  )
  returning * into v_si;

  insert into public.shipments (
    id,
    shipment_number,
    quotation_id,
    client_id,
    shipping_instruction_id,
    service_type,
    incoterm,
    origin,
    destination,
    operational_status,
    assigned_to,
    created_by,
    metadata
  ) values (
    v_si.id,
    v_si.routing_number,
    v_quotation.id,
    v_quotation.cliente_id,
    v_si.id,
    coalesce(
      nullif(btrim(coalesce(v_quotation.service_product, '')), ''),
      nullif(btrim(coalesce(v_quotation.quote_type, '')), ''),
      nullif(btrim(coalesce(v_quotation.tipo_transporte, '')), '')
    ),
    nullif(btrim(coalesce(v_quotation.incoterm, '')), ''),
    coalesce(
      nullif(btrim(coalesce(v_quotation.origen, '')), ''),
      v_si.origin_address
    ),
    coalesce(
      nullif(btrim(coalesce(v_quotation.destino, '')), ''),
      v_si.destination_address
    ),
    'Sin bookings',
    v_si.operations_assigned_to,
    v_user_id,
    jsonb_build_object(
      'creation_source', 'create_shipment_from_quotation',
      'creation_key', v_creation_key
    )
  )
  returning * into v_shipment;

  perform set_config('app.shipment_creation_mode', '', true);

  insert into public.activity_logs (
    user_id,
    module,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    v_user_id,
    'operations',
    'shipment_created',
    'shipment',
    v_shipment.id,
    'Shipment y Shipping Instruction creados desde cotización',
    jsonb_build_object(
      'shipment_id', v_shipment.id,
      'shipping_instruction_id', v_si.id,
      'quotation_id', v_quotation.id,
      'creation_key', v_creation_key
    )
  );

  return jsonb_build_object(
    'shipment', to_jsonb(v_shipment),
    'shipping_instruction', to_jsonb(v_si),
    'created', true
  );
end;
$$;

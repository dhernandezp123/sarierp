-- Phase 4B: canonical read contracts and operational repricing.
-- bookings owns operational data; bills_of_lading owns document data.

create or replace function public.aggregate_shipping_instruction_booking_status(
  p_shipping_instruction_id uuid,
  p_fallback_status text default 'Sin bookings'
)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_statuses text[];
  v_status text;
begin
  select array_agg(b.shipment_status)
  into v_statuses
  from public.bookings b
  where b.shipping_instruction_id = p_shipping_instruction_id;

  if coalesce(array_length(v_statuses, 1), 0) = 0 then
    return coalesce(nullif(btrim(p_fallback_status), ''), 'Sin bookings');
  end if;

  if not exists (
    select 1
    from unnest(v_statuses) as value
    where coalesce(value, '') <> 'Cancelada'
  ) then
    return 'Cancelada';
  end if;

  if not exists (
    select 1
    from unnest(v_statuses) as value
    where coalesce(value, '') <> 'Finalizado'
  ) then
    return 'Finalizado';
  end if;

  select value
  into v_status
  from unnest(v_statuses) as value
  where coalesce(value, '') not in ('Cancelada', 'Finalizado')
  order by case value
    when 'Pendiente Validación' then 10
    when 'Listo para Booking' then 20
    when 'Booking Solicitado' then 30
    when 'Booking Confirmado' then 40
    when 'Documentación Pendiente' then 50
    when 'Listo para Embarque' then 60
    when 'Embarcado' then 70
    when 'En Tránsito' then 80
    when 'Arribado' then 90
    else 999
  end
  limit 1;

  if v_status is not null then
    return v_status;
  end if;

  return case
    when 'Finalizado' = any(v_statuses) then 'Finalizado'
    else 'Cancelada'
  end;
end;
$$;

revoke all on function public.aggregate_shipping_instruction_booking_status(uuid, text)
  from public, anon;
grant execute on function public.aggregate_shipping_instruction_booking_status(uuid, text)
  to authenticated;

create or replace function public.get_client_shipments_v2(
  p_include_completed boolean default false
)
returns table (
  id uuid,
  routing_number text,
  aggregate_status text,
  booking_count bigint,
  min_etd date,
  max_eta date,
  created_at timestamptz,
  service_product text,
  origen text,
  destino text,
  quotation_number text,
  commodity text,
  incoterm text,
  peso_kg numeric,
  volumen_cbm numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if auth.uid() is null or not public.is_cliente() then
    raise exception 'Acceso disponible únicamente para clientes autorizados'
      using errcode = '42501';
  end if;

  v_cliente_id := public.current_user_cliente_id();
  if v_cliente_id is null then
    raise exception 'El usuario no está vinculado a un cliente'
      using errcode = '42501';
  end if;

  return query
  select
    si.id,
    si.routing_number,
    public.aggregate_shipping_instruction_booking_status(
      si.id,
      coalesce(si.operational_status, 'Sin bookings')
    ),
    count(b.id),
    min(coalesce(b.actual_etd, b.etd)),
    max(coalesce(b.actual_eta, b.eta)),
    si.created_at,
    q.service_product,
    q.origen,
    q.destino,
    q.quotation_number,
    q.commodity,
    q.incoterm,
    q.peso_kg,
    q.volumen_cbm
  from public.shipping_instructions si
  join public.quotations q on q.id = si.quotation_id
  left join public.bookings b on b.shipping_instruction_id = si.id
  where q.cliente_id = v_cliente_id
    and q.deleted_at is null
    and si.deleted_at is null
  group by
    si.id,
    si.routing_number,
    si.operational_status,
    si.created_at,
    q.service_product,
    q.origen,
    q.destino,
    q.quotation_number,
    q.commodity,
    q.incoterm,
    q.peso_kg,
    q.volumen_cbm
  having p_include_completed
    or public.aggregate_shipping_instruction_booking_status(
      si.id,
      coalesce(si.operational_status, 'Sin bookings')
    ) not in ('Finalizado', 'Cancelada')
  order by si.created_at desc;
end;
$$;

revoke all on function public.get_client_shipments_v2(boolean)
  from public, anon;
grant execute on function public.get_client_shipments_v2(boolean)
  to authenticated;

create or replace function public.get_client_shipment_detail_v2(
  p_shipment_id uuid
)
returns table (
  id uuid,
  routing_number text,
  aggregate_status text,
  origin_address text,
  destination_address text,
  created_at timestamptz,
  service_product text,
  origen text,
  destino text,
  quotation_number text,
  commodity text,
  incoterm text,
  peso_kg numeric,
  volumen_cbm numeric,
  bookings jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if auth.uid() is null or not public.is_cliente() then
    raise exception 'Acceso disponible únicamente para clientes autorizados'
      using errcode = '42501';
  end if;

  v_cliente_id := public.current_user_cliente_id();
  if v_cliente_id is null then
    raise exception 'El usuario no está vinculado a un cliente'
      using errcode = '42501';
  end if;

  return query
  select
    si.id,
    si.routing_number,
    public.aggregate_shipping_instruction_booking_status(
      si.id,
      coalesce(si.operational_status, 'Sin bookings')
    ),
    si.origin_address,
    si.destination_address,
    si.created_at,
    q.service_product,
    q.origen,
    q.destino,
    q.quotation_number,
    q.commodity,
    q.incoterm,
    q.peso_kg,
    q.volumen_cbm,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'booking_number', b.booking_number,
            'carrier_booking', b.carrier_booking,
            'carrier', b.carrier,
            'vessel_name', b.vessel_name,
            'voyage', b.voyage,
            'etd', b.etd,
            'eta', b.eta,
            'actual_etd', b.actual_etd,
            'actual_eta', b.actual_eta,
            'tracking_url', b.tracking_url,
            'shipment_status', b.shipment_status,
            'free_days', b.free_days,
            'remaining_free_days', b.remaining_free_days,
            'freight_terms', b.freight_terms,
            'release_type', b.release_type,
            'master_bl', b.master_bl,
            'house_bl', b.house_bl,
            'container_count', coalesce((
              select sum(bc.quantity)
              from public.booking_containers bc
              where bc.booking_id = b.id
            ), 0),
            'bills_of_lading', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', bl.id,
                  'bl_type', bl.bl_type,
                  'bl_number', bl.bl_number,
                  'status', bl.status,
                  'release_type', bl.release_type,
                  'created_at', bl.created_at
                )
                order by bl.created_at desc
              )
              from public.bills_of_lading bl
              where bl.booking_id = b.id
            ), '[]'::jsonb)
          )
          order by b.created_at, b.id
        )
        from public.bookings b
        where b.shipping_instruction_id = si.id
      ),
      '[]'::jsonb
    )
  from public.shipping_instructions si
  join public.quotations q on q.id = si.quotation_id
  where si.id = p_shipment_id
    and q.cliente_id = v_cliente_id
    and q.deleted_at is null
    and si.deleted_at is null;
end;
$$;

revoke all on function public.get_client_shipment_detail_v2(uuid)
  from public, anon;
grant execute on function public.get_client_shipment_detail_v2(uuid)
  to authenticated;

create or replace function public.sync_shipping_instruction_from_selected_agent_quote_v2(
  p_shipping_instruction_id uuid,
  p_reason text default null
)
returns table (
  shipping_instruction_id uuid,
  quotation_id uuid,
  agent_quote_id uuid,
  updated_booking_ids uuid[],
  skipped_bookings jsonb,
  updated_bookings integer,
  skipped_count integer,
  carrier text,
  agent_name text,
  agent_contact text,
  agent_email text,
  etd date,
  estimated_transit_days integer,
  free_days integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_si public.shipping_instructions%rowtype;
  v_agent public.agent_quotes%rowtype;
  v_booking public.bookings%rowtype;
  v_agent_contact text;
  v_agent_email text;
  v_carrier text;
  v_agent_name text;
  v_etd date;
  v_transit_days integer;
  v_free_days integer;
  v_updated_ids uuid[] := '{}'::uuid[];
  v_skipped jsonb := '[]'::jsonb;
  v_skip_reason text;
begin
  if v_user_id is null
    or not (
      public.can_manage_operations()
      or public.can_manage_pricing_catalogs()
    ) then
    raise exception 'No tienes permiso para sincronizar datos operativos'
      using errcode = '42501';
  end if;

  select si.*
  into v_si
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'La Shipping Instruction no existe o fue eliminada';
  end if;

  if v_si.quotation_id is null then
    raise exception 'La Shipping Instruction no tiene cotización vinculada';
  end if;

  if v_si.operational_status in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede sincronizar una Shipping Instruction cancelada o finalizada';
  end if;

  select aq.*
  into v_agent
  from public.agent_quotes aq
  where aq.quotation_id = v_si.quotation_id
    and aq.is_selected is true
    and aq.deleted_at is null
  for update;

  if not found then
    raise exception 'No hay una tarifa seleccionada en Pricing para sincronizar';
  end if;

  select a.contact_name, a.email
  into v_agent_contact, v_agent_email
  from public.agents a
  where a.id = v_agent.agent_id
    and a.deleted_at is null;

  v_carrier := nullif(btrim(coalesce(v_agent.carrier, '')), '');
  v_agent_name := coalesce(nullif(btrim(coalesce(v_agent.agente_nombre, '')), ''), v_si.agent_name);
  v_etd := v_agent.etd;
  v_transit_days := case
    when nullif(btrim(coalesce(v_agent.transit_time, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then trunc(v_agent.transit_time::numeric)::integer
    else null
  end;
  v_free_days := case
    when nullif(btrim(coalesce(v_agent.free_days_destination::text, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then trunc(v_agent.free_days_destination::numeric)::integer
    else null
  end;

  -- Legitimate SI-owned supplier contact information only. No booking legacy
  -- column on shipping_instructions is written by this function.
  update public.shipping_instructions si
  set agent_name = v_agent_name,
      agent_contact = coalesce(nullif(v_agent_contact, ''), v_si.agent_contact),
      agent_email = coalesce(nullif(v_agent_email, ''), v_si.agent_email),
      updated_at = now()
  where si.id = v_si.id;

  for v_booking in
    select b.*
    from public.bookings b
    where b.shipping_instruction_id = v_si.id
    order by b.created_at, b.id
    for update
  loop
    v_skip_reason := null;

    if exists (
      select 1
      from public.bills_of_lading bl
      where bl.booking_id = v_booking.id
    ) then
      v_skip_reason := 'BL_ESTRUCTURADO_EXISTENTE';
    elsif v_booking.master_bl is not null
      or v_booking.house_bl is not null
    then
      v_skip_reason := 'BL_CACHE_EXISTENTE';
    elsif v_booking.booking_number is not null
      or v_booking.carrier_booking is not null
      or v_booking.vessel_name is not null
      or v_booking.voyage is not null
      or v_booking.actual_etd is not null
      or v_booking.actual_eta is not null
      or v_booking.tracking_url is not null
    then
      v_skip_reason := 'DATOS_OPERATIVOS_CONFIRMADOS';
    elsif coalesce(v_booking.shipment_status, '') not in (
      'Booking Solicitado',
      'Pendiente Validación',
      'Listo para Booking'
    ) then
      v_skip_reason := 'ESTADO_NO_REPRICEABLE';
    end if;

    if v_skip_reason is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'booking_id', v_booking.id,
        'status', v_booking.shipment_status,
        'reason', v_skip_reason
      ));
      continue;
    end if;

    update public.bookings b
    set carrier = coalesce(v_carrier, b.carrier),
        etd = coalesce(v_etd, b.etd),
        eta = case
          when v_etd is not null and v_transit_days is not null
            then v_etd + v_transit_days
          else b.eta
        end,
        estimated_transit_days = coalesce(v_transit_days, b.estimated_transit_days),
        free_days = coalesce(v_free_days, b.free_days),
        freight_terms = coalesce(nullif(btrim(coalesce(v_si.freight_terms, '')), ''), b.freight_terms),
        release_type = coalesce(nullif(btrim(coalesce(v_si.release_type, '')), ''), b.release_type),
        hbl_freight_visibility = coalesce(
          nullif(btrim(coalesce(v_si.hbl_freight_visibility, '')), ''),
          b.hbl_freight_visibility
        ),
        printed_at_destination = coalesce(v_si.printed_at_destination, b.printed_at_destination),
        updated_at = now()
    where b.id = v_booking.id;

    v_updated_ids := array_append(v_updated_ids, v_booking.id);
  end loop;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations',
    'shipping_instruction_repriced_canonical',
    'shipping_instruction',
    v_si.id,
    'Defaults de bookings no confirmados sincronizados desde Pricing',
    jsonb_build_object(
      'quotation_id', v_si.quotation_id,
      'agent_quote_id', v_agent.id,
      'updated_booking_ids', to_jsonb(v_updated_ids),
      'skipped_bookings', v_skipped,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'carrier', v_carrier,
      'etd', v_etd,
      'free_days', v_free_days
    )
  );

  return query select
    v_si.id,
    v_si.quotation_id,
    v_agent.id,
    v_updated_ids,
    v_skipped,
    cardinality(v_updated_ids),
    jsonb_array_length(v_skipped),
    v_carrier,
    v_agent_name,
    coalesce(nullif(v_agent_contact, ''), v_si.agent_contact),
    coalesce(nullif(v_agent_email, ''), v_si.agent_email),
    v_etd,
    v_transit_days,
    v_free_days;
end;
$$;

-- v1 is preserved for rollback by an administrator, but the application role
-- cannot call it after consumers move to v2 because v1 writes legacy SI fields.
revoke execute on function public.sync_shipping_instruction_from_selected_agent_quote(uuid, text)
  from authenticated;
revoke all on function public.sync_shipping_instruction_from_selected_agent_quote_v2(uuid, text)
  from public, anon;
grant execute on function public.sync_shipping_instruction_from_selected_agent_quote_v2(uuid, text)
  to authenticated;

comment on function public.get_client_shipments_v2(boolean) is
  'Portal v2: one row per SI operation; booking summaries come exclusively from bookings.';
comment on function public.get_client_shipment_detail_v2(uuid) is
  'Portal v2 detail: all bookings and structured BLs for the authenticated client operation.';
comment on function public.sync_shipping_instruction_from_selected_agent_quote_v2(uuid, text) is
  'Canonical repricing: updates defaults only on unconfirmed bookings and audits skipped bookings.';

notify pgrst, 'reload schema';

-- Completa el flujo de opciones comerciales cuando la cotización ya tiene
-- Shipping Instruction: la elección y la propagación se cierran atómicamente.

create or replace function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(
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
      or (
        public.is_approved_active_user()
        and public.is_role(array['Ventas'])
        and exists (
          select 1
          from public.shipping_instructions authorized_si
          join public.quotation_options accepted_option
            on accepted_option.quotation_id = authorized_si.quotation_id
           and accepted_option.status = 'Aceptada'
          where authorized_si.id = p_shipping_instruction_id
            and authorized_si.deleted_at is null
        )
      )
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
  v_agent_name := coalesce(
    nullif(btrim(coalesce(v_agent.agente_nombre, '')), ''),
    v_si.agent_name
  );
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
    elsif v_booking.master_bl is not null or v_booking.house_bl is not null then
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
        freight_terms = coalesce(
          nullif(btrim(coalesce(v_si.freight_terms, '')), ''),
          b.freight_terms
        ),
        release_type = coalesce(
          nullif(btrim(coalesce(v_si.release_type, '')), ''),
          b.release_type
        ),
        hbl_freight_visibility = coalesce(
          nullif(btrim(coalesce(v_si.hbl_freight_visibility, '')), ''),
          b.hbl_freight_visibility
        ),
        printed_at_destination = coalesce(
          v_si.printed_at_destination,
          b.printed_at_destination
        ),
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

create or replace function public.finalize_quotation_option_selection(
  p_option_id uuid,
  p_sync_operation boolean default false
)
returns table (
  quotation_id uuid,
  option_id uuid,
  option_code text,
  quotation_status text,
  synced_shipping_instructions integer,
  updated_bookings integer,
  skipped_bookings integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_option public.quotation_options%rowtype;
  v_quote public.quotations%rowtype;
  v_shipping_instruction record;
  v_sync record;
  v_synced_shipping_instructions integer := 0;
  v_updated_bookings integer := 0;
  v_skipped_bookings integer := 0;
begin
  if v_user_id is null
    or not public.is_approved_active_user()
    or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No tienes permiso para registrar la opción elegida'
      using errcode = '42501';
  end if;

  select qo.*
  into v_option
  from public.quotation_options qo
  where qo.id = p_option_id
  for update;

  if not found then
    raise exception 'La opción no existe' using errcode = 'P0002';
  end if;

  select q.*
  into v_quote
  from public.quotations q
  where q.id = v_option.quotation_id
    and q.deleted_at is null
  for update;

  if not found or not public.can_select_quotation(v_option.quotation_id) then
    raise exception 'No tienes acceso a la cotización' using errcode = '42501';
  end if;

  if v_option.status <> 'Aceptada' then
    perform * from public.accept_quotation_option(p_option_id);

    select qo.*
    into v_option
    from public.quotation_options qo
    where qo.id = p_option_id;
  end if;

  if p_sync_operation then
    for v_shipping_instruction in
      select si.id
      from public.shipping_instructions si
      where si.quotation_id = v_option.quotation_id
        and si.deleted_at is null
        and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
      order by si.created_at, si.id
    loop
      select *
      into v_sync
      from public.sync_shipping_instruction_from_selected_agent_quote_v2(
        v_shipping_instruction.id,
        'Opción comercial elegida por el cliente: ' || v_option.option_code
      );

      v_synced_shipping_instructions := v_synced_shipping_instructions + 1;
      v_updated_bookings := v_updated_bookings + coalesce(v_sync.updated_bookings, 0);
      v_skipped_bookings := v_skipped_bookings + coalesce(v_sync.skipped_count, 0);
    end loop;
  end if;

  if v_quote.status = 'Enviada al Cliente' then
    update public.quotations
    set status = 'Ganada'
    where id = v_option.quotation_id;

    insert into public.quotation_status_history (
      quotation_id, old_status, new_status, changed_by
    ) values (
      v_option.quotation_id,
      v_quote.status,
      'Ganada',
      v_user_id
    );
  elsif v_quote.status <> 'Ganada' then
    raise exception 'La cotización debe estar Enviada al Cliente antes de cerrar la elección';
  end if;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'quotations',
    case
      when p_sync_operation then 'quotation_option_finalized_with_operational_sync'
      else 'quotation_option_finalized_without_operational_sync'
    end,
    'quotation',
    v_option.quotation_id,
    case
      when p_sync_operation then
        'Opción elegida y propagada a operación: ' || v_option.option_code
      else
        'Opción elegida sin actualizar operación: ' || v_option.option_code
    end,
    jsonb_build_object(
      'quotation_option_id', v_option.id,
      'option_code', v_option.option_code,
      'agent_quote_id', v_option.agent_quote_id,
      'synced_shipping_instructions', v_synced_shipping_instructions,
      'updated_bookings', v_updated_bookings,
      'skipped_bookings', v_skipped_bookings
    )
  );

  return query select
    v_option.quotation_id,
    v_option.id,
    v_option.option_code,
    'Ganada'::text,
    v_synced_shipping_instructions,
    v_updated_bookings,
    v_skipped_bookings;
end;
$$;

revoke all on function public.finalize_quotation_option_selection(uuid, boolean)
  from public, anon;
grant execute on function public.finalize_quotation_option_selection(uuid, boolean)
  to authenticated;

comment on function public.finalize_quotation_option_selection(uuid, boolean) is
  'Acepta una opción, restaura su pricing, cierra la cotización y sincroniza opcionalmente operaciones en una sola transacción.';

create or replace function public.guard_quotation_options_published_before_sent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Enviada al Cliente'
    and old.status is distinct from 'Enviada al Cliente'
    and exists (
      select 1
      from public.quotation_options qo
      where qo.quotation_id = new.id
    )
    and (
      exists (
        select 1
        from public.quotation_options qo
        where qo.quotation_id = new.id
          and qo.status = 'Borrador'
      )
      or not exists (
        select 1
        from public.quotation_options qo
        where qo.quotation_id = new.id
          and qo.status = 'Ofrecida'
      )
    )
  then
    raise exception 'Publica las opciones comerciales antes de marcar la cotización como Enviada al Cliente';
  end if;

  return new;
end;
$$;

drop trigger if exists quotations_require_published_options_before_sent
  on public.quotations;
create trigger quotations_require_published_options_before_sent
before update of status on public.quotations
for each row
execute function public.guard_quotation_options_published_before_sent();

notify pgrst, 'reload schema';

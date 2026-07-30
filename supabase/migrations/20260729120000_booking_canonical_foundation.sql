-- Booking canonico: fundacion aditiva y reversible.
-- No elimina ni sincroniza columnas legacy de shipping_instructions.

alter table public.shipping_instructions
  add column if not exists primary_booking_id uuid;

alter table public.shipping_instructions
  drop constraint if exists shipping_instructions_primary_booking_id_fkey;

alter table public.shipping_instructions
  add constraint shipping_instructions_primary_booking_id_fkey
  foreign key (primary_booking_id)
  references public.bookings(id)
  on delete set null;

create index if not exists idx_shipping_instructions_primary_booking_id
  on public.shipping_instructions(primary_booking_id);

create or replace function public.validate_primary_booking_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.primary_booking_id is not null
     and not exists (
       select 1
       from public.bookings b
       where b.id = new.primary_booking_id
         and b.shipping_instruction_id = new.id
     ) then
    raise exception 'El booking primario no pertenece a la Shipping Instruction'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_primary_booking_ownership
  on public.shipping_instructions;

create trigger trg_validate_primary_booking_ownership
before insert or update of primary_booking_id
on public.shipping_instructions
for each row
execute function public.validate_primary_booking_ownership();

create or replace function public.select_primary_booking_if_single(
  p_shipping_instruction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_si public.shipping_instructions%rowtype;
  v_booking_id uuid;
  v_booking_count integer;
begin
  if v_user_id is not null and not public.can_manage_operations() then
    raise exception 'No autorizado para administrar bookings'
      using errcode = '42501';
  end if;

  if v_user_id is null and session_user <> 'postgres' then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  select *
  into v_si
  from public.shipping_instructions
  where id = p_shipping_instruction_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if coalesce(v_si.operational_status, v_si.shipment_status) in ('Finalizado', 'Cancelada') then
    return v_si.primary_booking_id;
  end if;

  select count(*)::integer, min(id::text)::uuid
  into v_booking_count, v_booking_id
  from public.bookings
  where shipping_instruction_id = p_shipping_instruction_id;

  if v_booking_count = 1 and v_si.primary_booking_id is null then
    update public.shipping_instructions
    set primary_booking_id = v_booking_id,
        updated_at = clock_timestamp()
    where id = p_shipping_instruction_id;

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
      'operations_booking',
      'primary_booking_auto_selected',
      'shipping_instruction',
      p_shipping_instruction_id,
      'Booking primario seleccionado automaticamente por ser el unico booking',
      jsonb_build_object(
        'booking_id', v_booking_id,
        'booking_count', v_booking_count,
        'source', case when v_user_id is null then 'foundation_migration' else 'canonical_rpc' end
      )
    );

    return v_booking_id;
  end if;

  return v_si.primary_booking_id;
end;
$$;

create or replace function public.set_primary_booking(
  p_shipping_instruction_id uuid,
  p_booking_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_si public.shipping_instructions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para administrar bookings'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Debes indicar el motivo del cambio de booking primario'
      using errcode = '22023';
  end if;

  select *
  into v_si
  from public.shipping_instructions
  where id = p_shipping_instruction_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if coalesce(v_si.operational_status, v_si.shipment_status) in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede cambiar el booking primario de una operacion cerrada'
      using errcode = '55000';
  end if;

  if p_booking_id is not null
     and not exists (
       select 1
       from public.bookings b
       where b.id = p_booking_id
         and b.shipping_instruction_id = p_shipping_instruction_id
     ) then
    raise exception 'El booking no pertenece a la Shipping Instruction'
      using errcode = '23514';
  end if;

  if v_si.primary_booking_id is not distinct from p_booking_id then
    return p_booking_id;
  end if;

  update public.shipping_instructions
  set primary_booking_id = p_booking_id,
      updated_at = clock_timestamp()
  where id = p_shipping_instruction_id;

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
    'operations_booking',
    'primary_booking_changed',
    'shipping_instruction',
    p_shipping_instruction_id,
    'Booking primario actualizado manualmente',
    jsonb_build_object(
      'previous_booking_id', v_si.primary_booking_id,
      'new_booking_id', p_booking_id,
      'reason', btrim(p_reason)
    )
  );

  return p_booking_id;
end;
$$;

create or replace function public.create_booking_for_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_si public.shipping_instructions%rowtype;
  v_quote public.quotations%rowtype;
  v_agent public.agent_quotes%rowtype;
  v_booking public.bookings%rowtype;
  v_carrier text;
  v_etd date;
  v_eta date;
  v_transit_days integer;
  v_free_days integer;
  v_primary_booking_id uuid;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para crear bookings'
      using errcode = '42501';
  end if;

  select *
  into v_si
  from public.shipping_instructions
  where id = p_shipping_instruction_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_si.shipment_status = 'Cancelada'
     or v_si.operational_status = 'Cancelada' then
    raise exception 'No se puede crear un booking para una Shipping Instruction cancelada'
      using errcode = '55000';
  end if;

  if v_si.shipment_status = 'Finalizado'
     or v_si.operational_status = 'Finalizado' then
    raise exception 'No se puede crear un booking para una Shipping Instruction finalizada'
      using errcode = '55000';
  end if;

  if v_si.operational_status is distinct from 'Listo para Booking' then
    raise exception 'La Shipping Instruction debe estar en estado Listo para Booking'
      using errcode = '55000';
  end if;

  if v_si.quotation_id is not null then
    select *
    into v_quote
    from public.quotations
    where id = v_si.quotation_id
      and deleted_at is null;

    select *
    into v_agent
    from public.agent_quotes
    where quotation_id = v_si.quotation_id
      and is_selected = true
      and deleted_at is null
    order by created_at desc
    limit 1;
  end if;

  v_carrier := coalesce(
    nullif(btrim(v_agent.carrier), ''),
    nullif(btrim(v_si.carrier), ''),
    nullif(btrim(v_quote.preferred_carrier), '')
  );
  v_etd := coalesce(v_agent.etd, v_si.etd);

  v_transit_days := case
    when nullif(btrim(coalesce(v_agent.transit_time, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then trunc(v_agent.transit_time::numeric)::integer
    when v_si.estimated_transit_days is not null
      then v_si.estimated_transit_days
    when nullif(btrim(coalesce(v_quote.transit_time, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then trunc(v_quote.transit_time::numeric)::integer
    else null
  end;

  v_free_days := coalesce(
    v_agent.free_days_destination,
    case
      when nullif(btrim(coalesce(v_si.free_days, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then trunc(v_si.free_days::numeric)::integer
      else null
    end
  );

  v_eta := coalesce(
    v_si.eta,
    case
      when v_etd is not null and v_transit_days is not null
        then v_etd + v_transit_days
      else null
    end
  );

  insert into public.bookings (
    shipping_instruction_id,
    carrier,
    etd,
    eta,
    estimated_transit_days,
    free_days,
    remaining_free_days,
    freight_terms,
    release_type,
    hbl_freight_visibility,
    printed_at_destination,
    shipment_status,
    created_by
  ) values (
    v_si.id,
    v_carrier,
    v_etd,
    v_eta,
    v_transit_days,
    v_free_days,
    coalesce(v_si.remaining_free_days, v_free_days),
    v_si.freight_terms,
    v_si.release_type,
    v_si.hbl_freight_visibility,
    coalesce(v_si.printed_at_destination, true),
    'Booking Solicitado',
    v_user_id
  )
  returning * into v_booking;

  v_primary_booking_id :=
    public.select_primary_booking_if_single(p_shipping_instruction_id);

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
    'operations_booking',
    'booking_created',
    'booking',
    v_booking.id,
    'Booking creado mediante el flujo canonico',
    jsonb_build_object(
      'shipping_instruction_id', v_si.id,
      'routing_number', v_si.routing_number,
      'primary_booking_id', v_primary_booking_id,
      'defaults', jsonb_build_object(
        'carrier', v_carrier,
        'etd', v_etd,
        'eta', v_eta,
        'estimated_transit_days', v_transit_days,
        'free_days', v_free_days
      )
    )
  );

  return next v_booking;
end;
$$;

create or replace function public.update_booking_canonical(
  p_booking_id uuid,
  p_shipping_instruction_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_invalid_fields text;
  v_allowed_fields constant text[] := array[
    'booking_number',
    'carrier_booking',
    'master_bl',
    'house_bl',
    'carrier',
    'vessel_name',
    'voyage',
    'etd',
    'eta',
    'original_eta',
    'actual_etd',
    'actual_eta',
    'tracking_url',
    'shipment_status',
    'estimated_transit_days',
    'real_transit_days',
    'free_days',
    'remaining_free_days',
    'freight_terms',
    'release_type',
    'hbl_freight_visibility',
    'printed_at_destination',
    'operational_comments'
  ];
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para actualizar bookings'
      using errcode = '42501';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Los cambios del booking deben ser un objeto JSON'
      using errcode = '22023';
  end if;

  select string_agg(k.key, ', ' order by k.key)
  into v_invalid_fields
  from jsonb_object_keys(p_changes) as k(key)
  where not (k.key = any(v_allowed_fields));

  if v_invalid_fields is not null then
    raise exception 'Campos no permitidos: %', v_invalid_fields
      using errcode = '22023';
  end if;

  select *
  into v_old
  from public.bookings
  where id = p_booking_id
    and shipping_instruction_id = p_shipping_instruction_id
  for update;

  if not found then
    raise exception 'Booking no encontrado o no pertenece a la Shipping Instruction'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'El booking fue actualizado por otro usuario. Recarga antes de guardar.'
      using errcode = '40001';
  end if;

  update public.bookings
  set
    booking_number = case when p_changes ? 'booking_number'
      then nullif(btrim(p_changes ->> 'booking_number'), '') else v_old.booking_number end,
    carrier_booking = case when p_changes ? 'carrier_booking'
      then nullif(btrim(p_changes ->> 'carrier_booking'), '') else v_old.carrier_booking end,
    master_bl = case when p_changes ? 'master_bl'
      then nullif(btrim(p_changes ->> 'master_bl'), '') else v_old.master_bl end,
    house_bl = case when p_changes ? 'house_bl'
      then nullif(btrim(p_changes ->> 'house_bl'), '') else v_old.house_bl end,
    carrier = case when p_changes ? 'carrier'
      then nullif(btrim(p_changes ->> 'carrier'), '') else v_old.carrier end,
    vessel_name = case when p_changes ? 'vessel_name'
      then nullif(btrim(p_changes ->> 'vessel_name'), '') else v_old.vessel_name end,
    voyage = case when p_changes ? 'voyage'
      then nullif(btrim(p_changes ->> 'voyage'), '') else v_old.voyage end,
    etd = case when p_changes ? 'etd'
      then nullif(p_changes ->> 'etd', '')::date else v_old.etd end,
    eta = case when p_changes ? 'eta'
      then nullif(p_changes ->> 'eta', '')::date else v_old.eta end,
    original_eta = case when p_changes ? 'original_eta'
      then nullif(p_changes ->> 'original_eta', '')::date else v_old.original_eta end,
    actual_etd = case when p_changes ? 'actual_etd'
      then nullif(p_changes ->> 'actual_etd', '')::date else v_old.actual_etd end,
    actual_eta = case when p_changes ? 'actual_eta'
      then nullif(p_changes ->> 'actual_eta', '')::date else v_old.actual_eta end,
    tracking_url = case when p_changes ? 'tracking_url'
      then nullif(btrim(p_changes ->> 'tracking_url'), '') else v_old.tracking_url end,
    shipment_status = case when p_changes ? 'shipment_status'
      then nullif(btrim(p_changes ->> 'shipment_status'), '') else v_old.shipment_status end,
    estimated_transit_days = case when p_changes ? 'estimated_transit_days'
      then nullif(p_changes ->> 'estimated_transit_days', '')::integer else v_old.estimated_transit_days end,
    real_transit_days = case when p_changes ? 'real_transit_days'
      then nullif(p_changes ->> 'real_transit_days', '')::integer else v_old.real_transit_days end,
    free_days = case when p_changes ? 'free_days'
      then nullif(p_changes ->> 'free_days', '')::integer else v_old.free_days end,
    remaining_free_days = case when p_changes ? 'remaining_free_days'
      then nullif(p_changes ->> 'remaining_free_days', '')::integer else v_old.remaining_free_days end,
    freight_terms = case when p_changes ? 'freight_terms'
      then nullif(btrim(p_changes ->> 'freight_terms'), '') else v_old.freight_terms end,
    release_type = case when p_changes ? 'release_type'
      then nullif(btrim(p_changes ->> 'release_type'), '') else v_old.release_type end,
    hbl_freight_visibility = case when p_changes ? 'hbl_freight_visibility'
      then nullif(btrim(p_changes ->> 'hbl_freight_visibility'), '') else v_old.hbl_freight_visibility end,
    printed_at_destination = case when p_changes ? 'printed_at_destination'
      then (p_changes ->> 'printed_at_destination')::boolean else v_old.printed_at_destination end,
    operational_comments = case when p_changes ? 'operational_comments'
      then nullif(btrim(p_changes ->> 'operational_comments'), '') else v_old.operational_comments end,
    updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

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
    'operations_booking',
    case
      when v_old.shipment_status is distinct from v_new.shipment_status
        then 'booking_status_updated'
      else 'booking_canonical_updated'
    end,
    'booking',
    v_new.id,
    'Booking actualizado mediante el flujo canonico',
    jsonb_build_object(
      'shipping_instruction_id', v_new.shipping_instruction_id,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new),
      'requested_changes', p_changes
    )
  );

  return next v_new;
end;
$$;

revoke all on function public.select_primary_booking_if_single(uuid)
  from public, anon;
revoke all on function public.set_primary_booking(uuid, uuid, text)
  from public, anon;
revoke all on function public.create_booking_for_shipping_instruction(uuid)
  from public, anon;
revoke all on function public.update_booking_canonical(uuid, uuid, timestamptz, jsonb)
  from public, anon;

grant execute on function public.select_primary_booking_if_single(uuid)
  to authenticated;
grant execute on function public.set_primary_booking(uuid, uuid, text)
  to authenticated;
grant execute on function public.create_booking_for_shipping_instruction(uuid)
  to authenticated;
grant execute on function public.update_booking_canonical(uuid, uuid, timestamptz, jsonb)
  to authenticated;

-- Backfill seguro: solo operaciones activas con exactamente un booking.
-- No toca registros finalizados/cancelados ni intenta resolver multiples bookings.
do $$
declare
  v_shipping_instruction_id uuid;
begin
  for v_shipping_instruction_id in
    select si.id
    from public.shipping_instructions si
    join public.bookings b on b.shipping_instruction_id = si.id
    where si.primary_booking_id is null
      and si.deleted_at is null
      and coalesce(si.operational_status, si.shipment_status, '') not in ('Finalizado', 'Cancelada')
    group by si.id
    having count(b.id) = 1
  loop
    perform public.select_primary_booking_if_single(v_shipping_instruction_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

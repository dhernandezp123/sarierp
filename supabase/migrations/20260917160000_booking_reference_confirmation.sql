-- Operations may complete a missing carrier booking reference without using
-- the administrative-correction path. Existing references remain immutable.

alter table public.booking_schedule_revisions
  drop constraint if exists booking_schedule_revisions_type_check;

alter table public.booking_schedule_revisions
  add constraint booking_schedule_revisions_type_check
  check (
    revision_type = any (
      array[
        'INITIAL',
        'SCHEDULE_CHANGE',
        'ROLLOVER_SAME_BOOKING',
        'CARRIER_UPDATE',
        'ROUTING_CHANGE',
        'BOOKING_CONFIRMATION',
        'ADMIN_CORRECTION'
      ]
    )
  );

create or replace function public.protect_booking_schedule_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := current_setting('app.booking_schedule_write_mode', true);
begin
  if old.original_etd is not null
     and new.original_etd is distinct from old.original_etd then
    raise exception 'original_etd es inmutable una vez establecido'
      using errcode = '55000';
  end if;

  if old.original_eta is not null
     and new.original_eta is distinct from old.original_eta then
    raise exception 'original_eta es inmutable una vez establecido'
      using errcode = '55000';
  end if;

  if (
    new.carrier is distinct from old.carrier
    or new.vessel_name is distinct from old.vessel_name
    or new.voyage is distinct from old.voyage
    or new.etd is distinct from old.etd
    or new.eta is distinct from old.eta
    or new.routing_summary is distinct from old.routing_summary
  ) and coalesce(v_mode, '') not in (
    'schedule_revision',
    'schedule_rollover',
    'admin_correction',
    'pricing_sync'
  ) then
    raise exception 'El itinerario solo puede cambiar mediante un RPC controlado'
      using errcode = '55000';
  end if;

  if (
    new.booking_number is distinct from old.booking_number
    or new.carrier_booking is distinct from old.carrier_booking
  ) and coalesce(v_mode, '') not in (
    'booking_confirmation',
    'admin_correction'
  ) then
    raise exception 'La identidad del booking solo cambia mediante un RPC controlado'
      using errcode = '55000';
  end if;

  if (
    new.actual_etd is distinct from old.actual_etd
    or new.actual_eta is distinct from old.actual_eta
  ) and coalesce(v_mode, '') not in (
    'status_transition',
    'admin_correction'
  ) then
    raise exception 'Las fechas reales solo cambian mediante transicion o correccion administrativa'
      using errcode = '55000';
  end if;

  if (
    new.booking_lifecycle_status is distinct from old.booking_lifecycle_status
    or new.supersedes_booking_id is distinct from old.supersedes_booking_id
    or new.replaced_by_booking_id is distinct from old.replaced_by_booking_id
    or new.cancellation_reason is distinct from old.cancellation_reason
    or new.cancelled_at is distinct from old.cancelled_at
    or new.cancelled_by is distinct from old.cancelled_by
  ) and coalesce(v_mode, '') not in (
    'booking_replace',
    'booking_cancel',
    'booking_reactivate'
  ) then
    raise exception 'El ciclo de vida del booking solo cambia mediante un RPC controlado'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.confirm_booking_reference(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_booking_number text default null,
  p_carrier_booking text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_revision public.booking_schedule_revisions%rowtype;
  v_booking_number text := nullif(btrim(coalesce(p_booking_number, '')), '');
  v_carrier_booking text := nullif(btrim(coalesce(p_carrier_booking, '')), '');
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'Solo Admin u Operaciones puede confirmar la referencia del booking'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de confirmacion es obligatorio'
      using errcode = '22023';
  end if;

  select b.*
  into v_old
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking no encontrado'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de confirmar la referencia'
      using errcode = '40001';
  end if;

  if v_old.booking_lifecycle_status <> 'ACTIVE'
     or v_old.shipment_status = 'Finalizado' then
    raise exception 'No se puede confirmar la referencia de un booking historico o finalizado'
      using errcode = '55000';
  end if;

  if v_old.shipment_id is null then
    raise exception 'El booking no pertenece a un shipment canonico'
      using errcode = '23514';
  end if;

  if v_old.booking_number is not null
     and v_booking_number is not null
     and v_booking_number is distinct from v_old.booking_number then
    raise exception 'El Booking Number existente solo admite correccion administrativa'
      using errcode = '55000';
  end if;

  if v_old.carrier_booking is not null
     and v_carrier_booking is not null
     and v_carrier_booking is distinct from v_old.carrier_booking then
    raise exception 'El Carrier Booking existente solo admite correccion administrativa'
      using errcode = '55000';
  end if;

  v_booking_number := coalesce(v_old.booking_number, v_booking_number);
  v_carrier_booking := coalesce(v_old.carrier_booking, v_carrier_booking);

  if v_booking_number is null and v_carrier_booking is null then
    raise exception 'Registra al menos un Booking Number o Carrier Booking'
      using errcode = '23514';
  end if;

  if v_booking_number is not distinct from v_old.booking_number
     and v_carrier_booking is not distinct from v_old.carrier_booking then
    raise exception 'No hay una referencia nueva por confirmar'
      using errcode = '22023';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'booking_confirmation', true);

  update public.bookings b
  set booking_number = v_booking_number,
      carrier_booking = v_carrier_booking,
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  insert into public.booking_schedule_revisions (
    shipment_id,
    booking_id,
    revision_number,
    revision_type,
    carrier,
    booking_number,
    carrier_booking,
    vessel_name,
    voyage,
    etd,
    eta,
    routing_summary,
    reason,
    source,
    effective_at,
    created_by,
    metadata
  ) values (
    v_new.shipment_id,
    v_new.id,
    public.next_booking_schedule_revision_number(v_new.id),
    'BOOKING_CONFIRMATION',
    v_new.carrier,
    v_new.booking_number,
    v_new.carrier_booking,
    v_new.vessel_name,
    v_new.voyage,
    v_new.etd,
    v_new.eta,
    v_new.routing_summary,
    btrim(p_reason),
    'operations',
    clock_timestamp(),
    v_user_id,
    jsonb_build_object(
      'previous_booking_number', v_old.booking_number,
      'previous_carrier_booking', v_old.carrier_booking,
      'new_booking_number', v_new.booking_number,
      'new_carrier_booking', v_new.carrier_booking,
      'confirmation_only', true
    )
  )
  returning * into v_revision;

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
    'booking_reference_confirmed',
    'booking',
    v_new.id,
    'Referencia del booking confirmada por Operaciones',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'revision_id', v_revision.id,
      'before', jsonb_build_object(
        'booking_number', v_old.booking_number,
        'carrier_booking', v_old.carrier_booking
      ),
      'after', jsonb_build_object(
        'booking_number', v_new.booking_number,
        'carrier_booking', v_new.carrier_booking
      )
    )
  );

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'revision', to_jsonb(v_revision)
  );
end;
$$;

revoke all on function public.confirm_booking_reference(
  uuid, timestamptz, text, text, text
) from public, anon;
grant execute on function public.confirm_booking_reference(
  uuid, timestamptz, text, text, text
) to authenticated, service_role;

comment on function public.confirm_booking_reference(
  uuid, timestamptz, text, text, text
) is
  'Permite a Operaciones completar referencias vacias del booking sin reemplazar valores ya confirmados.';

-- UX-OPS-04: flujo operativo simplificado (decisión de negocio del 25/11/2026).
-- * Booking en 5 acciones: confirmar, listo para embarque, salida (Embarcado +
--   En Tránsito), arribo, entrega y cierre. Se orquestan las transiciones
--   existentes dentro de una transacción; ninguna validación se elimina.
-- * VGM de varios contenedores en un paso: borrador, verificación y envío.
-- * HBL: Draft -> Aprobado por Cliente directo. "Enviado al cliente" queda en
--   bl_draft_sends y "Liberado" deja de ser un paso del flujo principal.
-- Los estados históricos siguen siendo válidos; no se migran datos.

create or replace function public.advance_booking_flow(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_step text,
  p_occurred_at timestamptz default now(),
  p_location text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_status text;
  v_step text := lower(btrim(coalesce(p_step, '')));
  v_targets text[];
  v_target text;
  v_updated_at timestamptz;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.can_manage_operations() then
    raise exception 'No autorizado para avanzar el booking'
      using errcode = '42501';
  end if;

  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking no encontrado'
      using errcode = 'P0002';
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_VERSION_CONFLICT: el booking fue actualizado por otro usuario'
      using errcode = '40001';
  end if;

  v_status := coalesce(nullif(btrim(v_booking.shipment_status), ''), 'Booking Solicitado');

  v_targets := case v_step
    when 'confirm' then case
      when v_status in (U&'Pendiente Validaci\00F3n', 'Listo para Booking')
        then array['Booking Solicitado', 'Booking Confirmado']
      when v_status = 'Booking Solicitado' then array['Booking Confirmado']
    end
    when 'ready' then case
      when v_status = 'Booking Confirmado'
        then array[U&'Documentaci\00F3n Pendiente', 'Listo para Embarque']
      when v_status = U&'Documentaci\00F3n Pendiente' then array['Listo para Embarque']
    end
    when 'departure' then case
      when v_status = 'Listo para Embarque' then array['Embarcado', U&'En Tr\00E1nsito']
      when v_status = 'Embarcado' then array[U&'En Tr\00E1nsito']
    end
    when 'arrival' then case
      when v_status = U&'En Tr\00E1nsito' then array['Arribado']
    end
    when 'deliver_finalize' then case
      when v_status = 'Arribado' then array['Finalizado']
    end
  end;

  if v_targets is null then
    raise exception 'El paso % no aplica a un booking en estado %', p_step, v_status
      using errcode = '22023';
  end if;

  -- Entrega y cierre: la entrega se registra en la misma transacción; si el
  -- cierre falla (contenedores incompletos, etc.) la entrega también revierte.
  if v_step = 'deliver_finalize' and not exists (
    select 1
    from public.operational_events oe
    where oe.booking_id = v_booking.id
      and oe.event_code = 'DELIVERED'
  ) then
    perform public.record_operational_event(
      v_booking.shipping_instruction_id,
      v_booking.id,
      null,
      'DELIVERED',
      'Entrega registrada',
      v_occurred_at,
      nullif(btrim(coalesce(p_location, '')), ''),
      nullif(btrim(coalesce(p_notes, '')), ''),
      jsonb_build_object('flow_step', v_step)
    );
  end if;

  foreach v_target in array v_targets loop
    select b.updated_at into v_updated_at
    from public.bookings b
    where b.id = v_booking.id;

    v_result := public.transition_booking_status(
      v_booking.id,
      v_updated_at,
      v_target,
      v_occurred_at,
      p_location,
      p_notes,
      jsonb_build_object('flow_step', v_step)
    );

    -- El gate de readiness responde sin excepción: se devuelve el bloqueo y
    -- el paso intermedio ya aplicado queda como estado válido del booking.
    if coalesce((v_result ->> 'transitioned')::boolean, true) = false then
      return v_result || jsonb_build_object('step', v_step, 'stopped_at', v_target);
    end if;
  end loop;

  return v_result || jsonb_build_object('step', v_step, 'transitioned', true);
end;
$$;

revoke all on function public.advance_booking_flow(uuid, timestamptz, text, timestamptz, text, text)
from public, anon;
grant execute on function public.advance_booking_flow(uuid, timestamptz, text, timestamptz, text, text)
to authenticated, service_role;

comment on function public.advance_booking_flow(uuid, timestamptz, text, timestamptz, text, text) is
  'Avanza el booking por pasos de negocio (confirm, ready, departure, arrival, deliver_finalize) usando transition_booking_status en una transaccion.';

create or replace function public.submit_booking_vgm_batch(
  p_booking_id uuid,
  p_rows jsonb,
  p_submission_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_draft jsonb;
  v_verified jsonb;
  v_submitted jsonb;
  v_records jsonb := '[]'::jsonb;
  v_verifier text;
begin
  if auth.uid() is null or not public.can_manage_operations() then
    raise exception 'No autorizado para registrar VGM'
      using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Indica al menos un contenedor con su VGM'
      using errcode = '22023';
  end if;

  select nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), '')
  into v_verifier
  from public.profiles p
  where p.id = auth.uid();

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_draft := public.save_container_vgm_draft(
      p_booking_id,
      (v_row ->> 'booking_container_id')::uuid,
      (v_row ->> 'gross_mass')::numeric,
      coalesce(v_row ->> 'unit', 'KG'),
      v_row ->> 'verification_method',
      (v_row ->> 'weighed_at')::timestamptz,
      coalesce(nullif(btrim(v_row ->> 'verified_by_name'), ''), v_verifier),
      null,
      v_row ->> 'notes',
      jsonb_build_object('source', 'vgm_batch')
    );

    -- La verificación queda registrada con el método de pesaje y el usuario.
    v_verified := public.transition_container_vgm(
      (v_draft ->> 'id')::uuid,
      (v_draft ->> 'updated_at')::timestamptz,
      'VERIFIED',
      null
    );

    v_submitted := public.transition_container_vgm(
      (v_verified ->> 'id')::uuid,
      (v_verified ->> 'updated_at')::timestamptz,
      'SUBMITTED',
      nullif(btrim(coalesce(p_submission_reference, '')), '')
    );

    v_records := v_records || jsonb_build_array(v_submitted);
  end loop;

  return jsonb_build_object(
    'submitted', jsonb_array_length(v_records),
    'records', v_records
  );
end;
$$;

revoke all on function public.submit_booking_vgm_batch(uuid, jsonb, text)
from public, anon;
grant execute on function public.submit_booking_vgm_batch(uuid, jsonb, text)
to authenticated, service_role;

comment on function public.submit_booking_vgm_batch(uuid, jsonb, text) is
  'Registra, verifica y envia la VGM de varios contenedores en una transaccion; un error revierte todo el lote.';

-- HBL: aprobacion directa desde el draft; el resto de la funcion no cambia.
create or replace function public.transition_bill_of_lading(
  p_bl_id uuid,
  p_expected_status text,
  p_target_status text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.bills_of_lading%rowtype;
  v_new public.bills_of_lading%rowtype;
  v_transport_mode text;
  v_next_amendment integer;
  v_amendment public.bl_amendments%rowtype;
  v_booking_updated_at timestamptz;
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para cambiar el estado del BL'
      using errcode = '42501';
  end if;

  select bl.*
  into v_old
  from public.bills_of_lading bl
  where bl.id = p_bl_id
  for update;

  if not found then
    raise exception 'BL no encontrado'
      using errcode = 'P0002';
  end if;

  if v_old.status is distinct from p_expected_status
     or v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BL_VERSION_CONFLICT: el documento fue actualizado por otro usuario'
      using errcode = '40001';
  end if;

  if not (
    (v_old.status = 'MBL Draft' and p_target_status = 'MBL Validado')
    or (v_old.status = 'HBL Draft' and p_target_status = U&'Pendiente Aprobaci\00F3n Cliente')
    -- UX-OPS-04: la aprobacion del cliente se registra directo desde el draft.
    or (v_old.status = 'HBL Draft' and p_target_status = 'Aprobado por Cliente')
    or (v_old.status = U&'Pendiente Aprobaci\00F3n Cliente' and p_target_status = 'Aprobado por Cliente')
    or (v_old.status = 'Aprobado por Cliente' and p_target_status = 'Emitido')
    or (v_old.status = 'Emitido' and p_target_status = 'Liberado')
  ) then
    raise exception 'Transicion de BL no permitida: % -> %', v_old.status, p_target_status
      using errcode = '22023';
  end if;

  if nullif(btrim(v_old.bl_number), '') is null
     or nullif(btrim(v_old.shipper), '') is null
     or nullif(btrim(v_old.consignee), '') is null
     or nullif(btrim(v_old.port_of_loading), '') is null
     or nullif(btrim(v_old.port_of_discharge), '') is null
     or nullif(btrim(v_old.carrier), '') is null
     or nullif(btrim(v_old.description_of_goods), '') is null
     or coalesce(v_old.gross_weight_kg, 0) <= 0 then
    raise exception 'El BL no tiene completos los datos documentales obligatorios'
      using errcode = '23514';
  end if;

  select q.tipo_transporte
  into v_transport_mode
  from public.shipping_instructions si
  left join public.quotations q on q.id = si.quotation_id
  where si.id = v_old.shipping_instruction_id;

  if translate(
       lower(coalesce(v_transport_mode, '')),
       chr(225) || chr(233) || chr(237) || chr(243) || chr(250),
       'aeiou'
     ) like '%aereo%' then
    if nullif(btrim(v_old.voyage), '') is null then
      raise exception 'El numero de vuelo es obligatorio'
        using errcode = '23514';
    end if;
  elsif translate(
          lower(coalesce(v_transport_mode, '')),
          chr(225) || chr(233) || chr(237) || chr(243) || chr(250),
          'aeiou'
        ) not like '%terrestre%' then
    if nullif(btrim(v_old.vessel_name), '') is null
       or nullif(btrim(v_old.voyage), '') is null then
      raise exception 'Buque y voyage son obligatorios'
        using errcode = '23514';
    end if;
  end if;

  if v_old.bl_type = 'MBL'
     and p_target_status = 'MBL Validado'
     and nullif(btrim(v_old.draft_file_url), '') is null then
    raise exception 'El draft MBL del agente es obligatorio'
      using errcode = '23514';
  end if;

  update public.bills_of_lading bl
  set status = p_target_status,
      client_approved_at = case
        when p_target_status = 'Aprobado por Cliente' then clock_timestamp()
        else bl.client_approved_at
      end,
      client_approved_by = case
        when p_target_status = 'Aprobado por Cliente' then v_user_id::text
        else bl.client_approved_by
      end,
      issued_by = case
        when p_target_status = 'Emitido' then v_user_id
        else bl.issued_by
      end,
      issue_date = case
        when p_target_status = 'Emitido'
          then timezone('America/Tegucigalpa', clock_timestamp())::date
        else bl.issue_date
      end,
      release_date = case
        when p_target_status = 'Liberado'
          then timezone('America/Tegucigalpa', clock_timestamp())::date
        else bl.release_date
      end,
      updated_at = clock_timestamp()
  where bl.id = v_old.id
  returning * into v_new;

  select coalesce(max(a.amendment_number), 0) + 1
  into v_next_amendment
  from public.bl_amendments a
  where a.bl_id = v_new.id;

  insert into public.bl_amendments (
    bl_id,
    amendment_number,
    notes,
    changed_fields,
    status_before,
    status_after,
    created_by
  ) values (
    v_new.id,
    v_next_amendment,
    'Cambio de estado mediante flujo canonico',
    jsonb_build_object('status', v_old.status || ' -> ' || v_new.status),
    v_old.status,
    v_new.status,
    v_user_id
  )
  returning * into v_amendment;

  if (v_new.bl_type = 'MBL' and p_target_status = 'MBL Validado')
     or (v_new.bl_type = 'HBL' and p_target_status = 'Emitido') then
    select b.updated_at
    into v_booking_updated_at
    from public.update_booking_canonical(
      v_new.booking_id,
      v_new.shipping_instruction_id,
      (select current_booking.updated_at from public.bookings current_booking where current_booking.id = v_new.booking_id),
      case
        when v_new.bl_type = 'MBL'
          then jsonb_build_object('master_bl', v_new.bl_number)
        else jsonb_build_object('house_bl', v_new.bl_number)
      end
    ) b;
  else
    select b.updated_at
    into v_booking_updated_at
    from public.bookings b
    where b.id = v_new.booking_id;
  end if;

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
    'operations_bl',
    'status_change',
    'bill_of_lading',
    v_new.id,
    format('%s paso de "%s" a "%s"', v_new.bl_type, v_old.status, v_new.status),
    jsonb_build_object(
      'from', v_old.status,
      'to', v_new.status,
      'booking_id', v_new.booking_id
    )
  );

  return jsonb_build_object(
    'bill_of_lading', to_jsonb(v_new),
    'amendment', to_jsonb(v_amendment),
    'booking_updated_at', v_booking_updated_at
  );
end;
$$;

revoke all on function public.transition_bill_of_lading(uuid, text, text, timestamptz)
from public, anon;
grant execute on function public.transition_bill_of_lading(uuid, text, text, timestamptz)
to authenticated, service_role;

comment on function public.transition_bill_of_lading(uuid, text, text, timestamptz) is
  'Valida y cambia el estado documental de un BL (HBL Draft puede pasar directo a Aprobado por Cliente) con bitacora y sincronizacion canonica del booking.';

-- Fase 4C: timeline operativo canonico y transiciones controladas de Booking.
-- Migracion aditiva: conserva shipping_instruction_events y columnas legacy.

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  shipping_instruction_id uuid not null
    references public.shipping_instructions(id) on delete restrict,
  booking_id uuid
    references public.bookings(id) on delete set null,
  booking_container_id uuid
    references public.booking_containers(id) on delete set null,
  event_code text not null,
  event_label text not null,
  occurred_at timestamptz not null,
  location text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  source_system text not null default 'manual',
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_events_code_check check (
    event_code = any(array[
      'BOOKING_REQUESTED',
      'BOOKING_CONFIRMED',
      'EQUIPMENT_RELEASED',
      'CONTAINER_PICKED_UP',
      'CONTAINER_LOADED',
      'GATE_IN',
      'ON_BOARD',
      'DEPARTED',
      'TRANSSHIPMENT',
      'ARRIVED',
      'DISCHARGED',
      'CUSTOMS_RELEASED',
      'DELIVERED',
      'EMPTY_RETURNED',
      'BOOKING_COMPLETED',
      'OPERATIONAL_NOTE'
    ])
  ),
  constraint operational_events_source_check check (
    source_system = any(array['manual', 'transition', 'legacy', 'system'])
  ),
  constraint operational_events_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists uq_operational_events_source
  on public.operational_events(source_system, source_id)
  where source_id is not null;

create index if not exists idx_operational_events_si_occurred
  on public.operational_events(shipping_instruction_id, occurred_at desc, created_at desc);

create index if not exists idx_operational_events_booking_occurred
  on public.operational_events(booking_id, occurred_at desc, created_at desc)
  where booking_id is not null;

create index if not exists idx_operational_events_container
  on public.operational_events(booking_container_id)
  where booking_container_id is not null;

create or replace function public.validate_operational_event_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container_booking_id uuid;
begin
  if new.booking_id is not null
     and not exists (
       select 1
       from public.bookings b
       where b.id = new.booking_id
         and b.shipping_instruction_id = new.shipping_instruction_id
     ) then
    raise exception 'El booking no pertenece a la Shipping Instruction indicada'
      using errcode = '23514';
  end if;

  if new.booking_container_id is not null then
    if new.booking_id is null then
      raise exception 'Un evento de contenedor requiere booking_id'
        using errcode = '23514';
    end if;

    select bc.booking_id
    into v_container_booking_id
    from public.booking_containers bc
    where bc.id = new.booking_container_id;

    if v_container_booking_id is null
       or v_container_booking_id is distinct from new.booking_id then
      raise exception 'El contenedor no pertenece al booking indicado'
        using errcode = '23514';
    end if;
  end if;

  new.event_label := btrim(new.event_label);
  if new.event_label = '' then
    raise exception 'La etiqueta del evento es obligatoria'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := clock_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_operational_event_relationships
  on public.operational_events;

create trigger trg_validate_operational_event_relationships
before insert or update
on public.operational_events
for each row
execute function public.validate_operational_event_relationships();

alter table public.operational_events enable row level security;

drop policy if exists operational_events_select_operations
  on public.operational_events;
create policy operational_events_select_operations
on public.operational_events
for select
to authenticated
using (public.can_manage_operations());

drop policy if exists operational_events_insert_operations
  on public.operational_events;
create policy operational_events_insert_operations
on public.operational_events
for insert
to authenticated
with check (
  public.can_manage_operations()
  and created_by = auth.uid()
);

drop policy if exists operational_events_update_operations
  on public.operational_events;
create policy operational_events_update_operations
on public.operational_events
for update
to authenticated
using (public.can_manage_operations())
with check (public.can_manage_operations());

grant select on table public.operational_events to authenticated;
revoke insert, update, delete on table public.operational_events
  from public, anon, authenticated;

create or replace function public.canonical_operational_event_code(
  p_legacy_type text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(p_legacy_type, '')) ~ 'booking.*solicit'
      then 'BOOKING_REQUESTED'
    when lower(coalesce(p_legacy_type, '')) ~ 'booking.*confirm'
      then 'BOOKING_CONFIRMED'
    when lower(coalesce(p_legacy_type, '')) ~ 'equipment.*release|liberaci[oó]n.*equipo'
      then 'EQUIPMENT_RELEASED'
    when lower(coalesce(p_legacy_type, '')) ~ 'pick.*up|retiro.*contenedor'
      then 'CONTAINER_PICKED_UP'
    when lower(coalesce(p_legacy_type, '')) ~ 'container.*load|contenedor.*carg'
      then 'CONTAINER_LOADED'
    when lower(coalesce(p_legacy_type, '')) ~ 'gate[[:space:]]*in'
      then 'GATE_IN'
    when lower(coalesce(p_legacy_type, '')) ~ 'on[[:space:]]*board|a bordo'
      then 'ON_BOARD'
    when lower(coalesce(p_legacy_type, '')) ~ 'zarp|depart|salida'
      then 'DEPARTED'
    when lower(coalesce(p_legacy_type, '')) ~ 'transbord|transship'
      then 'TRANSSHIPMENT'
    when lower(coalesce(p_legacy_type, '')) ~ 'arrib|arriv'
      then 'ARRIVED'
    when lower(coalesce(p_legacy_type, '')) ~ 'descarg|discharg'
      then 'DISCHARGED'
    when lower(coalesce(p_legacy_type, '')) ~ 'aduan|customs.*release'
      then 'CUSTOMS_RELEASED'
    when lower(coalesce(p_legacy_type, '')) ~ 'entreg|deliver'
      then 'DELIVERED'
    when lower(coalesce(p_legacy_type, '')) ~ 'devoluci[oó]n.*vac|empty.*return'
      then 'EMPTY_RETURNED'
    when lower(coalesce(p_legacy_type, '')) ~ 'final|complet'
      then 'BOOKING_COMPLETED'
    else 'OPERATIONAL_NOTE'
  end;
$$;

create or replace function public.backfill_legacy_operational_events()
returns table(inserted_count integer, reconciled_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with legacy_source as (
    select
      e.*,
      public.canonical_operational_event_code(e.event_type) as mapped_code,
      concat_ws(' ', e.event_type, e.location, e.notes) as evidence_text,
      (
        select count(*)::integer
        from public.bookings b
        where b.shipping_instruction_id = e.shipping_instruction_id
      ) as booking_count
    from public.shipping_instruction_events e
  ),
  evidence_candidates as (
    select
      source.id as source_id,
      candidate.booking_id,
      count(candidate.booking_id) over (partition by source.id) as candidate_count
    from legacy_source source
    cross join lateral (
      select b.id as booking_id
      from public.bookings b
      where b.shipping_instruction_id = source.shipping_instruction_id
        and (
          (
            nullif(btrim(coalesce(b.booking_number, '')), '') is not null
            and lower(source.evidence_text) like
              '%' || lower(btrim(b.booking_number)) || '%'
          )
          or (
            nullif(btrim(coalesce(b.carrier_booking, '')), '') is not null
            and lower(source.evidence_text) like
              '%' || lower(btrim(b.carrier_booking)) || '%'
          )
          or (
            nullif(btrim(coalesce(b.master_bl, '')), '') is not null
            and lower(source.evidence_text) like
              '%' || lower(btrim(b.master_bl)) || '%'
          )
          or (
            nullif(btrim(coalesce(b.house_bl, '')), '') is not null
            and lower(source.evidence_text) like
              '%' || lower(btrim(b.house_bl)) || '%'
          )
          or exists (
            select 1
            from public.booking_containers bc
            where bc.booking_id = b.id
              and nullif(btrim(coalesce(bc.notes, '')), '') is not null
              and lower(source.evidence_text) like
                '%' || lower(btrim(bc.notes)) || '%'
          )
        )
    ) candidate
  ),
  resolved as (
    select
      source.*,
      case
        when source.mapped_code = 'OPERATIONAL_NOTE' then null
        when source.booking_count = 1 then (
          select b.id
          from public.bookings b
          where b.shipping_instruction_id = source.shipping_instruction_id
          limit 1
        )
        when source.booking_count > 1
          and coalesce((
            select max(ec.candidate_count)
            from evidence_candidates ec
            where ec.source_id = source.id
          ), 0) = 1 then (
            select ec.booking_id
            from evidence_candidates ec
            where ec.source_id = source.id
            limit 1
          )
        else null
      end as resolved_booking_id,
      case
        when source.mapped_code = 'OPERATIONAL_NOTE'
          then 'si_level_note'
        when source.booking_count = 0
          then 'si_without_booking'
        when source.booking_count = 1
          then 'single_booking'
        when source.booking_count > 1
          and coalesce((
            select max(ec.candidate_count)
            from evidence_candidates ec
            where ec.source_id = source.id
          ), 0) = 1
          then 'matched_unique_reference'
        else 'unresolved_multi_booking'
      end as resolution
    from legacy_source source
  )
  insert into public.operational_events (
    shipping_instruction_id,
    booking_id,
    event_code,
    event_label,
    occurred_at,
    location,
    notes,
    metadata,
    source_system,
    source_id,
    created_by,
    created_at,
    updated_at
  )
  select
    r.shipping_instruction_id,
    r.resolved_booking_id,
    r.mapped_code,
    r.event_type,
    r.event_date,
    r.location,
    r.notes,
    jsonb_build_object(
      'legacy_event_type', r.event_type,
      'migration_resolution', r.resolution
    ),
    'legacy',
    r.id,
    r.created_by,
    coalesce(r.created_at, r.event_date),
    coalesce(r.created_at, r.event_date)
  from resolved r
  on conflict (source_system, source_id)
    where source_id is not null
  do nothing;

  get diagnostics v_inserted = row_count;

  return query
  select
    v_inserted,
    (
      select count(*)::integer
      from public.operational_events oe
      join public.shipping_instruction_events e
        on oe.source_system = 'legacy'
       and oe.source_id = e.id
    );
end;
$$;

revoke all on function public.backfill_legacy_operational_events()
  from public, anon, authenticated;

create or replace function public.record_operational_event(
  p_shipping_instruction_id uuid,
  p_booking_id uuid default null,
  p_booking_container_id uuid default null,
  p_event_code text default 'OPERATIONAL_NOTE',
  p_event_label text default null,
  p_occurred_at timestamptz default now(),
  p_location text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.operational_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.operational_events%rowtype;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para registrar eventos operativos'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.shipping_instructions si
    where si.id = p_shipping_instruction_id
      and si.deleted_at is null
  ) then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if p_event_code is null
     or p_event_code <> all(array[
       'BOOKING_REQUESTED', 'BOOKING_CONFIRMED', 'EQUIPMENT_RELEASED',
       'CONTAINER_PICKED_UP', 'CONTAINER_LOADED', 'GATE_IN', 'ON_BOARD',
       'DEPARTED', 'TRANSSHIPMENT', 'ARRIVED', 'DISCHARGED',
       'CUSTOMS_RELEASED', 'DELIVERED', 'EMPTY_RETURNED',
       'BOOKING_COMPLETED', 'OPERATIONAL_NOTE'
     ]) then
    raise exception 'Codigo de evento operativo no permitido: %', p_event_code
      using errcode = '22023';
  end if;

  if p_event_code = 'OPERATIONAL_NOTE'
     and (
       nullif(btrim(coalesce(p_event_label, '')), '') is null
       or nullif(btrim(coalesce(p_notes, '')), '') is null
     ) then
    raise exception 'Una nota operativa requiere etiqueta y notas'
      using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  insert into public.operational_events (
    shipping_instruction_id,
    booking_id,
    booking_container_id,
    event_code,
    event_label,
    occurred_at,
    location,
    notes,
    metadata,
    source_system,
    created_by
  ) values (
    p_shipping_instruction_id,
    p_booking_id,
    p_booking_container_id,
    p_event_code,
    coalesce(
      nullif(btrim(coalesce(p_event_label, '')), ''),
      initcap(replace(lower(p_event_code), '_', ' '))
    ),
    coalesce(p_occurred_at, now()),
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_metadata,
    'manual',
    v_user_id
  )
  returning * into v_event;

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
    'operations_timeline',
    'operational_event_created',
    case when p_booking_id is null then 'shipping_instruction' else 'booking' end,
    coalesce(p_booking_id, p_shipping_instruction_id),
    'Evento operativo registrado',
    jsonb_build_object(
      'event_id', v_event.id,
      'event_code', v_event.event_code,
      'shipping_instruction_id', p_shipping_instruction_id,
      'booking_id', p_booking_id,
      'booking_container_id', p_booking_container_id
    )
  );

  return next v_event;
end;
$$;

create or replace function public.get_booking_operational_timeline(
  p_booking_id uuid
)
returns table (
  id uuid,
  shipping_instruction_id uuid,
  booking_id uuid,
  booking_container_id uuid,
  event_code text,
  event_label text,
  occurred_at timestamptz,
  location text,
  notes text,
  metadata jsonb,
  source_system text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_shipping_instruction_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para consultar el timeline operativo'
      using errcode = '42501';
  end if;

  select b.shipping_instruction_id
  into v_shipping_instruction_id
  from public.bookings b
  where b.id = p_booking_id;

  if v_shipping_instruction_id is null then
    raise exception 'Booking no encontrado'
      using errcode = 'P0002';
  end if;

  return query
  select
    oe.id,
    oe.shipping_instruction_id,
    oe.booking_id,
    oe.booking_container_id,
    oe.event_code,
    oe.event_label,
    oe.occurred_at,
    oe.location,
    oe.notes,
    oe.metadata,
    oe.source_system,
    oe.created_by,
    nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), '') as created_by_name,
    oe.created_at,
    oe.updated_at
  from public.operational_events oe
  left join public.profiles p on p.id = oe.created_by
  where oe.shipping_instruction_id = v_shipping_instruction_id
    and (oe.booking_id = p_booking_id or oe.booking_id is null)
  order by oe.occurred_at desc, oe.created_at desc, oe.id desc;
end;
$$;

create or replace function public.transition_booking_status(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_target_status text,
  p_occurred_at timestamptz default now(),
  p_location text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
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
  v_event public.operational_events%rowtype;
  v_previous_status text;
  v_target_status text := btrim(coalesce(p_target_status, ''));
  v_event_code text;
  v_event_label text;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_container_count integer;
  v_warning_messages jsonb := '[]'::jsonb;
  v_missing_documents text[];
  v_expected_containers numeric := 0;
  v_assigned_containers numeric := 0;
  v_completion_exception boolean :=
    coalesce((p_metadata ->> 'completion_exception')::boolean, false);
  v_confirm_actual_date_override boolean :=
    coalesce((p_metadata ->> 'confirm_actual_date_override')::boolean, false);
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para cambiar el estado del booking'
      using errcode = '42501';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  select *
  into v_old
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking no encontrado'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_VERSION_CONFLICT: el booking fue actualizado por otro usuario'
      using errcode = '40001';
  end if;

  v_previous_status := coalesce(nullif(btrim(v_old.shipment_status), ''), 'Booking Solicitado');

  if v_previous_status = 'Finalizado' then
    raise exception 'El booking finalizado es inmutable; utiliza la reapertura autorizada'
      using errcode = '55000';
  end if;

  if v_previous_status = 'Cancelada' then
    raise exception 'Un booking cancelado no puede avanzar sin reapertura autorizada'
      using errcode = '55000';
  end if;

  if not (
    (v_previous_status in ('Pendiente Validación', 'Listo para Booking')
      and v_target_status = 'Booking Solicitado')
    or (v_previous_status = 'Booking Solicitado'
      and v_target_status = 'Booking Confirmado')
    or (v_previous_status = 'Booking Confirmado'
      and v_target_status = 'Documentación Pendiente')
    or (v_previous_status = 'Documentación Pendiente'
      and v_target_status = 'Listo para Embarque')
    or (v_previous_status = 'Listo para Embarque'
      and v_target_status = 'Embarcado')
    or (v_previous_status = 'Embarcado'
      and v_target_status = 'En Tránsito')
    or (v_previous_status = 'En Tránsito'
      and v_target_status = 'Arribado')
    or (v_previous_status = 'Arribado'
      and v_target_status = 'Finalizado')
  ) then
    raise exception 'Transicion no permitida: % -> %',
      v_previous_status, v_target_status
      using errcode = '22023';
  end if;

  select coalesce(sum(bc.quantity), 0)::integer
  into v_container_count
  from public.booking_containers bc
  where bc.booking_id = v_old.id;

  if v_target_status = 'Booking Confirmado' then
    if nullif(btrim(coalesce(v_old.booking_number, '')), '') is null
       and nullif(btrim(coalesce(v_old.carrier_booking, '')), '') is null then
      raise exception 'Faltan campos para confirmar: booking number o carrier booking'
        using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(v_old.carrier, '')), '') is null then
      raise exception 'Faltan campos para confirmar: carrier'
        using errcode = '23514';
    end if;
    if v_old.etd is null or v_old.eta is null then
      raise exception 'Faltan campos para confirmar: ETD y ETA'
        using errcode = '23514';
    end if;

    if v_container_count = 0 then
      v_warning_messages := v_warning_messages ||
        jsonb_build_array('Booking confirmado sin contenedores asignados; será obligatorio antes de Listo para Embarque.');
    end if;

    if not exists (
      select 1
      from public.booking_documents bd
      where bd.booking_id = v_old.id
        and bd.document_type = 'Booking Confirmation'
    ) then
      v_warning_messages := v_warning_messages ||
        jsonb_build_array('Booking Confirmation no cargado; rollout 4C en modo warning hasta Listo para Embarque.');
    end if;
  end if;

  if v_target_status = 'Listo para Embarque' then
    if nullif(btrim(coalesce(v_old.vessel_name, '')), '') is null
       or nullif(btrim(coalesce(v_old.voyage, '')), '') is null
       or v_old.etd is null then
      raise exception 'Faltan campos para marcar listo: vessel, voyage y ETD'
        using errcode = '23514';
    end if;
    if v_container_count = 0 then
      raise exception 'Debes asignar al menos un contenedor antes de marcar listo'
        using errcode = '23514';
    end if;

    select array_agg(required.document_type order by required.document_type)
    into v_missing_documents
    from unnest(array[
      'Booking Confirmation',
      'Commercial Invoice',
      'Packing List'
    ]) as required(document_type)
    where not exists (
      select 1
      from public.booking_documents bd
      where bd.booking_id = v_old.id
        and bd.document_type = required.document_type
    );

    if coalesce(array_length(v_missing_documents, 1), 0) > 0 then
      raise exception 'Documentos mínimos pendientes: %',
        array_to_string(v_missing_documents, ', ')
        using errcode = '23514';
    end if;
  end if;

  if v_target_status in ('Embarcado', 'En Tránsito') then
    if nullif(btrim(coalesce(v_old.vessel_name, '')), '') is null
       or nullif(btrim(coalesce(v_old.voyage, '')), '') is null then
      raise exception 'Faltan vessel y voyage para registrar la salida'
        using errcode = '23514';
    end if;
    if v_container_count = 0 then
      raise exception 'Debes asignar al menos un contenedor para registrar la salida'
        using errcode = '23514';
    end if;
    if v_old.actual_etd is not null
       and v_old.actual_etd is distinct from v_occurred_at::date
       and not v_confirm_actual_date_override then
      raise exception 'La fecha real de salida existente es distinta; confirma el reemplazo'
        using errcode = '22023';
    end if;
  end if;

  if v_target_status = 'Arribado'
     and v_old.actual_eta is not null
     and v_old.actual_eta is distinct from v_occurred_at::date
     and not v_confirm_actual_date_override then
    raise exception 'La fecha real de arribo existente es distinta; confirma el reemplazo'
      using errcode = '22023';
  end if;

  if v_target_status = 'Finalizado' then
    if v_container_count = 0 then
      raise exception 'No se puede finalizar sin contenedores asignados'
        using errcode = '23514';
    end if;

    select coalesce(sum(qc.quantity), 0)
    into v_expected_containers
    from public.shipping_instructions si
    join public.quotation_containers qc on qc.quotation_id = si.quotation_id
    where si.id = v_old.shipping_instruction_id;

    select coalesce(sum(bc.quantity), 0)
    into v_assigned_containers
    from public.bookings sibling
    join public.booking_containers bc on bc.booking_id = sibling.id
    where sibling.shipping_instruction_id = v_old.shipping_instruction_id
      and coalesce(sibling.shipment_status, '') <> 'Cancelada';

    if v_expected_containers > 0
       and v_assigned_containers <> v_expected_containers then
      raise exception 'La distribución de contenedores está incompleta: asignados %, cotizados %',
        v_assigned_containers, v_expected_containers
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.operational_events oe
      where oe.booking_id = v_old.id
        and oe.event_code = 'DELIVERED'
    ) and not v_completion_exception then
      raise exception 'Debes registrar la entrega antes de finalizar o documentar una excepción'
        using errcode = '23514';
    end if;

    if v_completion_exception
       and nullif(btrim(coalesce(p_notes, '')), '') is null then
      raise exception 'El motivo es obligatorio para finalizar con excepción'
        using errcode = '22023';
    end if;

    select array_agg(required.document_type order by required.document_type)
    into v_missing_documents
    from unnest(array[
      'Booking Confirmation',
      'Commercial Invoice',
      'House BL',
      'Master BL',
      'Packing List'
    ]) as required(document_type)
    where not (
      exists (
        select 1
        from public.booking_documents bd
        where bd.booking_id = v_old.id
          and bd.document_type = required.document_type
      )
      or (
        required.document_type = 'Master BL'
        and (
          nullif(btrim(coalesce(v_old.master_bl, '')), '') is not null
          or exists (
            select 1
            from public.bills_of_lading bl
            where bl.booking_id = v_old.id
              and bl.bl_type = 'MBL'
          )
        )
      )
      or (
        required.document_type = 'House BL'
        and (
          nullif(btrim(coalesce(v_old.house_bl, '')), '') is not null
          or exists (
            select 1
            from public.bills_of_lading bl
            where bl.booking_id = v_old.id
              and bl.bl_type = 'HBL'
          )
        )
      )
    );

    if coalesce(array_length(v_missing_documents, 1), 0) > 0 then
      raise exception 'Requisitos obligatorios pendientes: %',
        array_to_string(v_missing_documents, ', ')
        using errcode = '23514';
    end if;
  end if;

  v_event_code := case v_target_status
    when 'Booking Solicitado' then 'BOOKING_REQUESTED'
    when 'Booking Confirmado' then 'BOOKING_CONFIRMED'
    when 'Documentación Pendiente' then 'OPERATIONAL_NOTE'
    when 'Listo para Embarque' then 'CONTAINER_LOADED'
    when 'Embarcado' then 'ON_BOARD'
    when 'En Tránsito' then 'DEPARTED'
    when 'Arribado' then 'ARRIVED'
    when 'Finalizado' then 'BOOKING_COMPLETED'
  end;

  v_event_label := case v_target_status
    when 'Booking Solicitado' then 'Booking solicitado'
    when 'Booking Confirmado' then 'Booking confirmado'
    when 'Documentación Pendiente' then 'Documentación pendiente'
    when 'Listo para Embarque' then 'Listo para embarque'
    when 'Embarcado' then 'Embarque registrado'
    when 'En Tránsito' then 'Salida real registrada'
    when 'Arribado' then 'Arribo registrado'
    when 'Finalizado' then 'Booking finalizado'
  end;

  update public.bookings b
  set shipment_status = v_target_status,
      actual_etd = case
        when v_target_status in ('Embarcado', 'En Tránsito')
          then v_occurred_at::date
        else b.actual_etd
      end,
      actual_eta = case
        when v_target_status = 'Arribado'
          then v_occurred_at::date
        else b.actual_eta
      end,
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  insert into public.operational_events (
    shipping_instruction_id,
    booking_id,
    event_code,
    event_label,
    occurred_at,
    location,
    notes,
    metadata,
    source_system,
    created_by
  ) values (
    v_new.shipping_instruction_id,
    v_new.id,
    v_event_code,
    v_event_label,
    v_occurred_at,
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_metadata || jsonb_build_object(
      'previous_status', v_previous_status,
      'target_status', v_target_status,
      'validation_warnings', v_warning_messages
    ),
    'transition',
    v_user_id
  )
  returning * into v_event;

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
    'booking_status_transitioned',
    'booking',
    v_new.id,
    format('Booking cambió de %s a %s', v_previous_status, v_target_status),
    jsonb_build_object(
      'shipping_instruction_id', v_new.shipping_instruction_id,
      'event_id', v_event.id,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new),
      'warnings', v_warning_messages
    )
  );

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'event', to_jsonb(v_event),
    'warnings', v_warning_messages
  );
end;
$$;

create or replace function public.reopen_booking(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_target_status text,
  p_reason text,
  p_acknowledge_issued_documents boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_event public.operational_events%rowtype;
  v_target_status text := btrim(coalesce(p_target_status, ''));
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  select rol::text
  into v_role
  from public.profiles
  where id = v_user_id
    and status = 'Aprobado'
    and is_active = true;

  if v_role is distinct from 'Admin' then
    raise exception 'Solo Admin puede reabrir bookings'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de reapertura es obligatorio'
      using errcode = '22023';
  end if;

  if v_target_status not in (
    'Booking Solicitado',
    'Booking Confirmado',
    'Documentación Pendiente',
    'Listo para Embarque',
    'Embarcado',
    'En Tránsito',
    'Arribado'
  ) then
    raise exception 'Estado de reapertura no permitido'
      using errcode = '22023';
  end if;

  select *
  into v_old
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking no encontrado'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_VERSION_CONFLICT: el booking fue actualizado por otro usuario'
      using errcode = '40001';
  end if;

  if v_old.shipment_status not in ('Finalizado', 'Cancelada') then
    raise exception 'La reapertura solo aplica a bookings finalizados o cancelados'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.bills_of_lading bl
    where bl.booking_id = v_old.id
      and lower(coalesce(bl.status, '')) ~ 'emit|liberad|released|issued'
  ) and not p_acknowledge_issued_documents then
    raise exception 'Existen BL emitidos; debes confirmar expresamente que fueron revisados'
      using errcode = '23514';
  end if;

  update public.bookings
  set shipment_status = v_target_status,
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  insert into public.operational_events (
    shipping_instruction_id,
    booking_id,
    event_code,
    event_label,
    occurred_at,
    notes,
    metadata,
    source_system,
    created_by
  ) values (
    v_new.shipping_instruction_id,
    v_new.id,
    'OPERATIONAL_NOTE',
    'Booking reabierto',
    now(),
    btrim(p_reason),
    jsonb_build_object(
      'previous_status', v_old.shipment_status,
      'target_status', v_target_status,
      'issued_documents_acknowledged', p_acknowledge_issued_documents
    ),
    'system',
    v_user_id
  )
  returning * into v_event;

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
    'booking_reopened',
    'booking',
    v_new.id,
    'Booking reabierto por Admin',
    jsonb_build_object(
      'event_id', v_event.id,
      'reason', btrim(p_reason),
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new)
    )
  );

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'event', to_jsonb(v_event)
  );
end;
$$;

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
  v_active text[];
begin
  select array_agg(coalesce(nullif(btrim(b.shipment_status), ''), 'Booking Solicitado'))
  into v_statuses
  from public.bookings b
  where b.shipping_instruction_id = p_shipping_instruction_id;

  if coalesce(array_length(v_statuses, 1), 0) = 0 then
    return coalesce(nullif(btrim(p_fallback_status), ''), 'Sin bookings');
  end if;

  if not exists (
    select 1 from unnest(v_statuses) s where s <> 'Cancelada'
  ) then
    return 'Cancelada';
  end if;

  select array_agg(s)
  into v_active
  from unnest(v_statuses) s
  where s <> 'Cancelada';

  if not exists (
    select 1 from unnest(v_active) s where s <> 'Finalizado'
  ) then
    return 'Finalizado';
  end if;

  if 'Arribado' = any(v_active)
     or 'Finalizado' = any(v_active) then
    if not exists (
      select 1
      from unnest(v_active) s
      where s not in ('Arribado', 'Finalizado')
    ) then
      return 'Arribado';
    end if;
    return 'Arribo Parcial';
  end if;

  if 'En Tránsito' = any(v_active) then
    return 'En Tránsito';
  end if;

  if 'Embarcado' = any(v_active) then
    return 'Embarcado';
  end if;

  if not exists (
    select 1
    from unnest(v_active) s
    where s not in (
      'Booking Confirmado',
      'Documentación Pendiente',
      'Listo para Embarque'
    )
  ) then
    return 'Booking Confirmado';
  end if;

  if 'Booking Solicitado' = any(v_active)
     and exists (
       select 1
       from unnest(v_active) s
       where s in (
         'Booking Confirmado',
         'Documentación Pendiente',
         'Listo para Embarque'
       )
     ) then
    return 'Parcialmente Confirmado';
  end if;

  if not exists (
    select 1 from unnest(v_active) s where s <> 'Booking Solicitado'
  ) then
    return 'Booking Solicitado';
  end if;

  return 'En proceso';
end;
$$;

create or replace function public.finalize_shipping_instruction_canonical(
  p_shipping_instruction_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.shipping_instructions%rowtype;
  v_new public.shipping_instructions%rowtype;
  v_event public.operational_events%rowtype;
  v_active_count integer;
  v_pending_count integer;
  v_expected_containers numeric := 0;
  v_assigned_containers numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para finalizar la Shipping Instruction'
      using errcode = '42501';
  end if;

  select *
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'SHIPPING_INSTRUCTION_VERSION_CONFLICT: la SI fue actualizada por otro usuario'
      using errcode = '40001';
  end if;

  if coalesce(v_old.operational_status, '') = 'Cancelada' then
    raise exception 'No se puede finalizar una Shipping Instruction cancelada'
      using errcode = '55000';
  end if;

  perform b.id
  from public.bookings b
  where b.shipping_instruction_id = v_old.id
  order by b.id
  for update;

  select
    count(*) filter (where coalesce(b.shipment_status, '') <> 'Cancelada')::integer,
    count(*) filter (
      where coalesce(b.shipment_status, '') <> 'Cancelada'
        and coalesce(b.shipment_status, '') <> 'Finalizado'
    )::integer
  into v_active_count, v_pending_count
  from public.bookings b
  where b.shipping_instruction_id = v_old.id;

  if v_active_count = 0 then
    raise exception 'Se requiere al menos un booking activo para finalizar'
      using errcode = '23514';
  end if;

  if v_pending_count > 0 then
    raise exception 'Todos los bookings activos deben estar finalizados'
      using errcode = '23514';
  end if;

  select coalesce(sum(qc.quantity), 0)
  into v_expected_containers
  from public.quotation_containers qc
  where qc.quotation_id = v_old.quotation_id;

  if v_expected_containers = 0 then
    v_expected_containers := coalesce(v_old.container_qty, 0);
  end if;

  select coalesce(sum(bc.quantity), 0)
  into v_assigned_containers
  from public.bookings b
  join public.booking_containers bc on bc.booking_id = b.id
  where b.shipping_instruction_id = v_old.id
    and coalesce(b.shipment_status, '') <> 'Cancelada';

  if v_expected_containers > 0
     and v_assigned_containers <> v_expected_containers then
    raise exception 'Distribución de contenedores incompleta: asignados %, cotizados %',
      v_assigned_containers, v_expected_containers
      using errcode = '23514';
  end if;

  if v_assigned_containers <= 0 then
    raise exception 'No se puede finalizar sin contenedores asignados'
      using errcode = '23514';
  end if;

  update public.shipping_instructions
  set operational_status = 'Finalizado',
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  insert into public.operational_events (
    shipping_instruction_id,
    event_code,
    event_label,
    occurred_at,
    notes,
    metadata,
    source_system,
    created_by
  ) values (
    v_new.id,
    'BOOKING_COMPLETED',
    'Shipping Instruction finalizada',
    now(),
    format('Shipping Instruction %s finalizada', v_new.routing_number),
    jsonb_build_object(
      'active_bookings', v_active_count,
      'cancelled_bookings_ignored', (
        select count(*)
        from public.bookings b
        where b.shipping_instruction_id = v_new.id
          and b.shipment_status = 'Cancelada'
      ),
      'assigned_containers', v_assigned_containers
    ),
    'system',
    v_user_id
  )
  returning * into v_event;

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
    'operations_routing',
    'shipping_instruction_finalized_canonical',
    'shipping_instruction',
    v_new.id,
    format('Shipping Instruction %s finalizada', v_new.routing_number),
    jsonb_build_object(
      'event_id', v_event.id,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new),
      'active_bookings', v_active_count,
      'assigned_containers', v_assigned_containers
    )
  );

  return jsonb_build_object(
    'shipping_instruction', to_jsonb(v_new),
    'event', to_jsonb(v_event)
  );
end;
$$;

-- Mantiene la edicion canonica de campos, pero excluye shipment_status.
-- Un booking finalizado solo puede cambiarse mediante reopen_booking.
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
    'booking_number', 'carrier_booking', 'master_bl', 'house_bl', 'carrier',
    'vessel_name', 'voyage', 'etd', 'eta', 'original_eta', 'actual_etd',
    'actual_eta', 'tracking_url', 'estimated_transit_days',
    'real_transit_days', 'free_days', 'remaining_free_days', 'freight_terms',
    'release_type', 'hbl_freight_visibility', 'printed_at_destination',
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

  if v_old.shipment_status = 'Finalizado' then
    raise exception 'El booking finalizado es inmutable; utiliza la reapertura autorizada'
      using errcode = '55000';
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
    'booking_canonical_updated',
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

revoke all on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) from public, anon;
revoke all on function public.get_booking_operational_timeline(uuid)
  from public, anon;
revoke all on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) from public, anon;
revoke all on function public.reopen_booking(
  uuid, timestamptz, text, text, boolean
) from public, anon;
revoke all on function public.finalize_shipping_instruction_canonical(
  uuid, timestamptz
) from public, anon;
revoke all on function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) from public, anon;

grant execute on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) to authenticated;
grant execute on function public.get_booking_operational_timeline(uuid)
  to authenticated;
grant execute on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) to authenticated;
grant execute on function public.reopen_booking(
  uuid, timestamptz, text, text, boolean
) to authenticated;
grant execute on function public.finalize_shipping_instruction_canonical(
  uuid, timestamptz
) to authenticated;
grant execute on function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) to authenticated;

-- Backfill una vez durante la migracion; la funcion permanece idempotente para
-- reconciliacion local/manual por el owner.
select * from public.backfill_legacy_operational_events();

notify pgrst, 'reload schema';

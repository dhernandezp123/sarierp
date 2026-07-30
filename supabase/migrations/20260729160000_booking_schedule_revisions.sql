-- Fase 5B: historial inmutable de itinerario y ciclo de vida de bookings.
-- Aditiva: no elimina bookings, documentos, BL, contenedores ni eventos.

alter table public.bookings
  add column if not exists original_etd date,
  add column if not exists routing_summary text,
  add column if not exists booking_lifecycle_status text not null default 'ACTIVE',
  add column if not exists supersedes_booking_id uuid,
  add column if not exists replaced_by_booking_id uuid,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists client_schedule_notified_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_lifecycle_status_check;
alter table public.bookings
  add constraint bookings_lifecycle_status_check
  check (booking_lifecycle_status = any (array['ACTIVE', 'CANCELLED', 'REPLACED']));

alter table public.bookings
  drop constraint if exists bookings_supersedes_booking_id_fkey;
alter table public.bookings
  add constraint bookings_supersedes_booking_id_fkey
  foreign key (supersedes_booking_id)
  references public.bookings(id)
  on delete restrict;

alter table public.bookings
  drop constraint if exists bookings_replaced_by_booking_id_fkey;
alter table public.bookings
  add constraint bookings_replaced_by_booking_id_fkey
  foreign key (replaced_by_booking_id)
  references public.bookings(id)
  on delete restrict;

alter table public.bookings
  drop constraint if exists bookings_cancelled_by_fkey;
alter table public.bookings
  add constraint bookings_cancelled_by_fkey
  foreign key (cancelled_by)
  references auth.users(id)
  on delete set null;

alter table public.bookings
  drop constraint if exists bookings_replacement_not_self_check;
alter table public.bookings
  add constraint bookings_replacement_not_self_check
  check (
    (supersedes_booking_id is null or supersedes_booking_id <> id)
    and (replaced_by_booking_id is null or replaced_by_booking_id <> id)
  );

create index if not exists idx_bookings_lifecycle_shipment
  on public.bookings(shipment_id, booking_lifecycle_status);
create index if not exists idx_bookings_supersedes_booking
  on public.bookings(supersedes_booking_id)
  where supersedes_booking_id is not null;
create index if not exists idx_bookings_replaced_by_booking
  on public.bookings(replaced_by_booking_id)
  where replaced_by_booking_id is not null;

-- Los cancelados historicos no tienen evidencia suficiente para inferir un
-- reemplazo. Se clasifican conservadoramente como CANCELLED sin tocar su
-- estado, documentos, fechas operativas ni relaciones.
update public.bookings b
set booking_lifecycle_status = 'CANCELLED',
    cancellation_reason = coalesce(
      nullif(btrim(b.cancellation_reason), ''),
      'Cancelacion historica clasificada por Fase 5B'
    ),
    cancelled_at = coalesce(b.cancelled_at, b.updated_at, b.created_at, now())
where b.shipment_status = 'Cancelada'
  and b.booking_lifecycle_status = 'ACTIVE';

alter table public.operational_events
  drop constraint if exists operational_events_code_check;
alter table public.operational_events
  add constraint operational_events_code_check
  check (
    event_code = any (
      array[
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
        'OPERATIONAL_NOTE',
        'SCHEDULE_REVISED',
        'BOOKING_ROLLED_OVER',
        'BOOKING_REPLACED',
        'BOOKING_CANCELLED',
        'BOOKING_REACTIVATED'
      ]
    )
  );

create table if not exists public.booking_schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null
    references public.shipments(id) on delete restrict,
  booking_id uuid not null
    references public.bookings(id) on delete restrict,
  revision_number integer not null,
  revision_type text not null,
  carrier text,
  booking_number text,
  carrier_booking text,
  vessel_name text,
  voyage text,
  etd date,
  eta date,
  routing_summary text,
  reason text,
  source text not null,
  effective_at timestamptz not null default now(),
  client_notified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint booking_schedule_revisions_number_check
    check (revision_number > 0),
  constraint booking_schedule_revisions_type_check
    check (
      revision_type = any (
        array[
          'INITIAL',
          'SCHEDULE_CHANGE',
          'ROLLOVER_SAME_BOOKING',
          'CARRIER_UPDATE',
          'ROUTING_CHANGE',
          'ADMIN_CORRECTION'
        ]
      )
    ),
  constraint booking_schedule_revisions_source_check
    check (
      source = any (
        array[
          'booking_creation',
          'phase_5b_backfill',
          'operations',
          'pricing_sync',
          'admin'
        ]
      )
    ),
  constraint booking_schedule_revisions_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint booking_schedule_revisions_booking_number_unique
    unique (booking_id, revision_number)
);

create index if not exists idx_booking_schedule_revisions_booking
  on public.booking_schedule_revisions(
    booking_id,
    revision_number desc,
    created_at desc
  );
create index if not exists idx_booking_schedule_revisions_shipment
  on public.booking_schedule_revisions(
    shipment_id,
    effective_at desc,
    created_at desc
  );

alter table public.booking_schedule_revisions enable row level security;

drop policy if exists booking_schedule_revisions_select
  on public.booking_schedule_revisions;
create policy booking_schedule_revisions_select
on public.booking_schedule_revisions
for select
to authenticated
using (public.can_select_shipment(shipment_id));

revoke all on table public.booking_schedule_revisions
  from public, anon, authenticated;
grant select on table public.booking_schedule_revisions
  to authenticated;
grant all on table public.booking_schedule_revisions
  to service_role;
revoke insert, update, delete on table public.operational_events
  from authenticated;

-- La primera evidencia disponible se conserva como original. No se inventan
-- fechas cuando ETD/ETA actuales tambien son null.
update public.bookings
set original_etd = etd
where original_etd is null
  and etd is not null;

update public.bookings
set original_eta = eta
where original_eta is null
  and eta is not null;

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
  created_at,
  metadata
)
select
  b.shipment_id,
  b.id,
  1,
  'INITIAL',
  b.carrier,
  b.booking_number,
  b.carrier_booking,
  b.vessel_name,
  b.voyage,
  b.etd,
  b.eta,
  b.routing_summary,
  'Itinerario inicial conocido al habilitar Fase 5B',
  'phase_5b_backfill',
  coalesce(b.created_at, now()),
  b.created_by,
  coalesce(b.created_at, now()),
  jsonb_build_object(
    'source', 'phase_5b_backfill',
    'historical_schedule_completeness', 'partial',
    'original_schedule_inferred',
      (b.original_etd is not null or b.original_eta is not null),
    'inference_source', 'current_booking_values'
  )
from public.bookings b
where b.shipment_id is not null
  and (
    nullif(btrim(coalesce(b.carrier, '')), '') is not null
    or nullif(btrim(coalesce(b.booking_number, '')), '') is not null
    or nullif(btrim(coalesce(b.carrier_booking, '')), '') is not null
    or nullif(btrim(coalesce(b.vessel_name, '')), '') is not null
    or nullif(btrim(coalesce(b.voyage, '')), '') is not null
    or b.etd is not null
    or b.eta is not null
    or nullif(btrim(coalesce(b.routing_summary, '')), '') is not null
  )
  and not exists (
    select 1
    from public.booking_schedule_revisions existing
    where existing.booking_id = b.id
      and existing.revision_number = 1
  )
on conflict (booking_id, revision_number) do nothing;

create or replace function public.protect_booking_schedule_revision_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Las revisiones historicas de itinerario son inmutables'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_protect_booking_schedule_revision_history
  on public.booking_schedule_revisions;
create trigger trg_protect_booking_schedule_revision_history
before update or delete
on public.booking_schedule_revisions
for each row
execute function public.protect_booking_schedule_revision_history();

create or replace function public.validate_booking_replacement_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_related_shipment_id uuid;
  v_cycle boolean := false;
begin
  if new.supersedes_booking_id is not null then
    select b.shipment_id
    into v_related_shipment_id
    from public.bookings b
    where b.id = new.supersedes_booking_id;

    if v_related_shipment_id is null then
      raise exception 'El booking reemplazado no existe'
        using errcode = '23503';
    end if;

    if v_related_shipment_id is distinct from new.shipment_id then
      raise exception 'Los bookings relacionados deben pertenecer al mismo shipment'
        using errcode = '23514';
    end if;

    with recursive ancestors as (
      select b.id, b.supersedes_booking_id
      from public.bookings b
      where b.id = new.supersedes_booking_id
      union all
      select parent.id, parent.supersedes_booking_id
      from public.bookings parent
      join ancestors child on parent.id = child.supersedes_booking_id
      where parent.id <> new.id
    )
    select exists (
      select 1
      from ancestors
      where id = new.id
         or supersedes_booking_id = new.id
    )
    into v_cycle;

    if v_cycle then
      raise exception 'La relacion de reemplazo crearia un ciclo'
        using errcode = '23514';
    end if;
  end if;

  if new.replaced_by_booking_id is not null then
    select b.shipment_id
    into v_related_shipment_id
    from public.bookings b
    where b.id = new.replaced_by_booking_id;

    if v_related_shipment_id is null then
      raise exception 'El booking sustituto no existe'
        using errcode = '23503';
    end if;

    if v_related_shipment_id is distinct from new.shipment_id then
      raise exception 'Los bookings relacionados deben pertenecer al mismo shipment'
        using errcode = '23514';
    end if;
  end if;

  if new.booking_lifecycle_status = 'ACTIVE'
     and (
       new.cancellation_reason is not null
       or new.cancelled_at is not null
       or new.cancelled_by is not null
       or new.replaced_by_booking_id is not null
     ) then
    raise exception 'Un booking activo no puede conservar datos de cancelacion/reemplazo'
      using errcode = '23514';
  end if;

  if new.booking_lifecycle_status = 'CANCELLED'
     and (
       nullif(btrim(coalesce(new.cancellation_reason, '')), '') is null
       or new.cancelled_at is null
     ) then
    raise exception 'La cancelacion requiere motivo y fecha'
      using errcode = '23514';
  end if;

  if new.booking_lifecycle_status = 'REPLACED'
     and (
       nullif(btrim(coalesce(new.cancellation_reason, '')), '') is null
       or new.cancelled_at is null
       or new.replaced_by_booking_id is null
     ) then
    raise exception 'El booking reemplazado requiere motivo, fecha y sustituto'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_booking_replacement_relationship
  on public.bookings;
create constraint trigger trg_validate_booking_replacement_relationship
after insert or update of
  supersedes_booking_id,
  replaced_by_booking_id,
  booking_lifecycle_status,
  cancellation_reason,
  cancelled_at,
  cancelled_by
on public.bookings
deferrable initially deferred
for each row
execute function public.validate_booking_replacement_relationship();

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
  ) and coalesce(v_mode, '') <> 'admin_correction' then
    raise exception 'La identidad del booking solo admite correccion administrativa'
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

drop trigger if exists trg_protect_booking_schedule_fields
  on public.bookings;
create trigger trg_protect_booking_schedule_fields
before update
on public.bookings
for each row
execute function public.protect_booking_schedule_fields();

create or replace function public.initialize_booking_original_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.original_etd := coalesce(new.original_etd, new.etd);
  new.original_eta := coalesce(new.original_eta, new.eta);
  return new;
end;
$$;

drop trigger if exists trg_initialize_booking_original_schedule
  on public.bookings;
create trigger trg_initialize_booking_original_schedule
before insert
on public.bookings
for each row
execute function public.initialize_booking_original_schedule();

create or replace function public.create_initial_booking_schedule_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := coalesce(
    nullif(current_setting('app.booking_revision_source', true), ''),
    'booking_creation'
  );
  v_reason text := coalesce(
    nullif(current_setting('app.booking_revision_reason', true), ''),
    'Itinerario inicial del booking'
  );
begin
  if new.shipment_id is null then
    return new;
  end if;

  if nullif(btrim(coalesce(new.carrier, '')), '') is null
     and nullif(btrim(coalesce(new.booking_number, '')), '') is null
     and nullif(btrim(coalesce(new.carrier_booking, '')), '') is null
     and nullif(btrim(coalesce(new.vessel_name, '')), '') is null
     and nullif(btrim(coalesce(new.voyage, '')), '') is null
     and new.etd is null
     and new.eta is null
     and nullif(btrim(coalesce(new.routing_summary, '')), '') is null then
    return new;
  end if;

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
    new.shipment_id,
    new.id,
    1,
    'INITIAL',
    new.carrier,
    new.booking_number,
    new.carrier_booking,
    new.vessel_name,
    new.voyage,
    new.etd,
    new.eta,
    new.routing_summary,
    v_reason,
    case
      when v_source = any (
        array[
          'booking_creation',
          'phase_5b_backfill',
          'operations',
          'pricing_sync',
          'admin'
        ]
      ) then v_source
      else 'booking_creation'
    end,
    coalesce(new.created_at, now()),
    coalesce(auth.uid(), new.created_by),
    jsonb_build_object(
      'initial_revision', true,
      'created_by_trigger', true
    )
  )
  on conflict (booking_id, revision_number) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_initial_booking_schedule_revision
  on public.bookings;
create trigger trg_create_initial_booking_schedule_revision
after insert
on public.bookings
for each row
execute function public.create_initial_booking_schedule_revision();

create or replace function public.next_booking_schedule_revision_number(
  p_booking_id uuid
)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(max(revision_number), 0) + 1
  from public.booking_schedule_revisions
  where booking_id = p_booking_id
$$;

revoke all on function public.next_booking_schedule_revision_number(uuid)
  from public, anon, authenticated;

-- El guardado generico ya no acepta identidad, itinerario, originales ni reales.
alter function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) rename to update_booking_canonical_v5a;

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
  v_forbidden_fields text;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Los cambios del booking deben ser un objeto JSON'
      using errcode = '22023';
  end if;

  select string_agg(key, ', ' order by key)
  into v_forbidden_fields
  from jsonb_object_keys(p_changes) as item(key)
  where key = any (
    array[
      'booking_number',
      'carrier_booking',
      'carrier',
      'vessel_name',
      'voyage',
      'etd',
      'eta',
      'routing_summary',
      'original_etd',
      'original_eta',
      'actual_etd',
      'actual_eta',
      'shipment_id',
      'shipping_instruction_id',
      'shipment_status',
      'booking_lifecycle_status'
    ]
  );

  if v_forbidden_fields is not null then
    raise exception
      'Campos controlados fuera de la edicion normal: %. Usa la accion de itinerario, transicion o correccion administrativa.',
      v_forbidden_fields
      using errcode = '55000';
  end if;

  return query
  select *
  from public.update_booking_canonical_v5a(
    p_booking_id,
    p_shipping_instruction_id,
    p_expected_updated_at,
    p_changes
  );
end;
$$;

-- La transicion sigue siendo la unica autoridad normal para fechas reales.
alter function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) rename to transition_booking_status_v5a;

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
  v_result jsonb;
begin
  if exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.booking_lifecycle_status <> 'ACTIVE'
  ) then
    raise exception 'Un booking cancelado o reemplazado no admite transiciones'
      using errcode = '55000';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'status_transition', true);

  v_result := public.transition_booking_status_v5a(
    p_booking_id,
    p_expected_updated_at,
    p_target_status,
    p_occurred_at,
    p_location,
    p_notes,
    p_metadata
  );

  return v_result;
end;
$$;

-- Los eventos de schedule/ciclo de vida solo nacen dentro de sus RPC
-- transaccionales; el RPC generico conserva notas y eventos fisicos.
alter function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) rename to record_operational_event_v5a;

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
begin
  if p_event_code in (
    'SCHEDULE_REVISED',
    'BOOKING_ROLLED_OVER',
    'BOOKING_REPLACED',
    'BOOKING_CANCELLED',
    'BOOKING_REACTIVATED'
  ) then
    raise exception 'Este evento solo puede ser creado por su RPC operativo'
      using errcode = '42501';
  end if;

  return query
  select *
  from public.record_operational_event_v5a(
    p_shipping_instruction_id,
    p_booking_id,
    p_booking_container_id,
    p_event_code,
    p_event_label,
    p_occurred_at,
    p_location,
    p_notes,
    p_metadata
  );
end;
$$;

create or replace function public.revise_booking_schedule(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_carrier text default null,
  p_vessel_name text default null,
  p_voyage text default null,
  p_etd date default null,
  p_eta date default null,
  p_routing_summary text default null,
  p_effective_at timestamptz default now(),
  p_client_notified_at timestamptz default null
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
  v_previous jsonb;
  v_current jsonb;
  v_revision_type text := 'SCHEDULE_CHANGE';
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;
  if not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'Solo Admin u Operaciones puede revisar itinerarios'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de la revision es obligatorio'
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
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de guardar'
      using errcode = '40001';
  end if;
  if v_old.booking_lifecycle_status <> 'ACTIVE' then
    raise exception 'No se puede revisar un booking cancelado o reemplazado'
      using errcode = '55000';
  end if;
  if v_old.shipment_status = 'Finalizado' then
    raise exception 'El booking finalizado requiere reapertura autorizada'
      using errcode = '55000';
  end if;
  if (
    p_carrier is not distinct from v_old.carrier
    and p_vessel_name is not distinct from v_old.vessel_name
    and p_voyage is not distinct from v_old.voyage
    and p_etd is not distinct from v_old.etd
    and p_eta is not distinct from v_old.eta
    and p_routing_summary is not distinct from v_old.routing_summary
  ) then
    raise exception 'La revision no contiene cambios'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.booking_schedule_revisions r
    where r.booking_id = v_old.id
  ) then
    v_revision_type := 'INITIAL';
  end if;

  v_previous := jsonb_build_object(
    'carrier', v_old.carrier,
    'booking_number', v_old.booking_number,
    'carrier_booking', v_old.carrier_booking,
    'vessel_name', v_old.vessel_name,
    'voyage', v_old.voyage,
    'etd', v_old.etd,
    'eta', v_old.eta,
    'routing_summary', v_old.routing_summary
  );

  if v_revision_type <> 'INITIAL'
     and p_carrier is distinct from v_old.carrier then
    v_revision_type := 'CARRIER_UPDATE';
  elsif v_revision_type <> 'INITIAL'
    and p_routing_summary is distinct from v_old.routing_summary
    and p_vessel_name is not distinct from v_old.vessel_name
    and p_voyage is not distinct from v_old.voyage
    and p_etd is not distinct from v_old.etd
    and p_eta is not distinct from v_old.eta then
    v_revision_type := 'ROUTING_CHANGE';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'schedule_revision', true);

  update public.bookings b
  set carrier = nullif(btrim(coalesce(p_carrier, '')), ''),
      vessel_name = nullif(btrim(coalesce(p_vessel_name, '')), ''),
      voyage = nullif(btrim(coalesce(p_voyage, '')), ''),
      etd = p_etd,
      eta = p_eta,
      routing_summary = nullif(btrim(coalesce(p_routing_summary, '')), ''),
      original_etd = coalesce(b.original_etd, p_etd),
      original_eta = coalesce(b.original_eta, p_eta),
      client_schedule_notified_at = coalesce(
        p_client_notified_at,
        b.client_schedule_notified_at
      ),
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  v_current := jsonb_build_object(
    'carrier', v_new.carrier,
    'booking_number', v_new.booking_number,
    'carrier_booking', v_new.carrier_booking,
    'vessel_name', v_new.vessel_name,
    'voyage', v_new.voyage,
    'etd', v_new.etd,
    'eta', v_new.eta,
    'routing_summary', v_new.routing_summary
  );

  insert into public.booking_schedule_revisions (
    shipment_id, booking_id, revision_number, revision_type,
    carrier, booking_number, carrier_booking, vessel_name, voyage,
    etd, eta, routing_summary, reason, source, effective_at,
    client_notified_at, created_by, metadata
  ) values (
    v_new.shipment_id,
    v_new.id,
    public.next_booking_schedule_revision_number(v_new.id),
    v_revision_type,
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
    coalesce(p_effective_at, now()),
    p_client_notified_at,
    v_user_id,
    jsonb_build_object(
      'previous_schedule', v_previous,
      'new_schedule', v_current
    )
  )
  returning * into v_revision;

  insert into public.operational_events (
    shipment_id, shipping_instruction_id, booking_id,
    event_code, event_label, occurred_at, notes, metadata,
    source_system, created_by
  ) values (
    v_new.shipment_id,
    v_new.shipping_instruction_id,
    v_new.id,
    'SCHEDULE_REVISED',
    'Itinerario actualizado',
    coalesce(p_effective_at, now()),
    btrim(p_reason),
    jsonb_build_object(
      'previous_schedule', v_previous,
      'new_schedule', v_current,
      'previous_booking_id', null,
      'replacement_booking_id', null,
      'reason', btrim(p_reason),
      'revision_id', v_revision.id
    ),
    'system',
    v_user_id
  );

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_booking',
    'booking_schedule_revised',
    'booking',
    v_new.id,
    'Itinerario del booking actualizado',
    jsonb_build_object(
      'shipment_id', v_new.shipment_id,
      'revision_id', v_revision.id,
      'reason', btrim(p_reason),
      'before', v_previous,
      'after', v_current
    )
  );

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'revision', to_jsonb(v_revision),
    'derived_shipment_status',
      public.derive_shipment_operational_status(v_new.shipment_id)
  );
end;
$$;

create or replace function public.rollover_booking_schedule(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_vessel_name text,
  p_voyage text,
  p_etd date,
  p_eta date,
  p_routing_summary text default null,
  p_target_status text default null,
  p_effective_at timestamptz default now(),
  p_client_notified_at timestamptz default null
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
  v_previous jsonb;
  v_current jsonb;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;
  if not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'Solo Admin u Operaciones puede registrar rollovers'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del rollover es obligatorio'
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
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de guardar'
      using errcode = '40001';
  end if;
  if v_old.booking_lifecycle_status <> 'ACTIVE' then
    raise exception 'No se puede hacer rollover de un booking historico'
      using errcode = '55000';
  end if;
  if v_old.actual_etd is not null
     or v_old.shipment_status in ('Embarcado', 'En Transito', 'En Tránsito', 'Arribado', 'Finalizado') then
    raise exception 'El rollover normal se bloquea despues de la salida real'
      using errcode = '55000';
  end if;
  if (
    p_vessel_name is not distinct from v_old.vessel_name
    and p_voyage is not distinct from v_old.voyage
    and p_etd is not distinct from v_old.etd
    and p_eta is not distinct from v_old.eta
    and p_routing_summary is not distinct from v_old.routing_summary
  ) then
    raise exception 'El rollover no contiene cambios'
      using errcode = '22023';
  end if;

  v_status := coalesce(nullif(btrim(p_target_status), ''), v_old.shipment_status);
  if v_old.shipment_status = 'Listo para Embarque' then
    if v_status not in ('Booking Confirmado', 'Documentación Pendiente') then
      raise exception 'Desde Listo para Embarque el rollover debe volver a Confirmado o Documentacion Pendiente'
        using errcode = '22023';
    end if;
  elsif v_status is distinct from v_old.shipment_status then
    raise exception 'Este estado no admite retroceso por rollover'
      using errcode = '22023';
  end if;

  v_previous := jsonb_build_object(
    'carrier', v_old.carrier,
    'booking_number', v_old.booking_number,
    'carrier_booking', v_old.carrier_booking,
    'vessel_name', v_old.vessel_name,
    'voyage', v_old.voyage,
    'etd', v_old.etd,
    'eta', v_old.eta,
    'routing_summary', v_old.routing_summary,
    'shipment_status', v_old.shipment_status
  );

  perform set_config('app.booking_schedule_write_mode', 'schedule_rollover', true);

  update public.bookings b
  set vessel_name = nullif(btrim(coalesce(p_vessel_name, '')), ''),
      voyage = nullif(btrim(coalesce(p_voyage, '')), ''),
      etd = p_etd,
      eta = p_eta,
      routing_summary = nullif(btrim(coalesce(p_routing_summary, '')), ''),
      original_etd = coalesce(b.original_etd, p_etd),
      original_eta = coalesce(b.original_eta, p_eta),
      shipment_status = v_status,
      client_schedule_notified_at = coalesce(
        p_client_notified_at,
        b.client_schedule_notified_at
      ),
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  v_current := jsonb_build_object(
    'carrier', v_new.carrier,
    'booking_number', v_new.booking_number,
    'carrier_booking', v_new.carrier_booking,
    'vessel_name', v_new.vessel_name,
    'voyage', v_new.voyage,
    'etd', v_new.etd,
    'eta', v_new.eta,
    'routing_summary', v_new.routing_summary,
    'shipment_status', v_new.shipment_status
  );

  insert into public.booking_schedule_revisions (
    shipment_id, booking_id, revision_number, revision_type,
    carrier, booking_number, carrier_booking, vessel_name, voyage,
    etd, eta, routing_summary, reason, source, effective_at,
    client_notified_at, created_by, metadata
  ) values (
    v_new.shipment_id,
    v_new.id,
    public.next_booking_schedule_revision_number(v_new.id),
    'ROLLOVER_SAME_BOOKING',
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
    coalesce(p_effective_at, now()),
    p_client_notified_at,
    v_user_id,
    jsonb_build_object(
      'previous_schedule', v_previous,
      'new_schedule', v_current,
      'status_regression', v_old.shipment_status is distinct from v_status
    )
  )
  returning * into v_revision;

  insert into public.operational_events (
    shipment_id, shipping_instruction_id, booking_id,
    event_code, event_label, occurred_at, notes, metadata,
    source_system, created_by
  ) values (
    v_new.shipment_id,
    v_new.shipping_instruction_id,
    v_new.id,
    'BOOKING_ROLLED_OVER',
    'Booking movido a otro itinerario',
    coalesce(p_effective_at, now()),
    btrim(p_reason),
    jsonb_build_object(
      'previous_schedule', v_previous,
      'new_schedule', v_current,
      'previous_booking_id', v_new.id,
      'replacement_booking_id', null,
      'reason', btrim(p_reason),
      'revision_id', v_revision.id
    ),
    'system',
    v_user_id
  );

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_booking',
    'booking_rolled_over',
    'booking',
    v_new.id,
    'Rollover del mismo carrier booking registrado',
    jsonb_build_object(
      'shipment_id', v_new.shipment_id,
      'revision_id', v_revision.id,
      'reason', btrim(p_reason),
      'before', v_previous,
      'after', v_current
    )
  );

  update public.shipments s
  set operational_status = public.derive_shipment_operational_status(s.id),
      updated_at = clock_timestamp()
  where s.id = v_new.shipment_id;

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'revision', to_jsonb(v_revision),
    'derived_shipment_status',
      public.derive_shipment_operational_status(v_new.shipment_id)
  );
end;
$$;

create or replace function public.replace_booking(
  p_old_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_new_carrier text,
  p_new_booking_number text,
  p_new_carrier_booking text,
  p_new_vessel_name text,
  p_new_voyage text,
  p_new_etd date,
  p_new_eta date,
  p_reason text,
  p_container_treatment text default 'KEEP_WITH_OLD',
  p_new_routing_summary text default null,
  p_allow_issued_bl_exception boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_old_primary_booking_id uuid;
  v_has_issued_bl boolean := false;
  v_has_bl_cache boolean := false;
  v_physical_container_count integer := 0;
  v_moved_container_count integer := 0;
  v_previous jsonb;
  v_current jsonb;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;
  if not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'Solo Admin u Operaciones puede reemplazar bookings'
      using errcode = '42501';
  end if;
  v_is_admin := public.is_role(array['Admin']);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del reemplazo es obligatorio'
      using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_new_booking_number, '')), '') is null
     and nullif(btrim(coalesce(p_new_carrier_booking, '')), '') is null then
    raise exception 'El booking sustituto requiere booking number o carrier booking'
      using errcode = '23514';
  end if;
  if p_container_treatment not in (
    'KEEP_WITH_OLD',
    'MOVE_UNASSIGNED',
    'MOVE_ALL_IF_NOT_PHYSICALLY_USED',
    'MANUAL'
  ) then
    raise exception 'Estrategia de contenedores no permitida'
      using errcode = '22023';
  end if;

  select b.*
  into v_old
  from public.bookings b
  where b.id = p_old_booking_id
  for update;

  if not found then
    raise exception 'Booking anterior no encontrado'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.shipments s
  where s.id = v_old.shipment_id
  for update;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de reemplazar'
      using errcode = '40001';
  end if;
  if v_old.booking_lifecycle_status <> 'ACTIVE' then
    raise exception 'Solo un booking activo puede ser reemplazado'
      using errcode = '55000';
  end if;
  if v_old.actual_etd is not null
     or v_old.shipment_status in (
       'Embarcado', 'En Transito', 'En Tránsito', 'Arribado', 'Finalizado'
     ) then
    raise exception 'No se puede reemplazar normalmente un booking ya embarcado'
      using errcode = '55000';
  end if;

  select exists (
    select 1
    from public.bills_of_lading bl
    where bl.booking_id = v_old.id
      and lower(coalesce(bl.status, '')) ~
        '(emit|liberad|released|issued|aprobado por cliente)'
  )
  into v_has_issued_bl;

  v_has_bl_cache :=
    nullif(btrim(coalesce(v_old.master_bl, '')), '') is not null
    or nullif(btrim(coalesce(v_old.house_bl, '')), '') is not null;

  if (v_has_issued_bl or v_has_bl_cache)
     and not (
       v_is_admin
       and p_allow_issued_bl_exception
       and nullif(btrim(coalesce(p_reason, '')), '') is not null
     ) then
    raise exception 'Existen BL emitidos o referencias MBL/HBL; el reemplazo normal esta bloqueado'
      using errcode = '23514';
  end if;

  select count(distinct bc.id)::integer
  into v_physical_container_count
  from public.booking_containers bc
  join public.operational_events oe
    on oe.booking_container_id = bc.id
  where bc.booking_id = v_old.id
    and oe.event_code in (
      'CONTAINER_PICKED_UP',
      'GATE_IN',
      'CONTAINER_LOADED',
      'ON_BOARD',
      'DELIVERED'
    );

  if p_container_treatment = 'MOVE_ALL_IF_NOT_PHYSICALLY_USED'
     and v_physical_container_count > 0 then
    raise exception 'No se pueden mover todos los contenedores: existen eventos fisicos'
      using errcode = '23514';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'booking_replace', true);
  perform set_config('app.booking_revision_source', 'operations', true);
  perform set_config(
    'app.booking_revision_reason',
    'Itinerario inicial del booking sustituto',
    true
  );

  insert into public.bookings (
    shipping_instruction_id,
    shipment_id,
    carrier,
    booking_number,
    carrier_booking,
    vessel_name,
    voyage,
    etd,
    eta,
    original_etd,
    original_eta,
    routing_summary,
    shipment_status,
    booking_lifecycle_status,
    supersedes_booking_id,
    estimated_transit_days,
    free_days,
    freight_terms,
    release_type,
    hbl_freight_visibility,
    printed_at_destination,
    operational_comments,
    created_by,
    created_at,
    updated_at
  ) values (
    v_old.shipping_instruction_id,
    v_old.shipment_id,
    nullif(btrim(coalesce(p_new_carrier, '')), ''),
    nullif(btrim(coalesce(p_new_booking_number, '')), ''),
    nullif(btrim(coalesce(p_new_carrier_booking, '')), ''),
    nullif(btrim(coalesce(p_new_vessel_name, '')), ''),
    nullif(btrim(coalesce(p_new_voyage, '')), ''),
    p_new_etd,
    p_new_eta,
    p_new_etd,
    p_new_eta,
    nullif(btrim(coalesce(p_new_routing_summary, '')), ''),
    'Booking Solicitado',
    'ACTIVE',
    v_old.id,
    v_old.estimated_transit_days,
    v_old.free_days,
    v_old.freight_terms,
    v_old.release_type,
    v_old.hbl_freight_visibility,
    v_old.printed_at_destination,
    v_old.operational_comments,
    v_user_id,
    clock_timestamp(),
    clock_timestamp()
  )
  returning * into v_new;

  update public.bookings b
  set booking_lifecycle_status = 'REPLACED',
      shipment_status = 'Cancelada',
      replaced_by_booking_id = v_new.id,
      cancellation_reason = btrim(p_reason),
      cancelled_at = clock_timestamp(),
      cancelled_by = v_user_id,
      updated_at = clock_timestamp()
  where b.id = v_old.id;

  if p_container_treatment = 'MOVE_ALL_IF_NOT_PHYSICALLY_USED' then
    update public.booking_containers bc
    set booking_id = v_new.id
    where bc.booking_id = v_old.id;
    get diagnostics v_moved_container_count = row_count;
  elsif p_container_treatment = 'MOVE_UNASSIGNED' then
    update public.booking_containers bc
    set booking_id = v_new.id
    where bc.booking_id = v_old.id
      and not exists (
        select 1
        from public.operational_events oe
        where oe.booking_container_id = bc.id
          and oe.event_code in (
            'CONTAINER_PICKED_UP',
            'GATE_IN',
            'CONTAINER_LOADED',
            'ON_BOARD',
            'DELIVERED'
          )
      );
    get diagnostics v_moved_container_count = row_count;
  end if;

  select si.primary_booking_id
  into v_old_primary_booking_id
  from public.shipping_instructions si
  where si.id = v_old.shipping_instruction_id
  for update;

  if v_old_primary_booking_id = v_old.id then
    update public.shipping_instructions si
    set primary_booking_id = v_new.id,
        updated_at = clock_timestamp()
    where si.id = v_old.shipping_instruction_id;
  end if;

  v_previous := jsonb_build_object(
    'carrier', v_old.carrier,
    'booking_number', v_old.booking_number,
    'carrier_booking', v_old.carrier_booking,
    'vessel_name', v_old.vessel_name,
    'voyage', v_old.voyage,
    'etd', v_old.etd,
    'eta', v_old.eta,
    'routing_summary', v_old.routing_summary
  );
  v_current := jsonb_build_object(
    'carrier', v_new.carrier,
    'booking_number', v_new.booking_number,
    'carrier_booking', v_new.carrier_booking,
    'vessel_name', v_new.vessel_name,
    'voyage', v_new.voyage,
    'etd', v_new.etd,
    'eta', v_new.eta,
    'routing_summary', v_new.routing_summary
  );

  insert into public.operational_events (
    shipment_id, shipping_instruction_id, booking_id,
    event_code, event_label, occurred_at, notes, metadata,
    source_system, created_by
  ) values
  (
    v_old.shipment_id,
    v_old.shipping_instruction_id,
    v_old.id,
    'BOOKING_REPLACED',
    'Booking reemplazado',
    now(),
    btrim(p_reason),
    jsonb_build_object(
      'previous_schedule', v_previous,
      'new_schedule', v_current,
      'previous_booking_id', v_old.id,
      'replacement_booking_id', v_new.id,
      'reason', btrim(p_reason),
      'container_treatment', p_container_treatment,
      'moved_container_count', v_moved_container_count
    ),
    'system',
    v_user_id
  ),
  (
    v_new.shipment_id,
    v_new.shipping_instruction_id,
    v_new.id,
    'BOOKING_REPLACED',
    'Booking sustituto creado',
    now(),
    btrim(p_reason),
    jsonb_build_object(
      'previous_schedule', v_previous,
      'new_schedule', v_current,
      'previous_booking_id', v_old.id,
      'replacement_booking_id', v_new.id,
      'reason', btrim(p_reason),
      'container_treatment', p_container_treatment,
      'moved_container_count', v_moved_container_count
    ),
    'system',
    v_user_id
  );

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_booking',
    'booking_replaced',
    'booking',
    v_old.id,
    'Booking reemplazado por una nueva reserva',
    jsonb_build_object(
      'shipment_id', v_old.shipment_id,
      'replacement_booking_id', v_new.id,
      'reason', btrim(p_reason),
      'container_treatment', p_container_treatment,
      'moved_container_count', v_moved_container_count,
      'issued_bl_exception', v_has_issued_bl or v_has_bl_cache
    )
  );

  update public.shipments s
  set operational_status = public.derive_shipment_operational_status(s.id),
      closed_at = null,
      updated_at = clock_timestamp()
  where s.id = v_old.shipment_id;

  return jsonb_build_object(
    'old_booking_id', v_old.id,
    'new_booking', to_jsonb(v_new),
    'container_treatment', p_container_treatment,
    'moved_container_count', v_moved_container_count,
    'primary_booking_updated', v_old_primary_booking_id = v_old.id,
    'derived_shipment_status',
      public.derive_shipment_operational_status(v_old.shipment_id)
  );
end;
$$;

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_allow_post_departure_exception boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_primary_rows integer := 0;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;
  if not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'Solo Admin u Operaciones puede cancelar bookings'
      using errcode = '42501';
  end if;
  v_is_admin := public.is_role(array['Admin']);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de cancelacion es obligatorio'
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

  perform 1
  from public.shipments s
  where s.id = v_old.shipment_id
  for update;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de cancelar'
      using errcode = '40001';
  end if;
  if v_old.booking_lifecycle_status <> 'ACTIVE' then
    raise exception 'Solo un booking activo puede cancelarse'
      using errcode = '55000';
  end if;
  if (
    v_old.actual_etd is not null
    or v_old.shipment_status in (
      'Embarcado', 'En Transito', 'En Tránsito', 'Arribado', 'Finalizado'
    )
  ) and not (
    v_is_admin
    and p_allow_post_departure_exception
  ) then
    raise exception 'La cancelacion posterior al embarque requiere excepcion Admin'
      using errcode = '55000';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'booking_cancel', true);

  update public.bookings b
  set booking_lifecycle_status = 'CANCELLED',
      shipment_status = 'Cancelada',
      cancellation_reason = btrim(p_reason),
      cancelled_at = clock_timestamp(),
      cancelled_by = v_user_id,
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  update public.shipping_instructions si
  set primary_booking_id = null,
      updated_at = clock_timestamp()
  where si.id = v_new.shipping_instruction_id
    and si.primary_booking_id = v_new.id;
  get diagnostics v_primary_rows = row_count;

  insert into public.operational_events (
    shipment_id, shipping_instruction_id, booking_id,
    event_code, event_label, occurred_at, notes, metadata,
    source_system, created_by
  ) values (
    v_new.shipment_id,
    v_new.shipping_instruction_id,
    v_new.id,
    'BOOKING_CANCELLED',
    'Booking cancelado',
    now(),
    btrim(p_reason),
    jsonb_build_object(
      'previous_schedule', jsonb_build_object(
        'carrier', v_old.carrier,
        'booking_number', v_old.booking_number,
        'carrier_booking', v_old.carrier_booking,
        'vessel_name', v_old.vessel_name,
        'voyage', v_old.voyage,
        'etd', v_old.etd,
        'eta', v_old.eta
      ),
      'new_schedule', null,
      'previous_booking_id', v_old.id,
      'replacement_booking_id', null,
      'reason', btrim(p_reason),
      'post_departure_exception',
        v_is_admin and p_allow_post_departure_exception
    ),
    'system',
    v_user_id
  );

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_booking',
    'booking_cancelled',
    'booking',
    v_new.id,
    'Booking cancelado sin sustituto',
    jsonb_build_object(
      'shipment_id', v_new.shipment_id,
      'reason', btrim(p_reason),
      'primary_booking_cleared', v_primary_rows > 0,
      'post_departure_exception',
        v_is_admin and p_allow_post_departure_exception
    )
  );

  update public.shipments s
  set operational_status = public.derive_shipment_operational_status(s.id),
      closed_at = case
        when public.derive_shipment_operational_status(s.id) = 'Cancelado'
          then coalesce(s.closed_at, clock_timestamp())
        else s.closed_at
      end,
      updated_at = clock_timestamp()
  where s.id = v_new.shipment_id;

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'primary_booking_cleared', v_primary_rows > 0,
    'derived_shipment_status',
      public.derive_shipment_operational_status(v_new.shipment_id)
  );
end;
$$;

create or replace function public.correct_booking_administrative(
  p_booking_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_changes jsonb
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
  v_invalid_fields text;
  v_schedule_changed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;
  if not public.is_role(array['Admin']) then
    raise exception 'Solo Admin puede registrar correcciones administrativas'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de correccion es obligatorio'
      using errcode = '22023';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Los cambios deben ser un objeto JSON'
      using errcode = '22023';
  end if;

  select string_agg(key, ', ' order by key)
  into v_invalid_fields
  from jsonb_object_keys(p_changes) as item(key)
  where key <> all (
    array[
      'booking_number',
      'carrier_booking',
      'carrier',
      'vessel_name',
      'voyage',
      'etd',
      'eta',
      'routing_summary',
      'actual_etd',
      'actual_eta'
    ]
  );

  if v_invalid_fields is not null then
    raise exception 'Campos no permitidos en correccion: %', v_invalid_fields
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
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de corregir'
      using errcode = '40001';
  end if;
  if v_old.booking_lifecycle_status = 'REPLACED' then
    raise exception 'No se corrige silenciosamente un booking reemplazado'
      using errcode = '55000';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'admin_correction', true);

  update public.bookings b
  set booking_number = case when p_changes ? 'booking_number'
        then nullif(btrim(p_changes ->> 'booking_number'), '')
        else b.booking_number end,
      carrier_booking = case when p_changes ? 'carrier_booking'
        then nullif(btrim(p_changes ->> 'carrier_booking'), '')
        else b.carrier_booking end,
      carrier = case when p_changes ? 'carrier'
        then nullif(btrim(p_changes ->> 'carrier'), '')
        else b.carrier end,
      vessel_name = case when p_changes ? 'vessel_name'
        then nullif(btrim(p_changes ->> 'vessel_name'), '')
        else b.vessel_name end,
      voyage = case when p_changes ? 'voyage'
        then nullif(btrim(p_changes ->> 'voyage'), '')
        else b.voyage end,
      etd = case when p_changes ? 'etd'
        then nullif(p_changes ->> 'etd', '')::date
        else b.etd end,
      eta = case when p_changes ? 'eta'
        then nullif(p_changes ->> 'eta', '')::date
        else b.eta end,
      routing_summary = case when p_changes ? 'routing_summary'
        then nullif(btrim(p_changes ->> 'routing_summary'), '')
        else b.routing_summary end,
      actual_etd = case when p_changes ? 'actual_etd'
        then nullif(p_changes ->> 'actual_etd', '')::date
        else b.actual_etd end,
      actual_eta = case when p_changes ? 'actual_eta'
        then nullif(p_changes ->> 'actual_eta', '')::date
        else b.actual_eta end,
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  if to_jsonb(v_new) - array['updated_at']::text[]
     = to_jsonb(v_old) - array['updated_at']::text[] then
    raise exception 'La correccion no contiene cambios'
      using errcode = '22023';
  end if;

  v_schedule_changed :=
    v_new.carrier is distinct from v_old.carrier
    or v_new.vessel_name is distinct from v_old.vessel_name
    or v_new.voyage is distinct from v_old.voyage
    or v_new.etd is distinct from v_old.etd
    or v_new.eta is distinct from v_old.eta
    or v_new.routing_summary is distinct from v_old.routing_summary
    or v_new.booking_number is distinct from v_old.booking_number
    or v_new.carrier_booking is distinct from v_old.carrier_booking;

  if v_schedule_changed then
    insert into public.booking_schedule_revisions (
      shipment_id, booking_id, revision_number, revision_type,
      carrier, booking_number, carrier_booking, vessel_name, voyage,
      etd, eta, routing_summary, reason, source, effective_at,
      created_by, metadata
    ) values (
      v_new.shipment_id,
      v_new.id,
      public.next_booking_schedule_revision_number(v_new.id),
      'ADMIN_CORRECTION',
      v_new.carrier,
      v_new.booking_number,
      v_new.carrier_booking,
      v_new.vessel_name,
      v_new.voyage,
      v_new.etd,
      v_new.eta,
      v_new.routing_summary,
      btrim(p_reason),
      'admin',
      now(),
      v_user_id,
      jsonb_build_object(
        'administrative_only', true,
        'previous_values', to_jsonb(v_old),
        'new_values', to_jsonb(v_new)
      )
    )
    returning * into v_revision;
  end if;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_booking',
    'booking_admin_corrected',
    'booking',
    v_new.id,
    'Correccion administrativa de booking',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'revision_id', v_revision.id,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new)
    )
  );

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'revision', case
      when v_revision.id is null then null
      else to_jsonb(v_revision)
    end
  );
end;
$$;

-- Reapertura controlada. Distingue la reactivacion de una cancelacion del
-- booking historico REPLACED, que nunca puede reactivarse.
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
  v_old public.bookings%rowtype;
  v_new public.bookings%rowtype;
  v_has_issued_bl boolean;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion'
      using errcode = '42501';
  end if;
  if not public.is_role(array['Admin']) then
    raise exception 'Solo Admin puede reabrir bookings'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de reapertura es obligatorio'
      using errcode = '22023';
  end if;
  if p_target_status not in (
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
    raise exception 'BOOKING_VERSION_CONFLICT: recarga antes de reabrir'
      using errcode = '40001';
  end if;
  if v_old.booking_lifecycle_status = 'REPLACED' then
    raise exception 'Un booking reemplazado no puede reactivarse'
      using errcode = '55000';
  end if;
  if v_old.shipment_status not in ('Finalizado', 'Cancelada') then
    raise exception 'La reapertura solo aplica a bookings finalizados o cancelados'
      using errcode = '55000';
  end if;

  select exists (
    select 1
    from public.bills_of_lading bl
    where bl.booking_id = v_old.id
      and lower(coalesce(bl.status, '')) ~ '(emit|liberad|released|issued)'
  )
  into v_has_issued_bl;

  if v_has_issued_bl and not p_acknowledge_issued_documents then
    raise exception 'Existen BL emitidos; confirma expresamente su revision'
      using errcode = '23514';
  end if;

  perform set_config('app.booking_schedule_write_mode', 'booking_reactivate', true);

  update public.bookings b
  set shipment_status = p_target_status,
      booking_lifecycle_status = 'ACTIVE',
      cancellation_reason = null,
      cancelled_at = null,
      cancelled_by = null,
      replaced_by_booking_id = null,
      updated_at = clock_timestamp()
  where b.id = v_old.id
  returning * into v_new;

  insert into public.operational_events (
    shipment_id, shipping_instruction_id, booking_id,
    event_code, event_label, occurred_at, notes, metadata,
    source_system, created_by
  ) values (
    v_new.shipment_id,
    v_new.shipping_instruction_id,
    v_new.id,
    'BOOKING_REACTIVATED',
    'Booking reactivado',
    now(),
    btrim(p_reason),
    jsonb_build_object(
      'previous_schedule', null,
      'new_schedule', null,
      'previous_booking_id', v_new.id,
      'replacement_booking_id', null,
      'reason', btrim(p_reason),
      'previous_status', v_old.shipment_status,
      'target_status', p_target_status,
      'issued_documents_acknowledged', p_acknowledge_issued_documents
    ),
    'system',
    v_user_id
  );

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_booking',
    'booking_reactivated',
    'booking',
    v_new.id,
    'Booking reactivado por Admin',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new)
    )
  );

  update public.shipments s
  set operational_status = public.derive_shipment_operational_status(s.id),
      closed_at = null,
      updated_at = clock_timestamp()
  where s.id = v_new.shipment_id;

  return jsonb_build_object(
    'booking', to_jsonb(v_new),
    'derived_shipment_status',
      public.derive_shipment_operational_status(v_new.shipment_id)
  );
end;
$$;

-- El agregado solo considera bookings vigentes. Los reemplazados no bloquean
-- el progreso y todos los cancelados producen Cancelado.
create or replace function public.derive_shipment_operational_status(
  p_shipment_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_all_count integer;
  v_active_statuses text[];
  v_active_count integer;
  v_delivered_count integer;
begin
  select count(*)::integer
  into v_all_count
  from public.bookings b
  where b.shipment_id = p_shipment_id;

  if v_all_count = 0 then
    return 'Sin bookings';
  end if;

  select array_agg(
    coalesce(nullif(btrim(b.shipment_status), ''), 'Booking Solicitado')
    order by b.created_at, b.id
  )
  into v_active_statuses
  from public.bookings b
  where b.shipment_id = p_shipment_id
    and b.booking_lifecycle_status = 'ACTIVE';

  v_active_count := coalesce(array_length(v_active_statuses, 1), 0);
  if v_active_count = 0 then
    return 'Cancelado';
  end if;

  if not exists (
    select 1
    from unnest(v_active_statuses) status
    where status <> 'Finalizado'
  ) then
    return 'Finalizado';
  end if;

  if 'Arribado' = any(v_active_statuses)
     or 'Finalizado' = any(v_active_statuses) then
    if exists (
      select 1
      from unnest(v_active_statuses) status
      where status not in ('Arribado', 'Finalizado')
    ) then
      return 'Arribo parcial';
    end if;

    select count(distinct oe.booking_id)::integer
    into v_delivered_count
    from public.operational_events oe
    join public.bookings b on b.id = oe.booking_id
    where oe.shipment_id = p_shipment_id
      and oe.event_code = 'DELIVERED'
      and b.booking_lifecycle_status = 'ACTIVE';

    if v_delivered_count >= v_active_count then
      return 'Cierre en proceso';
    end if;
    return 'Arribado';
  end if;

  if 'En Tránsito' = any(v_active_statuses) then return 'En transito'; end if;
  if 'Embarcado' = any(v_active_statuses) then return 'Embarcado'; end if;

  if 'Listo para Embarque' = any(v_active_statuses)
     or exists (
       select 1
       from public.operational_events oe
       join public.bookings b on b.id = oe.booking_id
       where oe.shipment_id = p_shipment_id
         and b.booking_lifecycle_status = 'ACTIVE'
         and oe.event_code in (
           'EQUIPMENT_RELEASED',
           'CONTAINER_PICKED_UP',
           'CONTAINER_LOADED',
           'GATE_IN'
         )
     ) then
    return 'Origen en proceso';
  end if;

  if 'Booking Solicitado' = any(v_active_statuses)
     and exists (
       select 1
       from unnest(v_active_statuses) status
       where status in ('Booking Confirmado', 'Documentación Pendiente')
     ) then
    return 'Parcialmente confirmado';
  end if;

  if not exists (
    select 1
    from unnest(v_active_statuses) status
    where status not in ('Booking Confirmado', 'Documentación Pendiente')
  ) then
    return 'Confirmado';
  end if;

  return 'Booking en proceso';
end;
$$;

update public.shipments s
set operational_status = public.derive_shipment_operational_status(s.id),
    closed_at = case
      when public.derive_shipment_operational_status(s.id)
        in ('Finalizado', 'Cancelado')
        then coalesce(s.closed_at, clock_timestamp())
      else null
    end,
    updated_at = s.updated_at;

-- Consistencia final en ambas direcciones. Es diferida para permitir que el
-- RPC inserte primero el nuevo booking y luego cierre el anterior.
create or replace function public.validate_booking_replacement_pair()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supersedes_booking_id is not null
     and not exists (
       select 1
       from public.bookings previous
       where previous.id = new.supersedes_booking_id
         and previous.replaced_by_booking_id = new.id
         and previous.booking_lifecycle_status = 'REPLACED'
     ) then
    raise exception 'Relacion de reemplazo inconsistente en booking anterior'
      using errcode = '23514';
  end if;

  if new.replaced_by_booking_id is not null
     and not exists (
       select 1
       from public.bookings replacement
       where replacement.id = new.replaced_by_booking_id
         and replacement.supersedes_booking_id = new.id
         and replacement.booking_lifecycle_status = 'ACTIVE'
     ) then
    raise exception 'Relacion de reemplazo inconsistente en booking sustituto'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_validate_booking_replacement_pair
  on public.bookings;
create constraint trigger trg_validate_booking_replacement_pair
after insert or update of
  supersedes_booking_id,
  replaced_by_booking_id,
  booking_lifecycle_status
on public.bookings
deferrable initially deferred
for each row
execute function public.validate_booking_replacement_pair();

-- Pricing conserva su contrato publico, pero cada cambio real de carrier/ETD/ETA
-- queda registrado. El wrapper activa la guarda solo durante la sincronizacion.
alter function public.sync_shipping_instruction_from_selected_agent_quote_v2(
  uuid, text
) rename to sync_shipping_instruction_from_selected_agent_quote_v2_v4b;

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
  v_result record;
  v_booking_id uuid;
  v_before jsonb := '{}'::jsonb;
  v_old jsonb;
  v_booking public.bookings%rowtype;
  v_revision_type text;
begin
  select coalesce(
    jsonb_object_agg(
      b.id::text,
      jsonb_build_object(
        'carrier', b.carrier,
        'booking_number', b.booking_number,
        'carrier_booking', b.carrier_booking,
        'vessel_name', b.vessel_name,
        'voyage', b.voyage,
        'etd', b.etd,
        'eta', b.eta,
        'routing_summary', b.routing_summary
      )
    ),
    '{}'::jsonb
  )
  into v_before
  from public.bookings b
  where b.shipping_instruction_id = p_shipping_instruction_id;

  perform set_config('app.booking_schedule_write_mode', 'pricing_sync', true);

  select *
  into v_result
  from public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(
    p_shipping_instruction_id,
    p_reason
  );

  foreach v_booking_id in array coalesce(v_result.updated_booking_ids, '{}'::uuid[])
  loop
    update public.bookings b
    set original_etd = coalesce(b.original_etd, b.etd),
        original_eta = coalesce(b.original_eta, b.eta)
    where b.id = v_booking_id
      and (b.original_etd is null or b.original_eta is null);

    select b.*
    into v_booking
    from public.bookings b
    where b.id = v_booking_id;

    v_old := v_before -> v_booking_id::text;
    if v_old is null then
      continue;
    end if;

    if (
      v_old ->> 'carrier' is not distinct from v_booking.carrier
      and nullif(v_old ->> 'etd', '')::date is not distinct from v_booking.etd
      and nullif(v_old ->> 'eta', '')::date is not distinct from v_booking.eta
    ) then
      continue;
    end if;

    v_revision_type := case
      when v_old ->> 'carrier' is distinct from v_booking.carrier
        then 'CARRIER_UPDATE'
      else 'SCHEDULE_CHANGE'
    end;

    if not exists (
      select 1
      from public.booking_schedule_revisions r
      where r.booking_id = v_booking.id
    ) then
      v_revision_type := 'INITIAL';
    end if;

    insert into public.booking_schedule_revisions (
      shipment_id, booking_id, revision_number, revision_type,
      carrier, booking_number, carrier_booking, vessel_name, voyage,
      etd, eta, routing_summary, reason, source, effective_at,
      created_by, metadata
    ) values (
      v_booking.shipment_id,
      v_booking.id,
      public.next_booking_schedule_revision_number(v_booking.id),
      v_revision_type,
      v_booking.carrier,
      v_booking.booking_number,
      v_booking.carrier_booking,
      v_booking.vessel_name,
      v_booking.voyage,
      v_booking.etd,
      v_booking.eta,
      v_booking.routing_summary,
      coalesce(
        nullif(btrim(coalesce(p_reason, '')), ''),
        'Defaults actualizados desde tarifa seleccionada'
      ),
      'pricing_sync',
      now(),
      auth.uid(),
      jsonb_build_object(
        'previous_schedule', v_old,
        'new_schedule', jsonb_build_object(
          'carrier', v_booking.carrier,
          'booking_number', v_booking.booking_number,
          'carrier_booking', v_booking.carrier_booking,
          'vessel_name', v_booking.vessel_name,
          'voyage', v_booking.voyage,
          'etd', v_booking.etd,
          'eta', v_booking.eta,
          'routing_summary', v_booking.routing_summary
        ),
        'pricing_sync', true
      )
    );
  end loop;

  return query select
    v_result.shipping_instruction_id,
    v_result.quotation_id,
    v_result.agent_quote_id,
    v_result.updated_booking_ids,
    v_result.skipped_bookings,
    v_result.updated_bookings,
    v_result.skipped_count,
    v_result.carrier,
    v_result.agent_name,
    v_result.agent_contact,
    v_result.agent_email,
    v_result.etd,
    v_result.estimated_transit_days,
    v_result.free_days;
end;
$$;

revoke all on function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) from public, anon;
revoke all on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) from public, anon;
revoke all on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) from public, anon;
revoke all on function public.revise_booking_schedule(
  uuid, timestamptz, text, text, text, text, date, date, text,
  timestamptz, timestamptz
) from public, anon;
revoke all on function public.rollover_booking_schedule(
  uuid, timestamptz, text, text, text, date, date, text, text,
  timestamptz, timestamptz
) from public, anon;
revoke all on function public.replace_booking(
  uuid, timestamptz, text, text, text, text, text, date, date, text,
  text, text, boolean
) from public, anon;
revoke all on function public.cancel_booking(
  uuid, timestamptz, text, boolean
) from public, anon;
revoke all on function public.correct_booking_administrative(
  uuid, timestamptz, text, jsonb
) from public, anon;
revoke all on function public.reopen_booking(
  uuid, timestamptz, text, text, boolean
) from public, anon;
revoke all on function public.sync_shipping_instruction_from_selected_agent_quote_v2(
  uuid, text
) from public, anon;

grant execute on function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) to authenticated;
grant execute on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) to authenticated;
grant execute on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) to authenticated;
grant execute on function public.revise_booking_schedule(
  uuid, timestamptz, text, text, text, text, date, date, text,
  timestamptz, timestamptz
) to authenticated;
grant execute on function public.rollover_booking_schedule(
  uuid, timestamptz, text, text, text, date, date, text, text,
  timestamptz, timestamptz
) to authenticated;
grant execute on function public.replace_booking(
  uuid, timestamptz, text, text, text, text, text, date, date, text,
  text, text, boolean
) to authenticated;
grant execute on function public.cancel_booking(
  uuid, timestamptz, text, boolean
) to authenticated;
grant execute on function public.correct_booking_administrative(
  uuid, timestamptz, text, jsonb
) to authenticated;
grant execute on function public.reopen_booking(
  uuid, timestamptz, text, text, boolean
) to authenticated;
grant execute on function public.sync_shipping_instruction_from_selected_agent_quote_v2(
  uuid, text
) to authenticated;

comment on table public.booking_schedule_revisions is
  'Historial inmutable del itinerario vigente de cada booking.';
comment on function public.revise_booking_schedule(
  uuid, timestamptz, text, text, text, text, date, date, text,
  timestamptz, timestamptz
) is 'Revisa el itinerario conservando booking y fechas originales.';
comment on function public.rollover_booking_schedule(
  uuid, timestamptz, text, text, text, date, date, text, text,
  timestamptz, timestamptz
) is 'Registra rollover con la misma reserva y retroceso controlado.';
comment on function public.replace_booking(
  uuid, timestamptz, text, text, text, text, text, date, date, text,
  text, text, boolean
) is 'Crea booking sustituto sin copiar BL, documentos, actuals ni tracking.';

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
    raise exception 'Acceso disponible unicamente para clientes autorizados'
      using errcode = '42501';
  end if;

  v_cliente_id := public.current_user_cliente_id();
  if v_cliente_id is null then
    raise exception 'El usuario no esta vinculado a un cliente'
      using errcode = '42501';
  end if;

  return query
  select
    shipment.id,
    shipment.shipment_number,
    case public.derive_shipment_operational_status(shipment.id)
      when 'Parcialmente confirmado' then 'Parcialmente Confirmado'
      else public.derive_shipment_operational_status(shipment.id)
    end,
    count(booking.id),
    min(coalesce(booking.actual_etd, booking.etd)),
    max(coalesce(booking.actual_eta, booking.eta)),
    shipment.created_at,
    coalesce(shipment.service_type, q.service_product),
    coalesce(shipment.origin, q.origen),
    coalesce(shipment.destination, q.destino),
    q.quotation_number,
    q.commodity,
    coalesce(shipment.incoterm, q.incoterm),
    q.peso_kg,
    q.volumen_cbm
  from public.shipments shipment
  join public.quotations q on q.id = shipment.quotation_id
  left join public.bookings booking
    on booking.shipment_id = shipment.id
   and booking.booking_lifecycle_status = 'ACTIVE'
  where shipment.client_id = v_cliente_id
    and q.deleted_at is null
  group by shipment.id, q.id
  having p_include_completed
    or public.derive_shipment_operational_status(shipment.id)
      not in ('Finalizado', 'Cancelado')
  order by shipment.created_at desc;
end;
$$;

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
    raise exception 'Acceso disponible unicamente para clientes autorizados'
      using errcode = '42501';
  end if;

  v_cliente_id := public.current_user_cliente_id();
  if v_cliente_id is null then
    raise exception 'El usuario no esta vinculado a un cliente'
      using errcode = '42501';
  end if;

  return query
  select
    shipment.id,
    shipment.shipment_number,
    case public.derive_shipment_operational_status(shipment.id)
      when 'Parcialmente confirmado' then 'Parcialmente Confirmado'
      else public.derive_shipment_operational_status(shipment.id)
    end,
    si.origin_address,
    si.destination_address,
    shipment.created_at,
    coalesce(shipment.service_type, q.service_product),
    coalesce(shipment.origin, q.origen),
    coalesce(shipment.destination, q.destino),
    q.quotation_number,
    q.commodity,
    coalesce(shipment.incoterm, q.incoterm),
    q.peso_kg,
    q.volumen_cbm,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', booking.id,
          'shipment_id', booking.shipment_id,
          'booking_number', booking.booking_number,
          'carrier_booking', booking.carrier_booking,
          'carrier', booking.carrier,
          'vessel_name', booking.vessel_name,
          'voyage', booking.voyage,
          'original_etd', booking.original_etd,
          'original_eta', booking.original_eta,
          'etd', booking.etd,
          'eta', booking.eta,
          'actual_etd', booking.actual_etd,
          'actual_eta', booking.actual_eta,
          'tracking_url', booking.tracking_url,
          'shipment_status', booking.shipment_status,
          'free_days', booking.free_days,
          'remaining_free_days', booking.remaining_free_days,
          'freight_terms', booking.freight_terms,
          'release_type', booking.release_type,
          'master_bl', booking.master_bl,
          'house_bl', booking.house_bl,
          'revision_count', (
            select count(*)
            from public.booking_schedule_revisions revision
            where revision.booking_id = booking.id
          ),
          'last_schedule_update', (
            select max(revision.created_at)
            from public.booking_schedule_revisions revision
            where revision.booking_id = booking.id
              and revision.revision_number > 1
              and revision.revision_type <> 'ADMIN_CORRECTION'
          ),
          'container_count', coalesce((
            select sum(bc.quantity)
            from public.booking_containers bc
            where bc.booking_id = booking.id
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
            where bl.booking_id = booking.id
          ), '[]'::jsonb)
        )
        order by booking.created_at, booking.id
      )
      from public.bookings booking
      where booking.shipment_id = shipment.id
        and booking.booking_lifecycle_status = 'ACTIVE'
    ), '[]'::jsonb)
  from public.shipments shipment
  left join public.shipping_instructions si
    on si.id = shipment.shipping_instruction_id
  join public.quotations q on q.id = shipment.quotation_id
  where (shipment.id = p_shipment_id
      or shipment.shipping_instruction_id = p_shipment_id)
    and shipment.client_id = v_cliente_id
    and q.deleted_at is null;
end;
$$;

revoke all on function public.get_client_shipments_v2(boolean)
  from public, anon;
revoke all on function public.get_client_shipment_detail_v2(uuid)
  from public, anon;
grant execute on function public.get_client_shipments_v2(boolean)
  to authenticated;
grant execute on function public.get_client_shipment_detail_v2(uuid)
  to authenticated;

notify pgrst, 'reload schema';

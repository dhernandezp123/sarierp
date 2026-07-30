-- Fase 5C: cut-offs, VGM y readiness previo al embarque.
-- Migracion aditiva. No elimina historia ni escribe campos legacy.

create table if not exists public.booking_cutoffs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null
    references public.shipments(id) on delete restrict,
  booking_id uuid not null
    references public.bookings(id) on delete restrict,
  booking_container_id uuid
    references public.booking_containers(id) on delete restrict,
  booking_schedule_revision_id uuid
    references public.booking_schedule_revisions(id) on delete restrict,
  supersedes_cutoff_id uuid
    references public.booking_cutoffs(id) on delete restrict,
  superseded_by_cutoff_id uuid
    references public.booking_cutoffs(id) on delete restrict,
  cutoff_code text not null,
  cutoff_label text not null,
  due_at timestamptz not null,
  timezone text,
  source text not null,
  source_reference text,
  status text not null default 'PENDING',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  waived_at timestamptz,
  waived_by uuid references auth.users(id) on delete set null,
  waiver_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_cutoffs_code_check check (
    cutoff_code in (
      'SHIPPING_INSTRUCTIONS',
      'DOCUMENTATION',
      'VGM',
      'CY',
      'GATE_IN',
      'CARGO_DELIVERY',
      'CUSTOMS',
      'AMS',
      'ENS',
      'PORT',
      'TERMINAL_RECEIVING',
      'EMPTY_PICKUP',
      'FULL_RETURN',
      'OTHER'
    )
  ),
  constraint booking_cutoffs_status_check check (
    status in (
      'PENDING',
      'COMPLETED',
      'MISSED',
      'WAIVED',
      'CANCELLED',
      'NOT_APPLICABLE'
    )
  ),
  constraint booking_cutoffs_source_check check (
    source in (
      'MANUAL',
      'CARRIER',
      'TERMINAL',
      'SCHEDULE_REVISION',
      'LEGACY_BACKFILL',
      'ADMIN_CORRECTION'
    )
  ),
  constraint booking_cutoffs_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint booking_cutoffs_completion_check check (
    (status = 'COMPLETED' and completed_at is not null and completed_by is not null)
    or (status <> 'COMPLETED')
  ),
  constraint booking_cutoffs_waiver_check check (
    (
      status = 'WAIVED'
      and waived_at is not null
      and waived_by is not null
      and nullif(btrim(waiver_reason), '') is not null
    )
    or status <> 'WAIVED'
  ),
  constraint booking_cutoffs_cancellation_check check (
    (
      status = 'CANCELLED'
      and cancelled_at is not null
      and cancelled_by is not null
      and nullif(btrim(cancellation_reason), '') is not null
    )
    or status <> 'CANCELLED'
  ),
  constraint booking_cutoffs_no_self_supersede_check check (
    supersedes_cutoff_id is null
    or supersedes_cutoff_id <> id
  )
);

create unique index if not exists booking_cutoffs_one_current_scope_idx
  on public.booking_cutoffs (
    booking_id,
    coalesce(
      booking_container_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    cutoff_code
  )
  where superseded_by_cutoff_id is null
    and status <> 'CANCELLED';

create index if not exists booking_cutoffs_booking_due_idx
  on public.booking_cutoffs (booking_id, due_at)
  where superseded_by_cutoff_id is null;

create index if not exists booking_cutoffs_shipment_idx
  on public.booking_cutoffs (shipment_id, booking_id);

create table if not exists public.container_vgm_records (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null
    references public.shipments(id) on delete restrict,
  booking_id uuid not null
    references public.bookings(id) on delete restrict,
  booking_container_id uuid not null
    references public.booking_containers(id) on delete restrict,
  version_number integer not null,
  supersedes_vgm_id uuid
    references public.container_vgm_records(id) on delete restrict,
  gross_mass numeric not null,
  unit text not null,
  verification_method text not null,
  weighed_at timestamptz,
  verified_at timestamptz,
  verified_by_name text,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  submission_reference text,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  status text not null default 'DRAFT',
  document_id uuid
    references public.booking_documents(id) on delete restrict,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint container_vgm_positive_mass_check check (gross_mass > 0),
  constraint container_vgm_unit_check check (unit in ('KG', 'LB')),
  constraint container_vgm_method_check check (
    verification_method in (
      'METHOD_1',
      'METHOD_2',
      'CARRIER_PROVIDED',
      'OTHER'
    )
  ),
  constraint container_vgm_status_check check (
    status in (
      'DRAFT',
      'VERIFIED',
      'SUBMITTED',
      'ACCEPTED',
      'REJECTED',
      'SUPERSEDED'
    )
  ),
  constraint container_vgm_version_check check (version_number > 0),
  constraint container_vgm_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint container_vgm_verified_check check (
    (
      status not in ('VERIFIED', 'SUBMITTED', 'ACCEPTED')
    )
    or (
      verified_at is not null
      and (
        verified_by_user_id is not null
        or nullif(btrim(verified_by_name), '') is not null
      )
    )
  ),
  constraint container_vgm_submitted_check check (
    status not in ('SUBMITTED', 'ACCEPTED')
    or (submitted_at is not null and submitted_by is not null)
  ),
  constraint container_vgm_accepted_check check (
    status <> 'ACCEPTED'
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint container_vgm_rejected_check check (
    status <> 'REJECTED'
    or (
      rejected_at is not null
      and rejected_by is not null
      and nullif(btrim(rejection_reason), '') is not null
    )
  )
);

create unique index if not exists container_vgm_one_active_idx
  on public.container_vgm_records (booking_container_id)
  where status in ('DRAFT', 'VERIFIED', 'SUBMITTED', 'ACCEPTED');

create unique index if not exists container_vgm_version_idx
  on public.container_vgm_records (booking_container_id, version_number);

create index if not exists container_vgm_booking_idx
  on public.container_vgm_records (booking_id, booking_container_id);

create table if not exists public.booking_readiness_requirements (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null
    references public.shipments(id) on delete restrict,
  booking_id uuid not null
    references public.bookings(id) on delete restrict,
  booking_container_id uuid
    references public.booking_containers(id) on delete restrict,
  requirement_code text not null,
  requirement_label text not null,
  requirement_scope text not null,
  is_required boolean not null default true,
  status text not null default 'PENDING',
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  source_entity_type text,
  source_entity_id uuid,
  waived_at timestamptz,
  waived_by uuid references auth.users(id) on delete set null,
  waiver_reason text,
  validation_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_readiness_requirement_code_check check (
    requirement_code in (
      'BOOKING_CONFIRMATION',
      'SHIPPING_INSTRUCTIONS_SENT',
      'DOCUMENTATION_COMPLETE',
      'CONTAINERS_ASSIGNED',
      'VESSEL_AND_VOYAGE',
      'ETD_AND_ETA',
      'VGM_COMPLETE',
      'CUSTOMS_FILING',
      'GATE_IN_COMPLETE',
      'CARGO_RECEIVED',
      'BL_INSTRUCTIONS',
      'NO_BLOCKING_INCIDENTS'
    )
  ),
  constraint booking_readiness_requirement_scope_check check (
    requirement_scope in ('BOOKING', 'CONTAINER')
  ),
  constraint booking_readiness_requirement_status_check check (
    status in ('PENDING', 'COMPLETED', 'WAIVED', 'NOT_APPLICABLE')
  ),
  constraint booking_readiness_requirement_details_check check (
    jsonb_typeof(validation_details) = 'object'
  )
);

create unique index if not exists booking_readiness_requirement_scope_idx
  on public.booking_readiness_requirements (
    booking_id,
    coalesce(
      booking_container_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    requirement_code
  );

create table if not exists public.booking_readiness_exceptions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null
    references public.shipments(id) on delete restrict,
  booking_id uuid not null
    references public.bookings(id) on delete restrict,
  booking_container_id uuid
    references public.booking_containers(id) on delete restrict,
  booking_readiness_requirement_id uuid
    references public.booking_readiness_requirements(id) on delete restrict,
  booking_cutoff_id uuid
    references public.booking_cutoffs(id) on delete restrict,
  requirement_code text not null,
  reason text not null,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'ACTIVE',
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint booking_readiness_exception_status_check check (
    status in ('ACTIVE', 'REVOKED')
  ),
  constraint booking_readiness_exception_reason_check check (
    nullif(btrim(reason), '') is not null
  ),
  constraint booking_readiness_exception_target_check check (
    booking_readiness_requirement_id is not null
    or booking_cutoff_id is not null
  ),
  constraint booking_readiness_exception_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists booking_readiness_one_active_exception_idx
  on public.booking_readiness_exceptions (
    coalesce(
      booking_readiness_requirement_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    coalesce(
      booking_cutoff_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  )
  where status = 'ACTIVE';

create index if not exists booking_readiness_exception_booking_idx
  on public.booking_readiness_exceptions (booking_id, expires_at);

create table if not exists public.booking_readiness_evaluations (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null
    references public.shipments(id) on delete restrict,
  booking_id uuid not null
    references public.bookings(id) on delete restrict,
  trigger_status text not null,
  result jsonb not null,
  evaluated_by uuid references auth.users(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  constraint booking_readiness_evaluation_result_check check (
    jsonb_typeof(result) = 'object'
  )
);

create index if not exists booking_readiness_evaluation_booking_idx
  on public.booking_readiness_evaluations (
    booking_id,
    evaluated_at desc
  );

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
        'BOOKING_REACTIVATED',
        'CARGO_RECEIVED',
        'CARGO_DELIVERED',
        'BLOCKING_INCIDENT_OPEN',
        'CUTOFF_CREATED',
        'CUTOFF_CHANGED',
        'CUTOFF_COMPLETED',
        'CUTOFF_MISSED',
        'CUTOFF_WAIVED',
        'VGM_RECORDED',
        'VGM_VERIFIED',
        'VGM_SUBMITTED',
        'VGM_ACCEPTED',
        'VGM_REJECTED',
        'VGM_CORRECTED',
        'READINESS_REQUIREMENT_COMPLETED',
        'READINESS_EXCEPTION_AUTHORIZED',
        'READINESS_EXCEPTION_REVOKED',
        'READINESS_BLOCKED'
      ]
    )
  );

alter table public.operational_events
  drop constraint if exists operational_events_source_check;
alter table public.operational_events
  add constraint operational_events_source_check
  check (
    source_system = any(
      array['manual', 'transition', 'legacy', 'system', 'readiness']
    )
  );

-- Las tablas 5C son append-only para clientes SQL generales.
create or replace function public.guard_booking_readiness_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'La historia 5C no se elimina'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and coalesce(
       current_setting('app.booking_readiness_write_mode', true),
       ''
     ) = '' then
    raise exception 'Utiliza el RPC controlado para modificar datos 5C'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists booking_cutoffs_history_guard
  on public.booking_cutoffs;
create trigger booking_cutoffs_history_guard
before update or delete on public.booking_cutoffs
for each row execute function public.guard_booking_readiness_history();

drop trigger if exists container_vgm_history_guard
  on public.container_vgm_records;
create trigger container_vgm_history_guard
before update or delete on public.container_vgm_records
for each row execute function public.guard_booking_readiness_history();

drop trigger if exists booking_readiness_requirement_history_guard
  on public.booking_readiness_requirements;
create trigger booking_readiness_requirement_history_guard
before update or delete on public.booking_readiness_requirements
for each row execute function public.guard_booking_readiness_history();

drop trigger if exists booking_readiness_exception_history_guard
  on public.booking_readiness_exceptions;
create trigger booking_readiness_exception_history_guard
before update or delete on public.booking_readiness_exceptions
for each row execute function public.guard_booking_readiness_history();

drop trigger if exists booking_readiness_evaluation_history_guard
  on public.booking_readiness_evaluations;
create trigger booking_readiness_evaluation_history_guard
before update or delete on public.booking_readiness_evaluations
for each row execute function public.guard_booking_readiness_history();

-- Integridad diferida: shipment, booking, contenedor, documento y reemplazo.
create or replace function public.validate_booking_readiness_relationships()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_shipment_id uuid;
  v_container_id uuid;
  v_document_id uuid;
begin
  v_booking_id := new.booking_id;
  v_shipment_id := new.shipment_id;

  if not exists (
    select 1
    from public.bookings b
    where b.id = v_booking_id
      and b.shipment_id = v_shipment_id
  ) then
    raise exception 'El booking y shipment de 5C no coinciden'
      using errcode = '23514';
  end if;

  if tg_table_name = 'booking_cutoffs' then
    v_container_id := new.booking_container_id;
    if new.booking_schedule_revision_id is not null
       and not exists (
         select 1
         from public.booking_schedule_revisions r
         where r.id = new.booking_schedule_revision_id
           and r.booking_id = v_booking_id
       ) then
      raise exception 'La revision no pertenece al booking'
        using errcode = '23514';
    end if;
    if new.supersedes_cutoff_id is not null
       and not exists (
         select 1
         from public.booking_cutoffs previous
         where previous.id = new.supersedes_cutoff_id
           and previous.booking_id = v_booking_id
           and previous.booking_container_id is not distinct from v_container_id
           and previous.cutoff_code = new.cutoff_code
       ) then
      raise exception 'El cut-off reemplazado no pertenece al mismo alcance'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'container_vgm_records' then
    v_container_id := new.booking_container_id;
    v_document_id := new.document_id;
    if v_document_id is not null
       and not exists (
         select 1
         from public.booking_documents d
         where d.id = v_document_id
           and d.booking_id = v_booking_id
       ) then
      raise exception 'El documento VGM no pertenece al booking'
        using errcode = '23514';
    end if;
  elsif tg_table_name in (
    'booking_readiness_requirements',
    'booking_readiness_exceptions'
  ) then
    v_container_id := new.booking_container_id;
  end if;

  if v_container_id is not null
     and not exists (
       select 1
       from public.booking_containers bc
       where bc.id = v_container_id
         and bc.booking_id = v_booking_id
     ) then
    raise exception 'El contenedor no pertenece al booking'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_cutoffs_relationship_check
  on public.booking_cutoffs;
create constraint trigger booking_cutoffs_relationship_check
after insert or update on public.booking_cutoffs
deferrable initially deferred
for each row execute function public.validate_booking_readiness_relationships();

drop trigger if exists container_vgm_relationship_check
  on public.container_vgm_records;
create constraint trigger container_vgm_relationship_check
after insert or update on public.container_vgm_records
deferrable initially deferred
for each row execute function public.validate_booking_readiness_relationships();

drop trigger if exists booking_readiness_requirement_relationship_check
  on public.booking_readiness_requirements;
create constraint trigger booking_readiness_requirement_relationship_check
after insert or update on public.booking_readiness_requirements
deferrable initially deferred
for each row execute function public.validate_booking_readiness_relationships();

drop trigger if exists booking_readiness_exception_relationship_check
  on public.booking_readiness_exceptions;
create constraint trigger booking_readiness_exception_relationship_check
after insert or update on public.booking_readiness_exceptions
deferrable initially deferred
for each row execute function public.validate_booking_readiness_relationships();

create or replace function public.booking_operational_mode(
  p_booking_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with source as (
    select lower(
      translate(
        concat_ws(
          ' ',
          q.tipo_transporte,
          q.quote_type,
          q.service_product,
          s.service_type
        ),
        'áéíóúüñ',
        'aeiouun'
      )
    ) as value
    from public.bookings b
    join public.shipments s on s.id = b.shipment_id
    left join public.quotations q on q.id = s.quotation_id
    where b.id = p_booking_id
  )
  select case
    when value ~ '(aereo|air|miami_air|courier)' then 'AIR'
    when value ~ '(terrestre|road|truck|ltl)' then 'ROAD_LTL'
    when value ~ '(ftl)' then 'ROAD_FTL'
    when value ~ '(lcl|miami_lcl|consolidado maritimo)' then 'SEA_LCL'
    when value ~ '(fcl|maritima|maritimo|ocean)' then 'SEA_FCL'
    else 'UNKNOWN'
  end
  from source
$$;

create or replace function public.get_booking_readiness_template(
  p_booking_id uuid
)
returns table (
  requirement_code text,
  requirement_label text,
  requirement_scope text,
  is_required boolean,
  severity text
)
language sql
stable
security definer
set search_path = public
as $$
  with mode as (
    select public.booking_operational_mode(p_booking_id) as value
  )
  select template.requirement_code,
         template.requirement_label,
         'BOOKING'::text,
         case template.requirement_code
           when 'CONTAINERS_ASSIGNED' then mode.value = 'SEA_FCL'
           when 'VESSEL_AND_VOYAGE' then mode.value in ('SEA_FCL', 'SEA_LCL')
           when 'VGM_COMPLETE' then mode.value = 'SEA_FCL'
           when 'CARGO_RECEIVED' then mode.value in ('SEA_LCL', 'AIR')
           when 'BL_INSTRUCTIONS' then mode.value in ('SEA_FCL', 'SEA_LCL')
           when 'CUSTOMS_FILING' then false
           when 'GATE_IN_COMPLETE' then false
           else true
         end,
         template.severity
  from mode
  cross join (
    values
      ('BOOKING_CONFIRMATION', 'Booking Confirmation', 'BLOCKING'),
      ('SHIPPING_INSTRUCTIONS_SENT', 'Shipping Instructions enviadas', 'BLOCKING'),
      ('DOCUMENTATION_COMPLETE', 'Documentacion minima completa', 'BLOCKING'),
      ('CONTAINERS_ASSIGNED', 'Contenedores fisicos asignados', 'BLOCKING'),
      ('VESSEL_AND_VOYAGE', 'Buque y viaje confirmados', 'BLOCKING'),
      ('ETD_AND_ETA', 'ETD y ETA confirmadas', 'BLOCKING'),
      ('VGM_COMPLETE', 'VGM completa por contenedor', 'BLOCKING'),
      ('CUSTOMS_FILING', 'Declaracion aduanera', 'BLOCKING'),
      ('GATE_IN_COMPLETE', 'Gate In completado', 'BLOCKING'),
      ('CARGO_RECEIVED', 'Carga recibida', 'BLOCKING'),
      ('BL_INSTRUCTIONS', 'Instrucciones de BL disponibles', 'BLOCKING'),
      ('NO_BLOCKING_INCIDENTS', 'Sin incidentes bloqueantes', 'BLOCKING')
  ) as template(requirement_code, requirement_label, severity)
$$;

create or replace function public.seed_booking_readiness_requirements(
  p_booking_id uuid,
  p_historical_backfill boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_count integer;
begin
  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if not found or v_booking.shipment_id is null then
    return 0;
  end if;

  insert into public.booking_readiness_requirements (
    shipment_id,
    booking_id,
    requirement_code,
    requirement_label,
    requirement_scope,
    is_required,
    status,
    validation_details
  )
  select
    v_booking.shipment_id,
    v_booking.id,
    template.requirement_code,
    template.requirement_label,
    template.requirement_scope,
    template.is_required,
    case
      when not template.is_required then 'NOT_APPLICABLE'
      when p_historical_backfill
       and (
         v_booking.actual_etd is not null
         or v_booking.shipment_status in (
           'Embarcado',
           'En Transito',
           'En Tránsito',
           'Arribado',
           'Finalizado'
         )
       ) then 'NOT_APPLICABLE'
      else 'PENDING'
    end,
    case
      when p_historical_backfill
       and (
         v_booking.actual_etd is not null
         or v_booking.shipment_status in (
           'Embarcado',
           'En Transito',
           'En Tránsito',
           'Arribado',
           'Finalizado'
         )
       ) then jsonb_build_object(
         'historical_snapshot', true,
         'reason', 'POST_DEPARTURE_BACKFILL_NO_RETROACTIVE_BLOCK'
       )
      else jsonb_build_object(
        'template_mode',
        public.booking_operational_mode(v_booking.id)
      )
    end
  from public.get_booking_readiness_template(v_booking.id) template
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.seed_booking_readiness_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_booking_readiness_requirements(new.id, false);
  return new;
end;
$$;

drop trigger if exists bookings_seed_readiness_after_insert
  on public.bookings;
create trigger bookings_seed_readiness_after_insert
after insert on public.bookings
for each row execute function public.seed_booking_readiness_after_insert();

-- El evaluador es read-only y calcula desde fuentes canonicas.
create or replace function public.evaluate_booking_readiness(
  p_booking_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_mode text;
  v_requirements jsonb := '[]'::jsonb;
  v_overdue jsonb := '[]'::jsonb;
  v_missing_vgm jsonb := '[]'::jsonb;
  v_exceptions jsonb := '[]'::jsonb;
  v_blocking_count integer := 0;
  v_warning_count integer := 0;
  v_complete boolean;
  v_required boolean;
  v_has_exception boolean;
  v_status text;
  v_details jsonb;
  v_row record;
begin
  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    raise exception 'Booking no encontrado'
      using errcode = 'P0002';
  end if;

  v_mode := public.booking_operational_mode(v_booking.id);

  for v_row in
    select template.*,
           requirement.id as requirement_id,
           requirement.status as stored_status,
           requirement.completed_at,
           requirement.completed_by,
           requirement.validation_details
    from public.get_booking_readiness_template(v_booking.id) template
    left join public.booking_readiness_requirements requirement
      on requirement.booking_id = v_booking.id
     and requirement.booking_container_id is null
     and requirement.requirement_code = template.requirement_code
    order by template.requirement_code
  loop
    v_required := v_row.is_required;
    if v_row.requirement_code = 'CUSTOMS_FILING' then
      v_required := exists (
        select 1
        from public.booking_cutoffs c
        where c.booking_id = v_booking.id
          and c.superseded_by_cutoff_id is null
          and c.status <> 'CANCELLED'
          and c.cutoff_code in ('CUSTOMS', 'AMS', 'ENS')
      );
    elsif v_row.requirement_code = 'GATE_IN_COMPLETE' then
      v_required := v_mode = 'SEA_FCL'
        and exists (
          select 1
          from public.booking_cutoffs c
          where c.booking_id = v_booking.id
            and c.superseded_by_cutoff_id is null
            and c.status <> 'CANCELLED'
            and c.cutoff_code in ('GATE_IN', 'CY', 'FULL_RETURN')
        );
    end if;

    v_complete := false;
    v_details := '{}'::jsonb;

    case v_row.requirement_code
      when 'BOOKING_CONFIRMATION' then
        v_complete := exists (
          select 1
          from public.booking_documents d
          where d.booking_id = v_booking.id
            and d.document_type = 'Booking Confirmation'
        );
      when 'SHIPPING_INSTRUCTIONS_SENT' then
        v_complete := exists (
          select 1
          from public.shipping_instructions si
          where si.id = v_booking.shipping_instruction_id
            and (
              si.validated_at is not null
              or si.status in ('Validada', 'Finalizada')
              or si.operational_status in (
                'Listo para Booking',
                'Booking Confirmado',
                'Finalizado'
              )
            )
        );
      when 'DOCUMENTATION_COMPLETE' then
        v_complete := not exists (
          select 1
          from unnest(array['Commercial Invoice', 'Packing List'])
            required(document_type)
          where not exists (
            select 1
            from public.booking_documents d
            where d.booking_id = v_booking.id
              and d.document_type = required.document_type
          )
        );
      when 'CONTAINERS_ASSIGNED' then
        v_complete := exists (
          select 1
          from public.booking_containers bc
          where bc.booking_id = v_booking.id
            and coalesce(bc.quantity, 0) > 0
        );
      when 'VESSEL_AND_VOYAGE' then
        v_complete :=
          nullif(btrim(coalesce(v_booking.vessel_name, '')), '') is not null
          and nullif(btrim(coalesce(v_booking.voyage, '')), '') is not null;
      when 'ETD_AND_ETA' then
        v_complete := v_booking.etd is not null and v_booking.eta is not null;
      when 'VGM_COMPLETE' then
        v_complete := exists (
          select 1
          from public.booking_containers bc
          where bc.booking_id = v_booking.id
        ) and not exists (
          select 1
          from public.booking_containers bc
          where bc.booking_id = v_booking.id
            and (
              coalesce(bc.quantity, 0) <> 1
              or not exists (
                select 1
                from public.container_vgm_records vgm
                where vgm.booking_container_id = bc.id
                  and vgm.booking_id = v_booking.id
                  and vgm.status in ('SUBMITTED', 'ACCEPTED')
              )
            )
        );
      when 'CUSTOMS_FILING' then
        v_complete := not v_required
          or exists (
            select 1
            from public.booking_readiness_requirements r
            where r.id = v_row.requirement_id
              and r.status = 'COMPLETED'
          );
      when 'GATE_IN_COMPLETE' then
        v_complete := not v_required
          or (
            exists (
              select 1
              from public.booking_containers bc
              where bc.booking_id = v_booking.id
            )
            and not exists (
              select 1
              from public.booking_containers bc
              where bc.booking_id = v_booking.id
                and not exists (
                  select 1
                  from public.operational_events oe
                  where oe.booking_id = v_booking.id
                    and oe.booking_container_id = bc.id
                    and oe.event_code = 'GATE_IN'
                )
            )
          );
      when 'CARGO_RECEIVED' then
        v_complete := exists (
          select 1
          from public.operational_events oe
          where oe.booking_id = v_booking.id
            and oe.event_code in ('CARGO_RECEIVED', 'CARGO_DELIVERED')
        ) or exists (
          select 1
          from public.booking_readiness_requirements r
          where r.id = v_row.requirement_id
            and r.status = 'COMPLETED'
        );
      when 'BL_INSTRUCTIONS' then
        v_complete := exists (
          select 1
          from public.shipping_instructions si
          where si.id = v_booking.shipping_instruction_id
            and si.validated_at is not null
        );
      when 'NO_BLOCKING_INCIDENTS' then
        v_complete := not exists (
          select 1
          from public.operational_events oe
          where oe.booking_id = v_booking.id
            and (
              oe.event_code = 'BLOCKING_INCIDENT_OPEN'
              or coalesce((oe.metadata ->> 'blocking')::boolean, false)
            )
            and not coalesce((oe.metadata ->> 'resolved')::boolean, false)
        );
      else
        v_complete := v_row.stored_status = 'COMPLETED';
    end case;

    v_has_exception := exists (
      select 1
      from public.booking_readiness_exceptions exception
      where exception.booking_id = v_booking.id
        and exception.requirement_code = v_row.requirement_code
        and exception.status = 'ACTIVE'
        and (
          exception.booking_readiness_requirement_id = v_row.requirement_id
          or (
            v_row.requirement_id is null
            and exception.booking_readiness_requirement_id is null
          )
        )
        and (
          exception.expires_at is null
          or exception.expires_at > clock_timestamp()
        )
    );

    if not v_required then
      v_status := 'NOT_APPLICABLE';
    elsif v_complete then
      v_status := 'COMPLETED';
    elsif v_has_exception then
      v_status := 'AUTHORIZED_EXCEPTION';
    else
      v_status := 'BLOCKED';
      v_blocking_count := v_blocking_count + 1;
    end if;

    v_requirements := v_requirements || jsonb_build_array(
      jsonb_build_object(
        'id', v_row.requirement_id,
        'code', v_row.requirement_code,
        'label', v_row.requirement_label,
        'scope', v_row.requirement_scope,
        'required', v_required,
        'status', v_status,
        'blocking', v_status = 'BLOCKED',
        'completed_at', v_row.completed_at,
        'completed_by', v_row.completed_by,
        'details', coalesce(v_row.validation_details, '{}'::jsonb) || v_details
      )
    );
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'code', c.cutoff_code,
        'label', c.cutoff_label,
        'container_id', c.booking_container_id,
        'due_at', c.due_at,
        'timezone', c.timezone,
        'status', c.status
      )
      order by c.due_at
    ),
    '[]'::jsonb
  )
  into v_overdue
  from public.booking_cutoffs c
  where c.booking_id = v_booking.id
    and c.superseded_by_cutoff_id is null
    and c.status in ('PENDING', 'MISSED', 'WAIVED')
    and c.due_at <= clock_timestamp()
    and not exists (
      select 1
      from public.booking_readiness_exceptions exception
      where exception.booking_cutoff_id = c.id
        and exception.status = 'ACTIVE'
        and (
          exception.expires_at is null
          or exception.expires_at > clock_timestamp()
        )
    );

  v_blocking_count := v_blocking_count + jsonb_array_length(v_overdue);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'booking_container_id', bc.id,
        'container_type', bc.container_type,
        'quantity', bc.quantity,
        'container_reference', bc.notes,
        'reason', case
          when coalesce(bc.quantity, 0) <> 1
            then 'ROW_REPRESENTS_MULTIPLE_CONTAINERS'
          when exists (
            select 1
            from public.container_vgm_records rejected
            where rejected.booking_container_id = bc.id
              and rejected.status = 'REJECTED'
          ) then 'VGM_REJECTED'
          else 'VGM_NOT_SUBMITTED'
        end
      )
      order by bc.created_at, bc.id
    ),
    '[]'::jsonb
  )
  into v_missing_vgm
  from public.booking_containers bc
  where bc.booking_id = v_booking.id
    and v_mode = 'SEA_FCL'
    and (
      coalesce(bc.quantity, 0) <> 1
      or not exists (
        select 1
        from public.container_vgm_records vgm
        where vgm.booking_container_id = bc.id
          and vgm.booking_id = v_booking.id
          and vgm.status in ('SUBMITTED', 'ACCEPTED')
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', exception.id,
        'requirement_code', exception.requirement_code,
        'booking_container_id', exception.booking_container_id,
        'booking_cutoff_id', exception.booking_cutoff_id,
        'reason', exception.reason,
        'approved_by', exception.approved_by,
        'approved_at', exception.approved_at,
        'expires_at', exception.expires_at
      )
      order by exception.approved_at
    ),
    '[]'::jsonb
  )
  into v_exceptions
  from public.booking_readiness_exceptions exception
  where exception.booking_id = v_booking.id
    and exception.status = 'ACTIVE'
    and (
      exception.expires_at is null
      or exception.expires_at > clock_timestamp()
    );

  select count(*)::integer
  into v_warning_count
  from public.booking_cutoffs c
  where c.booking_id = v_booking.id
    and c.superseded_by_cutoff_id is null
    and c.status = 'PENDING'
    and c.due_at > clock_timestamp()
    and c.due_at <= clock_timestamp() + interval '72 hours';

  v_warning_count := v_warning_count + (
    select count(*)::integer
    from public.booking_readiness_exceptions exception
    where exception.booking_id = v_booking.id
      and exception.status = 'ACTIVE'
      and exception.expires_at > clock_timestamp()
      and exception.expires_at <= clock_timestamp() + interval '24 hours'
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'shipment_id', v_booking.shipment_id,
    'mode', v_mode,
    'lifecycle_status', v_booking.booking_lifecycle_status,
    'excluded', v_booking.booking_lifecycle_status <> 'ACTIVE',
    'ready',
      v_booking.booking_lifecycle_status = 'ACTIVE'
      and v_blocking_count = 0,
    'blocking_count', v_blocking_count,
    'warning_count', v_warning_count,
    'requirements', v_requirements,
    'overdue_cutoffs', v_overdue,
    'missing_vgm_containers', v_missing_vgm,
    'authorized_exceptions', v_exceptions,
    'evaluated_at', clock_timestamp()
  );
end;
$$;

create or replace function public.log_booking_readiness_action(
  p_booking_id uuid,
  p_event_code text,
  p_event_label text,
  p_source_id uuid,
  p_action text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  insert into public.operational_events (
    shipping_instruction_id,
    shipment_id,
    booking_id,
    event_code,
    event_label,
    occurred_at,
    metadata,
    source_system,
    source_id,
    created_by
  ) values (
    v_booking.shipping_instruction_id,
    v_booking.shipment_id,
    v_booking.id,
    p_event_code,
    p_event_label,
    clock_timestamp(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source_entity_id',
      p_source_id
    ),
    'readiness',
    gen_random_uuid(),
    auth.uid()
  );

  insert into public.activity_logs (
    user_id,
    module,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    auth.uid(),
    'operations',
    p_action,
    'booking',
    v_booking.id,
    p_description,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source_entity_id',
      p_source_id
    )
  );
end;
$$;

create or replace function public.create_or_replace_booking_cutoff(
  p_booking_id uuid,
  p_booking_container_id uuid,
  p_cutoff_code text,
  p_cutoff_label text,
  p_due_at timestamptz,
  p_timezone text,
  p_source text,
  p_source_reference text default null,
  p_booking_schedule_revision_id uuid default null,
  p_reason text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_allow_completed_replacement boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_old public.booking_cutoffs%rowtype;
  v_new public.booking_cutoffs%rowtype;
begin
  if v_user_id is null then
    raise exception 'Se requiere autenticacion' using errcode = '42501';
  end if;
  if not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'Solo Admin u Operaciones puede gestionar cut-offs'
      using errcode = '42501';
  end if;
  if p_due_at is null then
    raise exception 'La fecha y hora del cut-off es obligatoria'
      using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_timezone, '')), '') is null
     or not exists (
       select 1
       from pg_timezone_names timezone_name
       where timezone_name.name = p_timezone
     ) then
    raise exception 'Timezone IANA invalido'
      using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  select b.*
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking no encontrado' using errcode = 'P0002';
  end if;
  if v_booking.booking_lifecycle_status <> 'ACTIVE'
     or v_booking.shipment_status = 'Finalizado' then
    raise exception 'El booking historico o finalizado no admite cut-offs'
      using errcode = '55000';
  end if;

  select c.*
  into v_old
  from public.booking_cutoffs c
  where c.booking_id = v_booking.id
    and c.booking_container_id is not distinct from p_booking_container_id
    and c.cutoff_code = p_cutoff_code
    and c.superseded_by_cutoff_id is null
    and c.status <> 'CANCELLED'
  for update;

  if found then
    if v_old.status = 'COMPLETED'
       and not (
         public.is_role(array['Admin'])
         and p_allow_completed_replacement
         and nullif(btrim(coalesce(p_reason, '')), '') is not null
       ) then
      raise exception 'Un cut-off completado requiere excepcion administrativa'
        using errcode = '23514';
    end if;
    if v_old.due_at is not distinct from p_due_at
       and v_old.timezone is not distinct from p_timezone
       and v_old.cutoff_label is not distinct from p_cutoff_label then
      return jsonb_build_object(
        'created', false,
        'cutoff', to_jsonb(v_old)
      );
    end if;
    if nullif(btrim(coalesce(p_reason, '')), '') is null then
      raise exception 'El motivo del cambio de cut-off es obligatorio'
        using errcode = '22023';
    end if;

    perform set_config(
      'app.booking_readiness_write_mode',
      'cutoff_replace',
      true
    );
    update public.booking_cutoffs
    set status = 'CANCELLED',
        cancelled_at = clock_timestamp(),
        cancelled_by = v_user_id,
        cancellation_reason = btrim(p_reason),
        updated_at = clock_timestamp()
    where id = v_old.id;
  end if;

  insert into public.booking_cutoffs (
    shipment_id,
    booking_id,
    booking_container_id,
    booking_schedule_revision_id,
    supersedes_cutoff_id,
    cutoff_code,
    cutoff_label,
    due_at,
    timezone,
    source,
    source_reference,
    notes,
    metadata,
    created_by
  ) values (
    v_booking.shipment_id,
    v_booking.id,
    p_booking_container_id,
    p_booking_schedule_revision_id,
    v_old.id,
    p_cutoff_code,
    coalesce(
      nullif(btrim(coalesce(p_cutoff_label, '')), ''),
      p_cutoff_code
    ),
    p_due_at,
    p_timezone,
    p_source,
    nullif(btrim(coalesce(p_source_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_metadata || jsonb_build_object(
      'change_reason',
      nullif(btrim(coalesce(p_reason, '')), '')
    ),
    v_user_id
  )
  returning * into v_new;

  if v_old.id is not null then
    update public.booking_cutoffs
    set superseded_by_cutoff_id = v_new.id,
        updated_at = clock_timestamp()
    where id = v_old.id;
  end if;

  perform public.log_booking_readiness_action(
    v_booking.id,
    case when v_old.id is null then 'CUTOFF_CREATED' else 'CUTOFF_CHANGED' end,
    case when v_old.id is null
      then 'Cut-off creado'
      else 'Cut-off actualizado'
    end,
    v_new.id,
    case when v_old.id is null then 'cutoff_created' else 'cutoff_changed' end,
    format(
      'Cut-off %s: %s',
      v_new.cutoff_label,
      v_new.due_at
    ),
    jsonb_build_object(
      'cutoff_id', v_new.id,
      'cutoff_code', v_new.cutoff_code,
      'booking_container_id', v_new.booking_container_id,
      'due_at', v_new.due_at,
      'timezone', v_new.timezone,
      'before', case when v_old.id is null then null else to_jsonb(v_old) end,
      'after', to_jsonb(v_new)
    )
  );

  return jsonb_build_object(
    'created', true,
    'cutoff', to_jsonb(v_new),
    'superseded_cutoff_id', v_old.id
  );
end;
$$;

create or replace function public.complete_booking_cutoff(
  p_cutoff_id uuid,
  p_expected_updated_at timestamptz,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.booking_cutoffs%rowtype;
  v_new public.booking_cutoffs%rowtype;
begin
  if auth.uid() is null or not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'No autorizado para completar cut-offs'
      using errcode = '42501';
  end if;

  select c.* into v_old
  from public.booking_cutoffs c
  where c.id = p_cutoff_id
  for update;

  if not found then
    raise exception 'Cut-off no encontrado' using errcode = 'P0002';
  end if;
  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'CUTOFF_VERSION_CONFLICT'
      using errcode = '40001';
  end if;
  if v_old.status not in ('PENDING', 'MISSED') then
    raise exception 'El cut-off no esta pendiente'
      using errcode = '55000';
  end if;

  perform set_config('app.booking_readiness_write_mode', 'cutoff_complete', true);
  update public.booking_cutoffs
  set status = 'COMPLETED',
      completed_at = clock_timestamp(),
      completed_by = auth.uid(),
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  perform public.log_booking_readiness_action(
    v_new.booking_id,
    'CUTOFF_COMPLETED',
    'Cut-off completado',
    v_new.id,
    'cutoff_completed',
    format('Cut-off %s completado', v_new.cutoff_label),
    jsonb_build_object(
      'cutoff_id', v_new.id,
      'cutoff_code', v_new.cutoff_code,
      'due_at', v_new.due_at,
      'timezone', v_new.timezone,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new)
    )
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function public.waive_booking_cutoff(
  p_cutoff_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.booking_cutoffs%rowtype;
  v_new public.booking_cutoffs%rowtype;
  v_exception public.booking_readiness_exceptions%rowtype;
begin
  if auth.uid() is null or not public.is_role(array['Admin']) then
    raise exception 'Solo Admin puede autorizar excepciones de cut-off'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de la excepcion es obligatorio'
      using errcode = '22023';
  end if;

  select c.* into v_old
  from public.booking_cutoffs c
  where c.id = p_cutoff_id
  for update;

  if not found then
    raise exception 'Cut-off no encontrado' using errcode = 'P0002';
  end if;
  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'CUTOFF_VERSION_CONFLICT'
      using errcode = '40001';
  end if;
  if v_old.status not in ('PENDING', 'MISSED') then
    raise exception 'Solo un cut-off pendiente o vencido admite excepcion'
      using errcode = '55000';
  end if;
  if v_old.cutoff_code in ('VGM')
     and exists (
       select 1
       from public.container_vgm_records vgm
       where vgm.booking_container_id = v_old.booking_container_id
         and vgm.gross_mass <= 0
     ) then
    raise exception 'Una masa VGM invalida nunca admite excepcion'
      using errcode = '23514';
  end if;

  perform set_config('app.booking_readiness_write_mode', 'cutoff_waive', true);
  update public.booking_cutoffs
  set status = 'WAIVED',
      waived_at = clock_timestamp(),
      waived_by = auth.uid(),
      waiver_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  insert into public.booking_readiness_exceptions (
    shipment_id,
    booking_id,
    booking_container_id,
    booking_cutoff_id,
    requirement_code,
    reason,
    approved_by,
    expires_at,
    metadata
  ) values (
    v_new.shipment_id,
    v_new.booking_id,
    v_new.booking_container_id,
    v_new.id,
    'CUTOFF_' || v_new.cutoff_code,
    btrim(p_reason),
    auth.uid(),
    p_expires_at,
    jsonb_build_object('cutoff_due_at', v_new.due_at)
  )
  returning * into v_exception;

  perform public.log_booking_readiness_action(
    v_new.booking_id,
    'CUTOFF_WAIVED',
    'Excepcion de cut-off autorizada',
    v_new.id,
    'cutoff_waived',
    format('Excepcion autorizada para %s', v_new.cutoff_label),
    jsonb_build_object(
      'cutoff_id', v_new.id,
      'cutoff_code', v_new.cutoff_code,
      'exception_id', v_exception.id,
      'reason', btrim(p_reason),
      'expires_at', p_expires_at
    )
  );

  return jsonb_build_object(
    'cutoff', to_jsonb(v_new),
    'exception', to_jsonb(v_exception)
  );
end;
$$;

create or replace function public.cancel_booking_cutoff(
  p_cutoff_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.booking_cutoffs%rowtype;
  v_new public.booking_cutoffs%rowtype;
begin
  if auth.uid() is null or not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'No autorizado para cancelar cut-offs'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de cancelacion es obligatorio'
      using errcode = '22023';
  end if;

  select c.* into v_old
  from public.booking_cutoffs c
  where c.id = p_cutoff_id
  for update;

  if not found then
    raise exception 'Cut-off no encontrado' using errcode = 'P0002';
  end if;
  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'CUTOFF_VERSION_CONFLICT'
      using errcode = '40001';
  end if;
  if v_old.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'El cut-off completado o cancelado es historico'
      using errcode = '55000';
  end if;

  perform set_config('app.booking_readiness_write_mode', 'cutoff_cancel', true);
  update public.booking_cutoffs
  set status = 'CANCELLED',
      cancelled_at = clock_timestamp(),
      cancelled_by = auth.uid(),
      cancellation_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  perform public.log_booking_readiness_action(
    v_new.booking_id,
    'CUTOFF_CHANGED',
    'Cut-off cancelado',
    v_new.id,
    'cutoff_cancelled',
    format('Cut-off %s cancelado', v_new.cutoff_label),
    jsonb_build_object(
      'cutoff_id', v_new.id,
      'cutoff_code', v_new.cutoff_code,
      'reason', btrim(p_reason)
    )
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function public.save_container_vgm_draft(
  p_booking_id uuid,
  p_booking_container_id uuid,
  p_gross_mass numeric,
  p_unit text,
  p_verification_method text,
  p_weighed_at timestamptz default null,
  p_verified_by_name text default null,
  p_document_id uuid default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_container public.booking_containers%rowtype;
  v_old public.container_vgm_records%rowtype;
  v_new public.container_vgm_records%rowtype;
  v_version integer;
begin
  if auth.uid() is null or not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'No autorizado para registrar VGM'
      using errcode = '42501';
  end if;
  if p_gross_mass is null or p_gross_mass <= 0 then
    raise exception 'La masa VGM debe ser positiva'
      using errcode = '22023';
  end if;
  if upper(coalesce(p_unit, '')) not in ('KG', 'LB') then
    raise exception 'Unidad VGM permitida: KG o LB'
      using errcode = '22023';
  end if;
  if p_verification_method not in (
    'METHOD_1',
    'METHOD_2',
    'CARRIER_PROVIDED',
    'OTHER'
  ) then
    raise exception 'Metodo VGM invalido'
      using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking no encontrado' using errcode = 'P0002';
  end if;
  if v_booking.booking_lifecycle_status <> 'ACTIVE'
     or v_booking.shipment_status in (
       'Embarcado', 'En Transito', 'En Tránsito', 'Arribado', 'Finalizado'
     ) then
    raise exception 'El booking no admite nuevas VGM'
      using errcode = '55000';
  end if;
  if public.booking_operational_mode(v_booking.id) <> 'SEA_FCL' then
    raise exception 'La VGM por contenedor solo aplica a FCL maritimo'
      using errcode = '23514';
  end if;

  select bc.* into v_container
  from public.booking_containers bc
  where bc.id = p_booking_container_id
    and bc.booking_id = v_booking.id
  for update;

  if not found then
    raise exception 'El contenedor no pertenece al booking'
      using errcode = '23514';
  end if;
  if coalesce(v_container.quantity, 0) <> 1 then
    raise exception 'La VGM requiere una fila por contenedor fisico'
      using errcode = '23514';
  end if;

  select vgm.* into v_old
  from public.container_vgm_records vgm
  where vgm.booking_container_id = v_container.id
    and vgm.status in ('DRAFT', 'VERIFIED', 'SUBMITTED', 'ACCEPTED')
  for update;

  if found and v_old.status = 'ACCEPTED' then
    raise exception 'La VGM aceptada debe corregirse mediante supersede'
      using errcode = '55000';
  end if;

  select coalesce(max(vgm.version_number), 0) + 1
  into v_version
  from public.container_vgm_records vgm
  where vgm.booking_container_id = v_container.id;

  if v_old.id is not null then
    perform set_config('app.booking_readiness_write_mode', 'vgm_version', true);
    update public.container_vgm_records
    set status = 'SUPERSEDED',
        updated_at = clock_timestamp(),
        metadata = metadata || jsonb_build_object(
          'superseded_reason',
          'NEW_DRAFT_VERSION'
        )
    where id = v_old.id;
  end if;

  insert into public.container_vgm_records (
    shipment_id,
    booking_id,
    booking_container_id,
    version_number,
    supersedes_vgm_id,
    gross_mass,
    unit,
    verification_method,
    weighed_at,
    verified_by_name,
    document_id,
    notes,
    metadata,
    created_by
  ) values (
    v_booking.shipment_id,
    v_booking.id,
    v_container.id,
    v_version,
    v_old.id,
    p_gross_mass,
    upper(p_unit),
    p_verification_method,
    p_weighed_at,
    nullif(btrim(coalesce(p_verified_by_name, '')), ''),
    p_document_id,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_metadata || jsonb_build_object(
      'mass_kg',
      case when upper(p_unit) = 'LB'
        then round(p_gross_mass * 0.45359237, 3)
        else p_gross_mass
      end,
      'reasonable_mass_warning',
      case when upper(p_unit) = 'LB'
        then p_gross_mass * 0.45359237 > 80000
        else p_gross_mass > 80000
      end
    ),
    auth.uid()
  )
  returning * into v_new;

  perform public.log_booking_readiness_action(
    v_booking.id,
    case when v_old.id is null then 'VGM_RECORDED' else 'VGM_CORRECTED' end,
    case when v_old.id is null then 'VGM registrada' else 'VGM corregida' end,
    v_new.id,
    case when v_old.id is null then 'vgm_recorded' else 'vgm_corrected' end,
    format('VGM registrada para contenedor %s', v_container.id),
    jsonb_build_object(
      'vgm_id', v_new.id,
      'booking_container_id', v_container.id,
      'version_number', v_new.version_number,
      'gross_mass', v_new.gross_mass,
      'unit', v_new.unit,
      'before', case when v_old.id is null then null else to_jsonb(v_old) end,
      'after', to_jsonb(v_new)
    )
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function public.transition_container_vgm(
  p_vgm_id uuid,
  p_expected_updated_at timestamptz,
  p_target_status text,
  p_reference_or_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.container_vgm_records%rowtype;
  v_new public.container_vgm_records%rowtype;
  v_event_code text;
  v_event_label text;
begin
  if auth.uid() is null or not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'No autorizado para cambiar VGM'
      using errcode = '42501';
  end if;

  select vgm.* into v_old
  from public.container_vgm_records vgm
  join public.bookings b on b.id = vgm.booking_id
  where vgm.id = p_vgm_id
    and b.booking_lifecycle_status = 'ACTIVE'
  for update of vgm;

  if not found then
    raise exception 'VGM activa no encontrada' using errcode = 'P0002';
  end if;
  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'VGM_VERSION_CONFLICT' using errcode = '40001';
  end if;

  if not (
    (v_old.status = 'DRAFT' and p_target_status = 'VERIFIED')
    or (v_old.status = 'VERIFIED' and p_target_status = 'SUBMITTED')
    or (v_old.status = 'SUBMITTED' and p_target_status in ('ACCEPTED', 'REJECTED'))
    or (v_old.status in ('DRAFT', 'VERIFIED', 'SUBMITTED', 'ACCEPTED', 'REJECTED')
      and p_target_status = 'SUPERSEDED')
  ) then
    raise exception 'Transicion VGM no permitida: % -> %',
      v_old.status, p_target_status
      using errcode = '22023';
  end if;

  if p_target_status = 'VERIFIED'
     and nullif(btrim(coalesce(v_old.verified_by_name, '')), '') is null
     and auth.uid() is null then
    raise exception 'Falta la persona verificadora'
      using errcode = '23514';
  end if;
  if p_target_status = 'SUBMITTED'
     and (
       v_old.weighed_at is null
       or v_old.verification_method is null
     ) then
    raise exception 'Faltan datos obligatorios para enviar VGM'
      using errcode = '23514';
  end if;
  if p_target_status = 'REJECTED'
     and nullif(btrim(coalesce(p_reference_or_reason, '')), '') is null then
    raise exception 'El motivo de rechazo es obligatorio'
      using errcode = '22023';
  end if;
  if p_target_status = 'SUPERSEDED'
     and nullif(btrim(coalesce(p_reference_or_reason, '')), '') is null then
    raise exception 'El motivo de correccion es obligatorio'
      using errcode = '22023';
  end if;

  perform set_config('app.booking_readiness_write_mode', 'vgm_transition', true);
  update public.container_vgm_records
  set status = p_target_status,
      verified_at = case
        when p_target_status = 'VERIFIED' then clock_timestamp()
        else verified_at
      end,
      verified_by_user_id = case
        when p_target_status = 'VERIFIED' then auth.uid()
        else verified_by_user_id
      end,
      submitted_at = case
        when p_target_status = 'SUBMITTED' then clock_timestamp()
        else submitted_at
      end,
      submitted_by = case
        when p_target_status = 'SUBMITTED' then auth.uid()
        else submitted_by
      end,
      submission_reference = case
        when p_target_status = 'SUBMITTED'
          then nullif(btrim(coalesce(p_reference_or_reason, '')), '')
        else submission_reference
      end,
      accepted_at = case
        when p_target_status = 'ACCEPTED' then clock_timestamp()
        else accepted_at
      end,
      accepted_by = case
        when p_target_status = 'ACCEPTED' then auth.uid()
        else accepted_by
      end,
      rejected_at = case
        when p_target_status = 'REJECTED' then clock_timestamp()
        else rejected_at
      end,
      rejected_by = case
        when p_target_status = 'REJECTED' then auth.uid()
        else rejected_by
      end,
      rejection_reason = case
        when p_target_status = 'REJECTED'
          then btrim(p_reference_or_reason)
        else rejection_reason
      end,
      metadata = case
        when p_target_status = 'SUPERSEDED'
          then metadata || jsonb_build_object(
            'superseded_reason',
            btrim(p_reference_or_reason)
          )
        else metadata
      end,
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  v_event_code := case p_target_status
    when 'VERIFIED' then 'VGM_VERIFIED'
    when 'SUBMITTED' then 'VGM_SUBMITTED'
    when 'ACCEPTED' then 'VGM_ACCEPTED'
    when 'REJECTED' then 'VGM_REJECTED'
    else 'VGM_CORRECTED'
  end;
  v_event_label := case p_target_status
    when 'VERIFIED' then 'VGM verificada'
    when 'SUBMITTED' then 'VGM enviada'
    when 'ACCEPTED' then 'VGM aceptada'
    when 'REJECTED' then 'VGM rechazada'
    else 'VGM sustituida'
  end;

  perform public.log_booking_readiness_action(
    v_new.booking_id,
    v_event_code,
    v_event_label,
    v_new.id,
    lower(v_event_code),
    format(
      '%s para contenedor %s',
      v_event_label,
      v_new.booking_container_id
    ),
    jsonb_build_object(
      'vgm_id', v_new.id,
      'booking_container_id', v_new.booking_container_id,
      'gross_mass', v_new.gross_mass,
      'unit', v_new.unit,
      'status', v_new.status,
      'reference_or_reason', p_reference_or_reason,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new)
    )
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function public.verify_container_vgm(
  p_vgm_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.transition_container_vgm(
    p_vgm_id,
    p_expected_updated_at,
    'VERIFIED',
    null
  )
$$;

create or replace function public.submit_container_vgm(
  p_vgm_id uuid,
  p_expected_updated_at timestamptz,
  p_submission_reference text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.transition_container_vgm(
    p_vgm_id,
    p_expected_updated_at,
    'SUBMITTED',
    p_submission_reference
  )
$$;

create or replace function public.accept_container_vgm(
  p_vgm_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.transition_container_vgm(
    p_vgm_id,
    p_expected_updated_at,
    'ACCEPTED',
    null
  )
$$;

create or replace function public.reject_container_vgm(
  p_vgm_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.transition_container_vgm(
    p_vgm_id,
    p_expected_updated_at,
    'REJECTED',
    p_reason
  )
$$;

create or replace function public.supersede_container_vgm(
  p_vgm_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.transition_container_vgm(
    p_vgm_id,
    p_expected_updated_at,
    'SUPERSEDED',
    p_reason
  )
$$;

create or replace function public.complete_booking_readiness_requirement(
  p_requirement_id uuid,
  p_expected_updated_at timestamptz,
  p_source_entity_type text default null,
  p_source_entity_id uuid default null,
  p_validation_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.booking_readiness_requirements%rowtype;
  v_new public.booking_readiness_requirements%rowtype;
begin
  if auth.uid() is null or not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'No autorizado para completar requisitos'
      using errcode = '42501';
  end if;
  if p_validation_details is null
     or jsonb_typeof(p_validation_details) <> 'object' then
    raise exception 'validation_details debe ser JSON'
      using errcode = '22023';
  end if;

  select r.* into v_old
  from public.booking_readiness_requirements r
  join public.bookings b on b.id = r.booking_id
  where r.id = p_requirement_id
    and b.booking_lifecycle_status = 'ACTIVE'
  for update of r;

  if not found then
    raise exception 'Requisito activo no encontrado'
      using errcode = 'P0002';
  end if;
  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'READINESS_VERSION_CONFLICT'
      using errcode = '40001';
  end if;

  perform set_config(
    'app.booking_readiness_write_mode',
    'requirement_complete',
    true
  );
  update public.booking_readiness_requirements
  set status = 'COMPLETED',
      completed_at = clock_timestamp(),
      completed_by = auth.uid(),
      source_entity_type =
        nullif(btrim(coalesce(p_source_entity_type, '')), ''),
      source_entity_id = p_source_entity_id,
      validation_details = validation_details || p_validation_details,
      updated_at = clock_timestamp()
  where id = v_old.id
  returning * into v_new;

  perform public.log_booking_readiness_action(
    v_new.booking_id,
    'READINESS_REQUIREMENT_COMPLETED',
    'Requisito de readiness completado',
    v_new.id,
    'readiness_requirement_completed',
    format('Requisito completado: %s', v_new.requirement_label),
    jsonb_build_object(
      'requirement_id', v_new.id,
      'requirement_code', v_new.requirement_code,
      'before', to_jsonb(v_old),
      'after', to_jsonb(v_new)
    )
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function public.authorize_booking_readiness_exception(
  p_requirement_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.booking_readiness_requirements%rowtype;
  v_exception public.booking_readiness_exceptions%rowtype;
begin
  if auth.uid() is null or not public.is_role(array['Admin']) then
    raise exception 'Solo Admin puede autorizar excepciones de readiness'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de la excepcion es obligatorio'
      using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  select r.* into v_requirement
  from public.booking_readiness_requirements r
  join public.bookings b on b.id = r.booking_id
  where r.id = p_requirement_id
    and b.booking_lifecycle_status = 'ACTIVE'
  for update of r;

  if not found then
    raise exception 'Requisito activo no encontrado'
      using errcode = 'P0002';
  end if;
  if v_requirement.updated_at is distinct from p_expected_updated_at then
    raise exception 'READINESS_VERSION_CONFLICT'
      using errcode = '40001';
  end if;
  if v_requirement.requirement_code not in (
    'SHIPPING_INSTRUCTIONS_SENT',
    'DOCUMENTATION_COMPLETE',
    'CUSTOMS_FILING',
    'GATE_IN_COMPLETE',
    'CARGO_RECEIVED',
    'BL_INSTRUCTIONS',
    'NO_BLOCKING_INCIDENTS'
  ) then
    raise exception 'Este requisito no admite excepcion operativa'
      using errcode = '23514';
  end if;

  insert into public.booking_readiness_exceptions (
    shipment_id,
    booking_id,
    booking_container_id,
    booking_readiness_requirement_id,
    requirement_code,
    reason,
    approved_by,
    expires_at,
    metadata
  ) values (
    v_requirement.shipment_id,
    v_requirement.booking_id,
    v_requirement.booking_container_id,
    v_requirement.id,
    v_requirement.requirement_code,
    btrim(p_reason),
    auth.uid(),
    p_expires_at,
    p_metadata
  )
  returning * into v_exception;

  perform set_config(
    'app.booking_readiness_write_mode',
    'requirement_waive',
    true
  );
  update public.booking_readiness_requirements
  set status = 'WAIVED',
      waived_at = clock_timestamp(),
      waived_by = auth.uid(),
      waiver_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  where id = v_requirement.id;

  perform public.log_booking_readiness_action(
    v_requirement.booking_id,
    'READINESS_EXCEPTION_AUTHORIZED',
    'Excepcion de readiness autorizada',
    v_exception.id,
    'readiness_exception_authorized',
    format(
      'Excepcion autorizada para %s',
      v_requirement.requirement_label
    ),
    jsonb_build_object(
      'exception_id', v_exception.id,
      'requirement_id', v_requirement.id,
      'requirement_code', v_requirement.requirement_code,
      'reason', btrim(p_reason),
      'expires_at', p_expires_at
    )
  );

  return to_jsonb(v_exception);
end;
$$;

create or replace function public.revoke_booking_readiness_exception(
  p_exception_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.booking_readiness_exceptions%rowtype;
  v_new public.booking_readiness_exceptions%rowtype;
begin
  if auth.uid() is null or not public.is_role(array['Admin']) then
    raise exception 'Solo Admin puede revocar excepciones'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de revocacion es obligatorio'
      using errcode = '22023';
  end if;

  select exception.* into v_old
  from public.booking_readiness_exceptions exception
  where exception.id = p_exception_id
    and exception.status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Excepcion activa no encontrada'
      using errcode = 'P0002';
  end if;

  perform set_config(
    'app.booking_readiness_write_mode',
    'exception_revoke',
    true
  );
  update public.booking_readiness_exceptions
  set status = 'REVOKED',
      revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revocation_reason = btrim(p_reason)
  where id = v_old.id
  returning * into v_new;

  if v_old.booking_readiness_requirement_id is not null then
    update public.booking_readiness_requirements
    set status = 'PENDING',
        waived_at = null,
        waived_by = null,
        waiver_reason = null,
        updated_at = clock_timestamp()
    where id = v_old.booking_readiness_requirement_id
      and status = 'WAIVED';
  end if;

  perform public.log_booking_readiness_action(
    v_new.booking_id,
    'READINESS_EXCEPTION_REVOKED',
    'Excepcion de readiness revocada',
    v_new.id,
    'readiness_exception_revoked',
    'Excepcion de readiness revocada',
    jsonb_build_object(
      'exception_id', v_new.id,
      'reason', btrim(p_reason)
    )
  );

  return to_jsonb(v_new);
end;
$$;

-- Readiness obligatorio para Listo para Embarque y Embarcado.
alter function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) rename to transition_booking_status_v5b;

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
  v_readiness jsonb;
  v_result jsonb;
begin
  if p_target_status in ('Listo para Embarque', 'Embarcado') then
    v_readiness := public.evaluate_booking_readiness(p_booking_id);
    if not coalesce((v_readiness ->> 'ready')::boolean, false) then
      perform public.log_booking_readiness_action(
        p_booking_id,
        'READINESS_BLOCKED',
        'Booking bloqueado por readiness',
        null,
        'readiness_transition_blocked',
        format('Booking bloqueado antes de %s', p_target_status),
        jsonb_build_object(
          'target_status', p_target_status,
          'blocking_count', v_readiness -> 'blocking_count',
          'missing_requirements',
            coalesce(v_readiness -> 'requirements', '[]'::jsonb),
          'overdue_cutoffs',
            coalesce(v_readiness -> 'overdue_cutoffs', '[]'::jsonb),
          'missing_vgm_containers',
            coalesce(v_readiness -> 'missing_vgm_containers', '[]'::jsonb)
        )
      );

      return jsonb_build_object(
        'transitioned', false,
        'error', jsonb_build_object(
          'code', 'BOOKING_NOT_READY',
          'missing_requirements',
            coalesce(v_readiness -> 'requirements', '[]'::jsonb),
          'overdue_cutoffs',
            coalesce(v_readiness -> 'overdue_cutoffs', '[]'::jsonb),
          'missing_vgm_containers',
            coalesce(v_readiness -> 'missing_vgm_containers', '[]'::jsonb)
        ),
        'readiness', v_readiness
      );
    end if;
  end if;

  v_result := public.transition_booking_status_v5b(
    p_booking_id,
    p_expected_updated_at,
    p_target_status,
    p_occurred_at,
    p_location,
    p_notes,
    p_metadata
  );

  if p_target_status in ('Listo para Embarque', 'Embarcado') then
    insert into public.booking_readiness_evaluations (
      shipment_id,
      booking_id,
      trigger_status,
      result,
      evaluated_by
    )
    select b.shipment_id,
           b.id,
           p_target_status,
           v_readiness,
           auth.uid()
    from public.bookings b
    where b.id = p_booking_id;
  end if;

  return v_result || jsonb_build_object(
    'transitioned',
    true,
    'readiness',
    v_readiness
  );
end;
$$;

-- Rollover conserva VGM del mismo contenedor, versiona cut-offs provistos e
-- invalida el snapshot de requisitos afectados.
alter function public.rollover_booking_schedule(
  uuid, timestamptz, text, text, text, date, date, text, text, timestamptz,
  timestamptz
) rename to rollover_booking_schedule_v5b;

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
  p_client_notified_at timestamptz default null,
  p_cutoffs jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_revision_id uuid;
  v_cutoff jsonb;
begin
  if p_cutoffs is not null
     and jsonb_typeof(p_cutoffs) <> 'array' then
    raise exception 'cutoffs debe ser un arreglo JSON'
      using errcode = '22023';
  end if;

  v_result := public.rollover_booking_schedule_v5b(
    p_booking_id,
    p_expected_updated_at,
    p_reason,
    p_vessel_name,
    p_voyage,
    p_etd,
    p_eta,
    p_routing_summary,
    p_target_status,
    p_effective_at,
    p_client_notified_at
  );

  v_revision_id := (v_result #>> '{revision,id}')::uuid;

  perform set_config(
    'app.booking_readiness_write_mode',
    'rollover_invalidate',
    true
  );
  update public.booking_readiness_requirements
  set status = case
        when is_required then 'PENDING'
        else 'NOT_APPLICABLE'
      end,
      completed_at = null,
      completed_by = null,
      validation_details = validation_details || jsonb_build_object(
        'invalidated_by_revision_id', v_revision_id,
        'invalidated_reason', btrim(p_reason),
        'vgm_preserved_for_same_container', true
      ),
      updated_at = clock_timestamp()
  where booking_id = p_booking_id
    and requirement_code in (
      'VESSEL_AND_VOYAGE',
      'ETD_AND_ETA',
      'GATE_IN_COMPLETE'
    );

  if p_cutoffs is not null then
    for v_cutoff in
      select value
      from jsonb_array_elements(p_cutoffs)
    loop
      perform public.create_or_replace_booking_cutoff(
        p_booking_id,
        nullif(v_cutoff ->> 'booking_container_id', '')::uuid,
        v_cutoff ->> 'cutoff_code',
        v_cutoff ->> 'cutoff_label',
        (v_cutoff ->> 'due_at')::timestamptz,
        v_cutoff ->> 'timezone',
        'SCHEDULE_REVISION',
        v_cutoff ->> 'source_reference',
        v_revision_id,
        p_reason,
        v_cutoff ->> 'notes',
        coalesce(v_cutoff -> 'metadata', '{}'::jsonb),
        false
      );
    end loop;
  end if;

  return v_result || jsonb_build_object(
    'readiness_invalidated', true,
    'cutoffs_received', coalesce(jsonb_array_length(p_cutoffs), 0),
    'vgm_rule', 'PRESERVED_ONLY_FOR_SAME_BOOKING_CONTAINER'
  );
end;
$$;

-- El reemplazo no hereda readiness, cut-offs ni VGM. Si un contenedor ya
-- tiene evidencia 5C, las estrategias automaticas de movimiento se bloquean.
alter function public.replace_booking(
  uuid, timestamptz, text, text, text, text, text, date, date, text, text, text,
  boolean
) rename to replace_booking_v5b;

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
  v_result jsonb;
  v_new_booking_id uuid;
begin
  if p_container_treatment in (
    'MOVE_UNASSIGNED',
    'MOVE_ALL_IF_NOT_PHYSICALLY_USED'
  ) and exists (
    select 1
    from public.booking_containers bc
    where bc.booking_id = p_old_booking_id
      and (
        exists (
          select 1
          from public.container_vgm_records vgm
          where vgm.booking_container_id = bc.id
        )
        or exists (
          select 1
          from public.booking_cutoffs cutoff
          where cutoff.booking_container_id = bc.id
        )
      )
  ) then
    raise exception 'No se mueven contenedores con VGM o cut-offs 5C; usa tratamiento manual'
      using errcode = '23514';
  end if;

  v_result := public.replace_booking_v5b(
    p_old_booking_id,
    p_expected_updated_at,
    p_new_carrier,
    p_new_booking_number,
    p_new_carrier_booking,
    p_new_vessel_name,
    p_new_voyage,
    p_new_etd,
    p_new_eta,
    p_reason,
    p_container_treatment,
    p_new_routing_summary,
    p_allow_issued_bl_exception
  );

  v_new_booking_id := (v_result #>> '{new_booking,id}')::uuid;
  if v_new_booking_id is null then
    v_new_booking_id := (v_result #>> '{booking,id}')::uuid;
  end if;

  perform public.seed_booking_readiness_requirements(v_new_booking_id, false);

  return v_result || jsonb_build_object(
    'readiness_inherited', false,
    'cutoffs_inherited', false,
    'vgm_inherited', false
  );
end;
$$;

-- Impide falsificar eventos 5C desde el registrador generico.
alter function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) rename to record_operational_event_v5b;

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
    'CUTOFF_CREATED',
    'CUTOFF_CHANGED',
    'CUTOFF_COMPLETED',
    'CUTOFF_MISSED',
    'CUTOFF_WAIVED',
    'VGM_RECORDED',
    'VGM_VERIFIED',
    'VGM_SUBMITTED',
    'VGM_ACCEPTED',
    'VGM_REJECTED',
    'VGM_CORRECTED',
    'READINESS_REQUIREMENT_COMPLETED',
    'READINESS_EXCEPTION_AUTHORIZED',
    'READINESS_EXCEPTION_REVOKED',
    'READINESS_BLOCKED'
  ) then
    raise exception 'Este evento solo puede originarse en un RPC 5C'
      using errcode = '42501';
  end if;

  return query
  select *
  from public.record_operational_event_v5b(
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

create or replace function public.get_booking_readiness_overview(
  p_shipment_id uuid default null
)
returns table (
  booking_id uuid,
  shipment_id uuid,
  booking_number text,
  mode text,
  ready boolean,
  blocking_count integer,
  warning_count integer,
  next_cutoff timestamptz,
  overdue_cutoff_count integer,
  missing_vgm_count integer,
  active_exception boolean,
  evaluated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_result jsonb;
begin
  for v_booking in
    select b.*
    from public.bookings b
    where b.booking_lifecycle_status = 'ACTIVE'
      and (p_shipment_id is null or b.shipment_id = p_shipment_id)
      and public.can_select_booking(b.id)
    order by b.created_at, b.id
  loop
    v_result := public.evaluate_booking_readiness(v_booking.id);
    booking_id := v_booking.id;
    shipment_id := v_booking.shipment_id;
    booking_number := coalesce(
      v_booking.booking_number,
      v_booking.carrier_booking
    );
    mode := v_result ->> 'mode';
    ready := (v_result ->> 'ready')::boolean;
    blocking_count := (v_result ->> 'blocking_count')::integer;
    warning_count := (v_result ->> 'warning_count')::integer;
    select min(c.due_at)
    into next_cutoff
    from public.booking_cutoffs c
    where c.booking_id = v_booking.id
      and c.superseded_by_cutoff_id is null
      and c.status = 'PENDING'
      and c.due_at > clock_timestamp();
    overdue_cutoff_count :=
      jsonb_array_length(v_result -> 'overdue_cutoffs');
    missing_vgm_count :=
      jsonb_array_length(v_result -> 'missing_vgm_containers');
    active_exception :=
      jsonb_array_length(v_result -> 'authorized_exceptions') > 0;
    evaluated_at := clock_timestamp();
    return next;
  end loop;
end;
$$;

create or replace function public.get_booking_readiness_alerts()
returns table (
  alert_key text,
  severity text,
  alert_code text,
  shipment_id uuid,
  booking_id uuid,
  booking_container_id uuid,
  cutoff_id uuid,
  title text,
  description text,
  due_at timestamptz
)
language sql
volatile
security definer
set search_path = public
as $$
  with active_bookings as (
    select b.*
    from public.bookings b
    where b.booking_lifecycle_status = 'ACTIVE'
      and public.can_select_booking(b.id)
  ),
  cutoff_alerts as (
    select
      concat('cutoff:', c.id) as alert_key,
      case
        when c.due_at <= clock_timestamp() then 'CRITICAL'
        when c.due_at <= clock_timestamp() + interval '24 hours' then 'CRITICAL'
        else 'WARNING'
      end as severity,
      case
        when c.due_at <= clock_timestamp() then 'CUTOFF_OVERDUE'
        when c.due_at <= clock_timestamp() + interval '24 hours'
          then 'CUTOFF_UNDER_24H'
        else 'CUTOFF_UNDER_72H'
      end as alert_code,
      c.shipment_id,
      c.booking_id,
      c.booking_container_id,
      c.id as cutoff_id,
      c.cutoff_label as title,
      format(
        '%s - %s (%s)',
        c.cutoff_code,
        c.due_at,
        c.timezone
      ) as description,
      c.due_at
    from public.booking_cutoffs c
    join active_bookings b on b.id = c.booking_id
    where c.superseded_by_cutoff_id is null
      and c.status in ('PENDING', 'MISSED')
      and c.due_at <= clock_timestamp() + interval '72 hours'
  ),
  vgm_alerts as (
    select
      concat('vgm:', bc.id) as alert_key,
      case
        when exists (
          select 1
          from public.container_vgm_records rejected
          where rejected.booking_container_id = bc.id
            and rejected.status = 'REJECTED'
        ) then 'CRITICAL'
        else 'WARNING'
      end as severity,
      case
        when exists (
          select 1
          from public.container_vgm_records rejected
          where rejected.booking_container_id = bc.id
            and rejected.status = 'REJECTED'
        ) then 'VGM_REJECTED'
        else 'CONTAINER_WITHOUT_VGM'
      end as alert_code,
      b.shipment_id,
      b.id,
      bc.id,
      null::uuid,
      'VGM pendiente'::text,
      format(
        'Contenedor %s sin VGM enviada',
        coalesce(nullif(btrim(bc.notes), ''), bc.id::text)
      ),
      null::timestamptz
    from active_bookings b
    join public.booking_containers bc on bc.booking_id = b.id
    where public.booking_operational_mode(b.id) = 'SEA_FCL'
      and not exists (
        select 1
        from public.container_vgm_records active_vgm
        where active_vgm.booking_container_id = bc.id
          and active_vgm.status in ('SUBMITTED', 'ACCEPTED')
      )
  ),
  readiness_alerts as (
    select
      concat('readiness:', overview.booking_id) as alert_key,
      case
        when b.etd <= current_date + 1 then 'CRITICAL'
        else 'WARNING'
      end as severity,
      'BOOKING_NEAR_ETD_NOT_READY'::text,
      overview.shipment_id,
      overview.booking_id,
      null::uuid,
      null::uuid,
      'Booking proximo a ETD sin readiness'::text,
      format('%s bloqueo(s) pendientes', overview.blocking_count),
      b.etd::timestamp at time zone 'America/Tegucigalpa'
    from public.get_booking_readiness_overview(null) overview
    join active_bookings b on b.id = overview.booking_id
    where not overview.ready
      and b.etd is not null
      and b.etd <= current_date + 3
  ),
  exception_alerts as (
    select
      concat('exception:', exception.id) as alert_key,
      'WARNING'::text,
      'EXCEPTION_EXPIRING'::text,
      exception.shipment_id,
      exception.booking_id,
      exception.booking_container_id,
      exception.booking_cutoff_id,
      'Excepcion proxima a vencer'::text,
      exception.requirement_code,
      exception.expires_at
    from public.booking_readiness_exceptions exception
    join active_bookings b on b.id = exception.booking_id
    where exception.status = 'ACTIVE'
      and exception.expires_at > clock_timestamp()
      and exception.expires_at <= clock_timestamp() + interval '24 hours'
  )
  select * from cutoff_alerts
  union all
  select * from vgm_alerts
  union all
  select * from readiness_alerts
  union all
  select * from exception_alerts
$$;

create or replace function public.get_client_booking_readiness_v1(
  p_shipment_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_cliente() then
    raise exception 'Acceso disponible unicamente para clientes'
      using errcode = '42501';
  end if;
  v_client_id := public.current_user_cliente_id();

  if not exists (
    select 1
    from public.shipments s
    where s.id = p_shipment_id
      and s.client_id = v_client_id
  ) then
    raise exception 'Shipment no disponible'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'shipment_id', p_shipment_id,
    'bookings', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'booking_number', coalesce(b.booking_number, b.carrier_booking),
          'status', b.shipment_status,
          'ready',
            (public.evaluate_booking_readiness(b.id) ->> 'ready')::boolean,
          'blocking_count',
            (public.evaluate_booking_readiness(b.id) ->> 'blocking_count')::integer,
          'document_requests', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'code', requirement.requirement_code,
                'label', requirement.requirement_label,
                'status', requirement.status,
                'due_at', requirement.due_at
              )
            )
            from public.booking_readiness_requirements requirement
            where requirement.booking_id = b.id
              and requirement.requirement_code in (
                'SHIPPING_INSTRUCTIONS_SENT',
                'DOCUMENTATION_COMPLETE',
                'BOOKING_CONFIRMATION'
              )
          ), '[]'::jsonb),
          'client_cutoffs', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'code', cutoff.cutoff_code,
                'label', cutoff.cutoff_label,
                'due_at', cutoff.due_at,
                'timezone', cutoff.timezone,
                'status', cutoff.status
              )
              order by cutoff.due_at
            )
            from public.booking_cutoffs cutoff
            where cutoff.booking_id = b.id
              and cutoff.superseded_by_cutoff_id is null
              and cutoff.status <> 'CANCELLED'
              and cutoff.cutoff_code in (
                'SHIPPING_INSTRUCTIONS',
                'DOCUMENTATION',
                'VGM',
                'CARGO_DELIVERY',
                'CUSTOMS'
              )
              and coalesce(
                (cutoff.metadata ->> 'client_visible')::boolean,
                true
              )
          ), '[]'::jsonb),
          'vgm', jsonb_build_object(
            'required',
              public.booking_operational_mode(b.id) = 'SEA_FCL',
            'container_count', (
              select count(*)
              from public.booking_containers bc
              where bc.booking_id = b.id
            ),
            'submitted_count', (
              select count(*)
              from public.booking_containers bc
              where bc.booking_id = b.id
                and exists (
                  select 1
                  from public.container_vgm_records vgm
                  where vgm.booking_container_id = bc.id
                    and vgm.status in ('SUBMITTED', 'ACCEPTED')
                )
            )
          )
        )
        order by b.created_at, b.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.bookings b
  where b.shipment_id = p_shipment_id
    and b.booking_lifecycle_status = 'ACTIVE';

  return coalesce(
    v_result,
    jsonb_build_object(
      'shipment_id', p_shipment_id,
      'bookings', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_booking_readiness_report_v1()
returns table (
  shipment_id uuid,
  booking_id uuid,
  booking_number text,
  mode text,
  readiness_status text,
  blocking_count integer,
  next_cutoff timestamptz,
  hours_remaining numeric,
  vgm_complete boolean,
  missing_vgm_containers integer,
  overdue_cutoffs integer,
  active_exception boolean,
  ready_to_ship boolean
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    overview.shipment_id,
    overview.booking_id,
    overview.booking_number,
    overview.mode,
    case when overview.ready then 'READY' else 'BLOCKED' end,
    overview.blocking_count,
    overview.next_cutoff,
    case
      when overview.next_cutoff is null then null
      else round(
        extract(
          epoch from (overview.next_cutoff - clock_timestamp())
        ) / 3600,
        2
      )
    end,
    overview.missing_vgm_count = 0,
    overview.missing_vgm_count,
    overview.overdue_cutoff_count,
    overview.active_exception,
    overview.ready
  from public.get_booking_readiness_overview(null) overview
$$;

create or replace function public.get_container_vgm_report_v1()
returns table (
  shipment_id uuid,
  booking_id uuid,
  booking_container_id uuid,
  container_reference text,
  container_type text,
  version_number integer,
  gross_mass numeric,
  unit text,
  mass_kg numeric,
  verification_method text,
  status text,
  submitted_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    vgm.shipment_id,
    vgm.booking_id,
    vgm.booking_container_id,
    bc.notes,
    bc.container_type,
    vgm.version_number,
    vgm.gross_mass,
    vgm.unit,
    case
      when vgm.unit = 'LB'
        then round(vgm.gross_mass * 0.45359237, 3)
      else vgm.gross_mass
    end,
    vgm.verification_method,
    vgm.status,
    vgm.submitted_at,
    vgm.accepted_at
  from public.container_vgm_records vgm
  join public.booking_containers bc
    on bc.id = vgm.booking_container_id
  where public.can_select_booking(vgm.booking_id)
$$;

-- Backfill idempotente: solo requisitos; no inventa cut-offs ni VGM y no
-- modifica estados de booking.
select public.seed_booking_readiness_requirements(
  booking.id,
  true
)
from public.bookings booking
where booking.shipment_id is not null;

alter table public.booking_cutoffs enable row level security;
alter table public.container_vgm_records enable row level security;
alter table public.booking_readiness_requirements enable row level security;
alter table public.booking_readiness_exceptions enable row level security;
alter table public.booking_readiness_evaluations enable row level security;

drop policy if exists booking_cutoffs_select_policy
  on public.booking_cutoffs;
create policy booking_cutoffs_select_policy
on public.booking_cutoffs
for select to authenticated
using (public.can_select_booking(booking_id));

drop policy if exists container_vgm_select_policy
  on public.container_vgm_records;
create policy container_vgm_select_policy
on public.container_vgm_records
for select to authenticated
using (public.can_select_booking(booking_id));

drop policy if exists booking_readiness_requirements_select_policy
  on public.booking_readiness_requirements;
create policy booking_readiness_requirements_select_policy
on public.booking_readiness_requirements
for select to authenticated
using (public.can_select_booking(booking_id));

drop policy if exists booking_readiness_exceptions_select_policy
  on public.booking_readiness_exceptions;
create policy booking_readiness_exceptions_select_policy
on public.booking_readiness_exceptions
for select to authenticated
using (
  public.is_role(array['Admin', 'Operaciones'])
  and public.can_select_booking(booking_id)
);

drop policy if exists booking_readiness_evaluations_select_policy
  on public.booking_readiness_evaluations;
create policy booking_readiness_evaluations_select_policy
on public.booking_readiness_evaluations
for select to authenticated
using (public.can_select_booking(booking_id));

revoke all on table public.booking_cutoffs from anon, authenticated;
revoke all on table public.container_vgm_records from anon, authenticated;
revoke all on table public.booking_readiness_requirements from anon, authenticated;
revoke all on table public.booking_readiness_exceptions from anon, authenticated;
revoke all on table public.booking_readiness_evaluations from anon, authenticated;

grant select on table public.booking_cutoffs to authenticated;
grant select on table public.container_vgm_records to authenticated;
grant select on table public.booking_readiness_requirements to authenticated;
grant select on table public.booking_readiness_exceptions to authenticated;
grant select on table public.booking_readiness_evaluations to authenticated;

revoke all on function public.seed_booking_readiness_requirements(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.log_booking_readiness_action(
  uuid, text, text, uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.transition_container_vgm(
  uuid, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.transition_booking_status_v5b(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.rollover_booking_schedule_v5b(
  uuid, timestamptz, text, text, text, date, date, text, text, timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.replace_booking_v5b(
  uuid, timestamptz, text, text, text, text, text, date, date, text, text, text,
  boolean
) from public, anon, authenticated;
revoke all on function public.record_operational_event_v5b(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) from public, anon, authenticated;

revoke all on function public.evaluate_booking_readiness(uuid)
  from public, anon;
revoke all on function public.create_or_replace_booking_cutoff(
  uuid, uuid, text, text, timestamptz, text, text, text, uuid, text, text,
  jsonb, boolean
) from public, anon;
revoke all on function public.complete_booking_cutoff(
  uuid, timestamptz, text
) from public, anon;
revoke all on function public.waive_booking_cutoff(
  uuid, timestamptz, text, timestamptz
) from public, anon;
revoke all on function public.cancel_booking_cutoff(
  uuid, timestamptz, text
) from public, anon;
revoke all on function public.save_container_vgm_draft(
  uuid, uuid, numeric, text, text, timestamptz, text, uuid, text, jsonb
) from public, anon;
revoke all on function public.verify_container_vgm(uuid, timestamptz)
  from public, anon;
revoke all on function public.submit_container_vgm(
  uuid, timestamptz, text
) from public, anon;
revoke all on function public.accept_container_vgm(uuid, timestamptz)
  from public, anon;
revoke all on function public.reject_container_vgm(
  uuid, timestamptz, text
) from public, anon;
revoke all on function public.supersede_container_vgm(
  uuid, timestamptz, text
) from public, anon;
revoke all on function public.complete_booking_readiness_requirement(
  uuid, timestamptz, text, uuid, jsonb
) from public, anon;
revoke all on function public.authorize_booking_readiness_exception(
  uuid, timestamptz, text, timestamptz, jsonb
) from public, anon;
revoke all on function public.revoke_booking_readiness_exception(uuid, text)
  from public, anon;
revoke all on function public.get_booking_readiness_overview(uuid)
  from public, anon;
revoke all on function public.get_booking_readiness_alerts()
  from public, anon;
revoke all on function public.get_client_booking_readiness_v1(uuid)
  from public, anon;
revoke all on function public.get_booking_readiness_report_v1()
  from public, anon;
revoke all on function public.get_container_vgm_report_v1()
  from public, anon;

grant execute on function public.evaluate_booking_readiness(uuid)
  to authenticated;
grant execute on function public.create_or_replace_booking_cutoff(
  uuid, uuid, text, text, timestamptz, text, text, text, uuid, text, text,
  jsonb, boolean
) to authenticated;
grant execute on function public.complete_booking_cutoff(
  uuid, timestamptz, text
) to authenticated;
grant execute on function public.waive_booking_cutoff(
  uuid, timestamptz, text, timestamptz
) to authenticated;
grant execute on function public.cancel_booking_cutoff(
  uuid, timestamptz, text
) to authenticated;
grant execute on function public.save_container_vgm_draft(
  uuid, uuid, numeric, text, text, timestamptz, text, uuid, text, jsonb
) to authenticated;
grant execute on function public.verify_container_vgm(uuid, timestamptz)
  to authenticated;
grant execute on function public.submit_container_vgm(
  uuid, timestamptz, text
) to authenticated;
grant execute on function public.accept_container_vgm(uuid, timestamptz)
  to authenticated;
grant execute on function public.reject_container_vgm(
  uuid, timestamptz, text
) to authenticated;
grant execute on function public.supersede_container_vgm(
  uuid, timestamptz, text
) to authenticated;
grant execute on function public.complete_booking_readiness_requirement(
  uuid, timestamptz, text, uuid, jsonb
) to authenticated;
grant execute on function public.authorize_booking_readiness_exception(
  uuid, timestamptz, text, timestamptz, jsonb
) to authenticated;
grant execute on function public.revoke_booking_readiness_exception(uuid, text)
  to authenticated;
grant execute on function public.get_booking_readiness_overview(uuid)
  to authenticated;
grant execute on function public.get_booking_readiness_alerts()
  to authenticated;
grant execute on function public.get_client_booking_readiness_v1(uuid)
  to authenticated;
grant execute on function public.get_booking_readiness_report_v1()
  to authenticated;
grant execute on function public.get_container_vgm_report_v1()
  to authenticated;

revoke all on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) from public, anon;
grant execute on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) to authenticated;

revoke all on function public.rollover_booking_schedule(
  uuid, timestamptz, text, text, text, date, date, text, text, timestamptz,
  timestamptz, jsonb
) from public, anon;
grant execute on function public.rollover_booking_schedule(
  uuid, timestamptz, text, text, text, date, date, text, text, timestamptz,
  timestamptz, jsonb
) to authenticated;

revoke all on function public.replace_booking(
  uuid, timestamptz, text, text, text, text, text, date, date, text, text, text,
  boolean
) from public, anon;
grant execute on function public.replace_booking(
  uuid, timestamptz, text, text, text, text, text, date, date, text, text, text,
  boolean
) to authenticated;

revoke all on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) from public, anon;
grant execute on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) to authenticated;

comment on table public.booking_cutoffs is
  'Cut-offs versionados por booking o contenedor; nunca se eliminan.';
comment on table public.container_vgm_records is
  'Versiones VGM canonicas por fila de contenedor fisico.';
comment on function public.evaluate_booking_readiness(uuid) is
  'Evaluacion determinista y read-only; no persiste ni modifica estados.';

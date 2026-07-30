-- Fase 5A: shipments como agregado operativo canonico.
-- Aditiva y reversible: shipping_instructions y sus FK legacy se conservan.

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null,
  quotation_id uuid references public.quotations(id) on delete set null,
  client_id uuid references public.clientes(id) on delete restrict,
  shipping_instruction_id uuid unique
    references public.shipping_instructions(id) on delete restrict,
  service_type text,
  incoterm text,
  origin text,
  destination text,
  operational_status text not null default 'Sin bookings',
  requires_hbl boolean,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint shipments_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists uq_shipments_shipment_number
  on public.shipments(shipment_number);
create index if not exists idx_shipments_quotation_id
  on public.shipments(quotation_id);
create index if not exists idx_shipments_client_id
  on public.shipments(client_id);
create index if not exists idx_shipments_assigned_to
  on public.shipments(assigned_to);

alter table public.bookings
  add column if not exists shipment_id uuid;

alter table public.bookings
  drop constraint if exists bookings_shipment_id_fkey;
alter table public.bookings
  add constraint bookings_shipment_id_fkey
  foreign key (shipment_id)
  references public.shipments(id)
  on delete restrict;

create index if not exists idx_bookings_shipment_id
  on public.bookings(shipment_id);

alter table public.operational_events
  add column if not exists shipment_id uuid;

alter table public.operational_events
  drop constraint if exists operational_events_shipment_id_fkey;
alter table public.operational_events
  add constraint operational_events_shipment_id_fkey
  foreign key (shipment_id)
  references public.shipments(id)
  on delete restrict;

create index if not exists idx_operational_events_shipment_occurred
  on public.operational_events(shipment_id, occurred_at desc, created_at desc);

create or replace function public.backfill_shipments_from_shipping_instructions()
returns table (
  inserted_shipments integer,
  linked_bookings integer,
  linked_events integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_bookings integer := 0;
  v_events integer := 0;
begin
  with source_rows as (
    select
      si.*,
      q.cliente_id as quotation_client_id,
      q.service_product,
      q.quote_type,
      q.tipo_transporte,
      q.incoterm as quotation_incoterm,
      q.origen,
      q.destino,
      count(*) over (partition by nullif(btrim(si.routing_number), ''))
        as routing_occurrences
    from public.shipping_instructions si
    left join public.quotations q on q.id = si.quotation_id
  )
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
    created_at,
    updated_at,
    closed_at,
    metadata
  )
  select
    source.id,
    case
      when nullif(btrim(source.routing_number), '') is not null
       and source.routing_occurrences = 1
        then btrim(source.routing_number)
      else 'SHP-' || upper(replace(source.id::text, '-', ''))
    end,
    source.quotation_id,
    coalesce(source.client_id, source.quotation_client_id),
    source.id,
    coalesce(
      nullif(btrim(source.service_product), ''),
      nullif(btrim(source.quote_type), ''),
      nullif(btrim(source.tipo_transporte), '')
    ),
    nullif(btrim(source.quotation_incoterm), ''),
    coalesce(
      nullif(btrim(source.origen), ''),
      nullif(btrim(source.origin_address), '')
    ),
    coalesce(
      nullif(btrim(source.destino), ''),
      nullif(btrim(source.destination_address), '')
    ),
    coalesce(
      nullif(btrim(source.operational_status), ''),
      nullif(btrim(source.shipment_status), ''),
      'Sin bookings'
    ),
    source.operations_assigned_to,
    source.created_by,
    coalesce(source.created_at, now()),
    coalesce(source.updated_at, source.created_at, now()),
    case
      when coalesce(source.operational_status, source.shipment_status, '')
        in ('Finalizado', 'Cancelada')
        then coalesce(source.updated_at, source.created_at, now())
      else null
    end,
    jsonb_build_object(
      'migration_source', 'shipping_instructions',
      'migration_source_id', source.id,
      'migrated_at', now(),
      'migration_classification', case
        when source.quotation_id is null then 'B_SI_WITHOUT_QUOTATION'
        when coalesce(source.client_id, source.quotation_client_id) is null
          then 'C_SI_WITHOUT_RESOLVABLE_CLIENT'
        when nullif(btrim(source.routing_number), '') is null
          or source.routing_occurrences > 1
          then 'D_ROUTING_EXCEPTION'
        when coalesce(source.operational_status, source.shipment_status, '')
          in ('Finalizado', 'Cancelada')
          then 'F_HISTORICAL_CLOSED'
        when coalesce(source.operational_status, source.shipment_status, '')
          not in (
            'Pendiente Validación', 'Validada', 'Asignado',
            'Listo para Booking', 'En Booking', 'Booking Solicitado',
            'Booking Confirmado', 'Documentación Pendiente',
            'Listo para Embarque', 'Embarcado', 'En Tránsito',
            'Arribado', 'Finalizado', 'Cancelada'
          )
          then 'E_UNKNOWN_STATUS'
        else 'A_COMPLETE'
      end,
      'migration_notes', (
        '[]'::jsonb
        || case when source.quotation_id is null
          then jsonb_build_array('Shipping Instruction sin cotización')
          else '[]'::jsonb end
        || case when coalesce(source.client_id, source.quotation_client_id) is null
          then jsonb_build_array('Cliente no resoluble; se conserva null')
          else '[]'::jsonb end
        || case when nullif(btrim(source.routing_number), '') is null
          then jsonb_build_array('Routing vacío; se generó fallback estable desde UUID')
          else '[]'::jsonb end
        || case when source.routing_occurrences > 1
          then jsonb_build_array('Routing duplicado; se generó fallback estable desde UUID')
          else '[]'::jsonb end
      )
    )
  from source_rows source
  where not exists (
    select 1
    from public.shipments existing
    where existing.id = source.id
       or existing.shipping_instruction_id = source.id
  )
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;

  update public.bookings booking
  set shipment_id = shipment.id
  from public.shipments shipment
  where shipment.shipping_instruction_id = booking.shipping_instruction_id
    and booking.shipment_id is null;

  get diagnostics v_bookings = row_count;

  update public.operational_events event
  set shipment_id = shipment.id,
      updated_at = event.updated_at
  from public.shipments shipment
  where shipment.shipping_instruction_id = event.shipping_instruction_id
    and event.shipment_id is null;

  get diagnostics v_events = row_count;

  return query select v_inserted, v_bookings, v_events;
end;
$$;

revoke all on function public.backfill_shipments_from_shipping_instructions()
  from public, anon, authenticated;

-- Guardia temporal para escritores legacy que todavía insertan una SI de forma
-- directa. La fuente canónica usa su propia inserción transaccional y desactiva
-- esta compatibilidad mediante una marca local a la transacción.
create or replace function public.ensure_shipment_for_new_shipping_instruction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.quotations%rowtype;
begin
  if current_setting('app.shipment_creation_mode', true) = 'canonical_rpc' then
    return new;
  end if;

  if new.quotation_id is not null then
    select q.*
    into v_quotation
    from public.quotations q
    where q.id = new.quotation_id;
  end if;

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
    created_at,
    updated_at,
    closed_at,
    metadata
  ) values (
    new.id,
    coalesce(
      nullif(btrim(new.routing_number), ''),
      'SHP-' || upper(replace(new.id::text, '-', ''))
    ),
    new.quotation_id,
    coalesce(new.client_id, v_quotation.cliente_id),
    new.id,
    coalesce(
      nullif(btrim(v_quotation.service_product), ''),
      nullif(btrim(v_quotation.quote_type), ''),
      nullif(btrim(v_quotation.tipo_transporte), '')
    ),
    nullif(btrim(v_quotation.incoterm), ''),
    coalesce(
      nullif(btrim(v_quotation.origen), ''),
      nullif(btrim(new.origin_address), '')
    ),
    coalesce(
      nullif(btrim(v_quotation.destino), ''),
      nullif(btrim(new.destination_address), '')
    ),
    coalesce(
      nullif(btrim(new.operational_status), ''),
      nullif(btrim(new.shipment_status), ''),
      'Sin bookings'
    ),
    new.operations_assigned_to,
    new.created_by,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, new.created_at, now()),
    case
      when coalesce(new.operational_status, new.shipment_status, '')
        in ('Finalizado', 'Cancelada')
        then coalesce(new.updated_at, new.created_at, now())
      else null
    end,
    jsonb_build_object(
      'creation_source', 'shipping_instruction_insert_compatibility',
      'migration_notes', jsonb_build_array(
        'Shipment creado por guardia temporal de compatibilidad legacy'
      )
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_shipping_instruction_ensure_shipment
  on public.shipping_instructions;
create trigger trg_shipping_instruction_ensure_shipment
after insert on public.shipping_instructions
for each row
execute function public.ensure_shipment_for_new_shipping_instruction();

revoke all on function public.ensure_shipment_for_new_shipping_instruction()
  from public, anon, authenticated;

create or replace function public.shipment_id_for_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shipment_id uuid;
begin
  select shipment.id
  into v_shipment_id
  from public.shipments shipment
  where shipment.shipping_instruction_id = p_shipping_instruction_id;

  if v_shipment_id is null then
    raise exception 'La Shipping Instruction no tiene shipment canónico asociado'
      using errcode = '23514';
  end if;

  return v_shipment_id;
end;
$$;

create or replace function public.shipment_id_for_booking(
  p_booking_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shipment_id uuid;
begin
  select b.shipment_id
  into v_shipment_id
  from public.bookings b
  where b.id = p_booking_id;

  if v_shipment_id is null then
    raise exception 'El booking no tiene shipment canónico asociado'
      using errcode = '23514';
  end if;

  return v_shipment_id;
end;
$$;

revoke all on function public.shipment_id_for_shipping_instruction(uuid)
  from public, anon, authenticated;
revoke all on function public.shipment_id_for_booking(uuid)
  from public, anon, authenticated;

create or replace function public.validate_booking_shipment_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_shipment_id uuid;
begin
  select shipment.id
  into v_expected_shipment_id
  from public.shipments shipment
  where shipment.shipping_instruction_id = new.shipping_instruction_id;

  if v_expected_shipment_id is null then
    raise exception 'La Shipping Instruction del booking no tiene shipment canónico'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.shipping_instruction_id is distinct from old.shipping_instruction_id then
      raise exception 'No se permite mover un booking a otra Shipping Instruction'
        using errcode = '23514';
    end if;

    if old.shipment_id is not null
       and new.shipment_id is distinct from old.shipment_id then
      raise exception 'No se permite cambiar shipment_id directamente'
        using errcode = '23514';
    end if;
  end if;

  if new.shipment_id is null then
    new.shipment_id := v_expected_shipment_id;
  elsif new.shipment_id is distinct from v_expected_shipment_id then
    raise exception 'shipment_id no coincide con el shipment de la Shipping Instruction'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_booking_shipment_relationship
  on public.bookings;
create trigger trg_validate_booking_shipment_relationship
before insert or update
on public.bookings
for each row
execute function public.validate_booking_shipment_relationship();

create or replace function public.validate_operational_event_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_shipment_id uuid;
  v_booking_shipment_id uuid;
  v_booking_si_id uuid;
  v_container_booking_id uuid;
begin
  select shipment.id
  into v_expected_shipment_id
  from public.shipments shipment
  where shipment.shipping_instruction_id = new.shipping_instruction_id;

  if v_expected_shipment_id is null then
    raise exception 'La Shipping Instruction del evento no tiene shipment canónico'
      using errcode = '23514';
  end if;

  if new.shipment_id is null then
    new.shipment_id := v_expected_shipment_id;
  elsif new.shipment_id is distinct from v_expected_shipment_id then
    raise exception 'El shipment del evento no coincide con su Shipping Instruction'
      using errcode = '23514';
  end if;

  if new.booking_id is not null then
    select b.shipment_id, b.shipping_instruction_id
    into v_booking_shipment_id, v_booking_si_id
    from public.bookings b
    where b.id = new.booking_id;

    if v_booking_si_id is null
       or v_booking_si_id is distinct from new.shipping_instruction_id
       or v_booking_shipment_id is distinct from new.shipment_id then
      raise exception 'El booking del evento no pertenece al shipment/SI indicados'
        using errcode = '23514';
    end if;
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
    if new.shipping_instruction_id is distinct from old.shipping_instruction_id
       or (
         old.shipment_id is not null
         and new.shipment_id is distinct from old.shipment_id
       )
       or new.booking_id is distinct from old.booking_id then
      raise exception 'No se permite mover un evento operativo entre agregados'
        using errcode = '23514';
    end if;

    if old.shipment_id is null
       and new.shipment_id is not null then
      new.updated_at := old.updated_at;
    else
      new.updated_at := clock_timestamp();
    end if;
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

select * from public.backfill_shipments_from_shipping_instructions();

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
  v_statuses text[];
  v_active text[];
  v_active_count integer;
  v_delivered_count integer;
begin
  select array_agg(coalesce(nullif(btrim(b.shipment_status), ''), 'Booking Solicitado'))
  into v_statuses
  from public.bookings b
  where b.shipment_id = p_shipment_id;

  if coalesce(array_length(v_statuses, 1), 0) = 0 then
    return 'Sin bookings';
  end if;

  if not exists (select 1 from unnest(v_statuses) s where s <> 'Cancelada') then
    return 'Cancelado';
  end if;

  select array_agg(s)
  into v_active
  from unnest(v_statuses) s
  where s <> 'Cancelada';

  v_active_count := coalesce(array_length(v_active, 1), 0);

  if not exists (select 1 from unnest(v_active) s where s <> 'Finalizado') then
    return 'Finalizado';
  end if;

  if 'Arribado' = any(v_active) or 'Finalizado' = any(v_active) then
    if exists (
      select 1 from unnest(v_active) s
      where s not in ('Arribado', 'Finalizado')
    ) then
      return 'Arribo parcial';
    end if;

    select count(distinct oe.booking_id)::integer
    into v_delivered_count
    from public.operational_events oe
    where oe.shipment_id = p_shipment_id
      and oe.event_code = 'DELIVERED'
      and oe.booking_id is not null;

    if v_delivered_count >= v_active_count then
      return 'Cierre en proceso';
    end if;

    return 'Arribado';
  end if;

  if 'En Tránsito' = any(v_active) then return 'En tránsito'; end if;
  if 'Embarcado' = any(v_active) then return 'Embarcado'; end if;

  if 'Listo para Embarque' = any(v_active)
     or exists (
       select 1
       from public.operational_events oe
       where oe.shipment_id = p_shipment_id
         and oe.event_code in (
           'EQUIPMENT_RELEASED', 'CONTAINER_PICKED_UP',
           'CONTAINER_LOADED', 'GATE_IN'
         )
     ) then
    return 'Origen en proceso';
  end if;

  if 'Booking Solicitado' = any(v_active)
     and exists (
       select 1 from unnest(v_active) s
       where s in ('Booking Confirmado', 'Documentación Pendiente')
     ) then
    return 'Parcialmente confirmado';
  end if;

  if not exists (
    select 1 from unnest(v_active) s
    where s not in ('Booking Confirmado', 'Documentación Pendiente')
  ) then
    return 'Confirmado';
  end if;

  return 'Booking en proceso';
end;
$$;

revoke all on function public.derive_shipment_operational_status(uuid)
  from public, anon, authenticated;

update public.shipments shipment
set operational_status = public.derive_shipment_operational_status(shipment.id),
    closed_at = case
      when public.derive_shipment_operational_status(shipment.id)
        in ('Finalizado', 'Cancelado')
        then coalesce(shipment.closed_at, shipment.updated_at)
      else shipment.closed_at
    end;

create or replace function public.can_select_shipment(
  p_shipment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_shipment_id is null then false
    when not public.is_approved_active_user() then false
    when exists (
      select 1
      from public.shipments shipment
      where shipment.id = p_shipment_id
        and shipment.shipping_instruction_id is not null
        and public.can_select_shipping_instruction(
          shipment.shipping_instruction_id
        )
    ) then true
    when public.is_role(array['Admin', 'Operaciones']) then exists (
      select 1 from public.shipments shipment where shipment.id = p_shipment_id
    )
    when public.is_role(array['Ventas']) then exists (
      select 1
      from public.shipments shipment
      where shipment.id = p_shipment_id
        and shipment.created_by = auth.uid()
    )
    when public.is_role(array['Contabilidad', 'Pricing']) then exists (
      select 1
      from public.shipments shipment
      join public.quotations q on q.id = shipment.quotation_id
      where shipment.id = p_shipment_id
        and q.deleted_at is null
    )
    else false
  end
$$;

alter table public.shipments enable row level security;

drop policy if exists shipments_select_policy on public.shipments;
create policy shipments_select_policy
on public.shipments
for select
to authenticated
using (public.can_select_shipment(id));

revoke insert, update, delete on table public.shipments
  from public, anon, authenticated;
grant select on table public.shipments to authenticated;

create or replace function public.get_shipment_context(
  p_operation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shipment public.shipments%rowtype;
  v_si public.shipping_instructions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Se requiere autenticación'
      using errcode = '42501';
  end if;

  select shipment.*
  into v_shipment
  from public.shipments shipment
  where shipment.id = p_operation_id
     or shipment.shipping_instruction_id = p_operation_id
  order by case when shipment.id = p_operation_id then 0 else 1 end
  limit 1;

  if not found or not public.can_select_shipment(v_shipment.id) then
    raise exception 'Shipment no encontrado o no autorizado'
      using errcode = '42501';
  end if;

  if v_shipment.shipping_instruction_id is not null then
    select si.*
    into v_si
    from public.shipping_instructions si
    where si.id = v_shipment.shipping_instruction_id;
  end if;

  return jsonb_build_object(
    'shipment', to_jsonb(v_shipment)
      || jsonb_build_object(
        'derived_operational_status',
        public.derive_shipment_operational_status(v_shipment.id)
      ),
    'shipping_instruction', case
      when v_si.id is null then null
      else jsonb_build_object(
        'id', v_si.id,
        'routing_number', v_si.routing_number,
        'status', v_si.status,
        'operational_status', v_si.operational_status
      )
    end
  );
end;
$$;

revoke all on function public.get_shipment_context(uuid)
  from public, anon;
grant execute on function public.get_shipment_context(uuid)
  to authenticated;

-- Wrappers canónicos: preservan las firmas públicas probadas de 4A/4C.
alter function public.create_booking_for_shipping_instruction(uuid)
  rename to create_booking_for_shipping_instruction_v4a;

create or replace function public.create_booking_for_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.shipment_id_for_shipping_instruction(
    p_shipping_instruction_id
  );

  return query
  select *
  from public.create_booking_for_shipping_instruction_v4a(
    p_shipping_instruction_id
  );
end;
$$;

alter function public.update_booking_canonical(uuid, uuid, timestamptz, jsonb)
  rename to update_booking_canonical_v4c;

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
  v_expected_shipment_id uuid;
  v_booking_shipment_id uuid;
begin
  v_expected_shipment_id :=
    public.shipment_id_for_shipping_instruction(p_shipping_instruction_id);
  v_booking_shipment_id := public.shipment_id_for_booking(p_booking_id);

  if v_booking_shipment_id is distinct from v_expected_shipment_id then
    raise exception 'El booking no pertenece al shipment de la SI'
      using errcode = '23514';
  end if;

  return query
  select *
  from public.update_booking_canonical_v4c(
    p_booking_id,
    p_shipping_instruction_id,
    p_expected_updated_at,
    p_changes
  );
end;
$$;

alter function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) rename to record_operational_event_v4c;

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
  v_shipment_id uuid;
begin
  v_shipment_id :=
    public.shipment_id_for_shipping_instruction(p_shipping_instruction_id);

  if p_booking_id is not null
     and public.shipment_id_for_booking(p_booking_id)
       is distinct from v_shipment_id then
    raise exception 'El booking no pertenece al shipment indicado'
      using errcode = '23514';
  end if;

  return query
  select *
  from public.record_operational_event_v4c(
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

alter function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) rename to transition_booking_status_v4c;

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
  v_shipment_id uuid;
  v_result jsonb;
begin
  v_shipment_id := public.shipment_id_for_booking(p_booking_id);

  if not exists (
    select 1
    from public.bookings b
    join public.shipments shipment on shipment.id = b.shipment_id
    where b.id = p_booking_id
      and shipment.shipping_instruction_id = b.shipping_instruction_id
  ) then
    raise exception 'Relación booking/shipment/SI inconsistente'
      using errcode = '23514';
  end if;

  v_result := public.transition_booking_status_v4c(
    p_booking_id,
    p_expected_updated_at,
    p_target_status,
    p_occurred_at,
    p_location,
    p_notes,
    p_metadata
  );

  return v_result || jsonb_build_object(
    'shipment_id', v_shipment_id,
    'derived_shipment_status',
    public.derive_shipment_operational_status(v_shipment_id)
  );
end;
$$;

drop function public.get_booking_operational_timeline(uuid);

create function public.get_booking_operational_timeline(
  p_booking_id uuid
)
returns table (
  id uuid,
  shipment_id uuid,
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
  v_shipment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere autenticación'
      using errcode = '42501';
  end if;

  if not public.can_manage_operations() then
    raise exception 'No autorizado para consultar el timeline operativo'
      using errcode = '42501';
  end if;

  v_shipment_id := public.shipment_id_for_booking(p_booking_id);

  return query
  select
    oe.id,
    oe.shipment_id,
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
    nullif(btrim(concat_ws(' ', profile.nombre, profile.apellido)), ''),
    oe.created_at,
    oe.updated_at
  from public.operational_events oe
  left join public.profiles profile on profile.id = oe.created_by
  where oe.shipment_id = v_shipment_id
    and (oe.booking_id = p_booking_id or oe.booking_id is null)
  order by oe.occurred_at desc, oe.created_at desc, oe.id desc;
end;
$$;

alter function public.finalize_shipping_instruction_canonical(uuid, timestamptz)
  rename to finalize_shipping_instruction_canonical_v4c;

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
  v_shipment_id uuid;
  v_result jsonb;
  v_shipment public.shipments%rowtype;
begin
  v_shipment_id :=
    public.shipment_id_for_shipping_instruction(p_shipping_instruction_id);

  select shipment.*
  into v_shipment
  from public.shipments shipment
  where shipment.id = v_shipment_id
  for update;

  v_result := public.finalize_shipping_instruction_canonical_v4c(
    p_shipping_instruction_id,
    p_expected_updated_at
  );

  update public.shipments shipment
  set operational_status = 'Finalizado',
      closed_at = coalesce(shipment.closed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where shipment.id = v_shipment_id
  returning * into v_shipment;

  return v_result || jsonb_build_object(
    'shipment', to_jsonb(v_shipment),
    'derived_shipment_status',
    public.derive_shipment_operational_status(v_shipment_id)
  );
end;
$$;

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

  select aq.*
  into v_agent
  from public.agent_quotes aq
  where aq.quotation_id = p_quotation_id
    and aq.is_selected is true
    and aq.deleted_at is null
  order by aq.created_at desc
  limit 1;

  if not found then
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

-- Portal v2 conserva firma y URL, pero shipments es la raíz interna.
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
  left join public.bookings booking on booking.shipment_id = shipment.id
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

revoke all on function public.create_booking_for_shipping_instruction_v4a(uuid)
  from public, anon, authenticated;
revoke all on function public.update_booking_canonical_v4c(
  uuid, uuid, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.record_operational_event_v4c(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.transition_booking_status_v4c(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_shipping_instruction_canonical_v4c(
  uuid, timestamptz
) from public, anon, authenticated;

revoke all on function public.create_booking_for_shipping_instruction(uuid)
  from public, anon;
revoke all on function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) from public, anon;
revoke all on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) from public, anon;
revoke all on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) from public, anon;
revoke all on function public.get_booking_operational_timeline(uuid)
  from public, anon;
revoke all on function public.finalize_shipping_instruction_canonical(
  uuid, timestamptz
) from public, anon;
revoke all on function public.create_shipment_from_quotation(uuid, text)
  from public, anon;

grant execute on function public.create_booking_for_shipping_instruction(uuid)
  to authenticated;
grant execute on function public.update_booking_canonical(
  uuid, uuid, timestamptz, jsonb
) to authenticated;
grant execute on function public.record_operational_event(
  uuid, uuid, uuid, text, text, timestamptz, text, text, jsonb
) to authenticated;
grant execute on function public.transition_booking_status(
  uuid, timestamptz, text, timestamptz, text, text, jsonb
) to authenticated;
grant execute on function public.get_booking_operational_timeline(uuid)
  to authenticated;
grant execute on function public.finalize_shipping_instruction_canonical(
  uuid, timestamptz
) to authenticated;
grant execute on function public.create_shipment_from_quotation(uuid, text)
  to authenticated;

comment on table public.shipments is
  'Canonical operational aggregate. shipping_instructions remains document/context during compatibility.';
comment on column public.shipments.client_id is
  'Nullable only to preserve incomplete historical SIs without inventing a client.';
comment on function public.get_client_shipments_v2(boolean) is
  'Portal v2: one row per canonical shipment; legacy URLs remain compatible because backfilled IDs match SI IDs.';

notify pgrst, 'reload schema';

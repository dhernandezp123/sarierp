-- Fase 6: embarques Miami persistentes e historial inicial de paquetes.

create sequence if not exists public.miami_shipment_number_seq;

revoke all on sequence public.miami_shipment_number_seq
  from public, anon, authenticated;

create table if not exists public.miami_shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique,
  transport_mode text,
  status text not null default 'Despachado',
  total_packages integer not null default 0,
  total_weight_lbs numeric(12, 2) not null default 0,
  notes text,
  dispatched_at timestamptz not null default now(),
  arrived_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint miami_shipments_status_check
    check (status in ('Despachado', 'En Transito', 'Llegado Honduras', 'Entregado', 'Cancelado')),
  constraint miami_shipments_transport_mode_check
    check (transport_mode is null or transport_mode in ('Aereo', 'Maritimo', 'Terrestre', 'Courier')),
  constraint miami_shipments_total_packages_check check (total_packages >= 0),
  constraint miami_shipments_total_weight_check check (total_weight_lbs >= 0)
);

create table if not exists public.miami_shipment_packages (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.miami_shipments(id) on delete cascade,
  package_id uuid not null references public.miami_packages(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  unique (shipment_id, package_id),
  unique (package_id)
);

create table if not exists public.miami_package_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.miami_packages(id) on delete cascade,
  shipment_id uuid references public.miami_shipments(id) on delete set null,
  event_type text not null,
  old_status text,
  new_status text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists miami_shipments_dispatched_at_idx
  on public.miami_shipments (dispatched_at desc);

create index if not exists miami_shipments_status_idx
  on public.miami_shipments (status);

create index if not exists miami_shipment_packages_shipment_idx
  on public.miami_shipment_packages (shipment_id);

create index if not exists miami_shipment_packages_package_idx
  on public.miami_shipment_packages (package_id);

create index if not exists miami_package_events_package_idx
  on public.miami_package_events (package_id, created_at desc);

create index if not exists miami_package_events_shipment_idx
  on public.miami_package_events (shipment_id);

alter table public.miami_shipments enable row level security;
alter table public.miami_shipment_packages enable row level security;
alter table public.miami_package_events enable row level security;

drop policy if exists miami_shipments_admin_ops_all on public.miami_shipments;
create policy miami_shipments_admin_ops_all
  on public.miami_shipments
  to authenticated
  using (public.is_admin_or_operations())
  with check (public.is_admin_or_operations());

drop policy if exists miami_shipment_packages_admin_ops_all on public.miami_shipment_packages;
create policy miami_shipment_packages_admin_ops_all
  on public.miami_shipment_packages
  to authenticated
  using (public.is_admin_or_operations())
  with check (public.is_admin_or_operations());

drop policy if exists miami_package_events_admin_ops_all on public.miami_package_events;
create policy miami_package_events_admin_ops_all
  on public.miami_package_events
  to authenticated
  using (public.is_admin_or_operations())
  with check (public.is_admin_or_operations());

drop policy if exists miami_package_events_cliente_select on public.miami_package_events;
create policy miami_package_events_cliente_select
  on public.miami_package_events
  for select
  to authenticated
  using (
    public.is_cliente()
    and exists (
      select 1
      from public.miami_packages mp
      where mp.id = miami_package_events.package_id
        and mp.cliente_id = public.current_user_cliente_id()
    )
  );

create or replace function public.next_miami_shipment_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence bigint;
begin
  if auth.uid() is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para generar embarques Miami'
      using errcode = '42501';
  end if;

  v_sequence := nextval('public.miami_shipment_number_seq');

  return 'MIA-'
    || to_char(current_date, 'YYYYMMDD')
    || '-'
    || lpad(v_sequence::text, 6, '0');
end;
$$;

revoke all on function public.next_miami_shipment_number() from public, anon;
grant execute on function public.next_miami_shipment_number() to authenticated;

create or replace function public.create_miami_shipment(
  p_package_ids uuid[],
  p_transport_mode text default null,
  p_notes text default null
)
returns table (
  shipment_id uuid,
  shipment_number text,
  package_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_shipment_id uuid;
  v_shipment_number text;
  v_expected_count integer := coalesce(array_length(p_package_ids, 1), 0);
  v_ready_count integer;
  v_total_weight numeric(12, 2);
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para crear embarques Miami'
      using errcode = '42501';
  end if;

  if v_expected_count = 0 then
    raise exception 'Selecciona al menos un paquete'
      using errcode = '22023';
  end if;

  if p_transport_mode is not null
    and p_transport_mode not in ('Aereo', 'Maritimo', 'Terrestre', 'Courier') then
    raise exception 'Modo de transporte invalido'
      using errcode = '22023';
  end if;

  perform 1
  from public.miami_packages mp
  where mp.id = any(p_package_ids)
  for update;

  select count(*), coalesce(sum(coalesce(mp.weight_lbs, 0)), 0)
  into v_ready_count, v_total_weight
  from public.miami_packages mp
  where mp.id = any(p_package_ids)
    and mp.cargo_status in ('Recibido en Miami', 'En Consolidación')
    and not exists (
      select 1
      from public.miami_shipment_packages msp
      where msp.package_id = mp.id
    );

  if v_ready_count <> v_expected_count then
    raise exception 'Uno o mas paquetes ya no estan disponibles para despacho'
      using errcode = '23514';
  end if;

  v_shipment_number := public.next_miami_shipment_number();

  insert into public.miami_shipments (
    shipment_number,
    transport_mode,
    status,
    total_packages,
    total_weight_lbs,
    notes,
    created_by
  )
  values (
    v_shipment_number,
    p_transport_mode,
    'Despachado',
    v_ready_count,
    v_total_weight,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_shipment_id;

  insert into public.miami_shipment_packages (shipment_id, package_id, added_by)
  select v_shipment_id, mp.id, v_user_id
  from public.miami_packages mp
  where mp.id = any(p_package_ids);

  insert into public.miami_package_events (
    package_id,
    shipment_id,
    event_type,
    old_status,
    new_status,
    notes,
    created_by,
    metadata
  )
  select
    mp.id,
    v_shipment_id,
    'dispatch',
    mp.cargo_status,
    'En Tránsito',
    'Paquete agregado a embarque Miami ' || v_shipment_number,
    v_user_id,
    jsonb_build_object('shipment_number', v_shipment_number)
  from public.miami_packages mp
  where mp.id = any(p_package_ids);

  update public.miami_packages
  set cargo_status = 'En Tránsito',
      cargo_status_updated_at = now()
  where id = any(p_package_ids);

  insert into public.activity_logs (
    user_id,
    module,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  )
  values (
    v_user_id,
    'Miami',
    'create_miami_shipment',
    'miami_shipment',
    v_shipment_id,
    'Embarque Miami creado con ' || v_ready_count || ' paquetes',
    jsonb_build_object(
      'shipment_number', v_shipment_number,
      'package_count', v_ready_count,
      'package_ids', to_jsonb(p_package_ids)
    )
  );

  return query
  select v_shipment_id, v_shipment_number, v_ready_count;
end;
$$;

revoke all on function public.create_miami_shipment(uuid[], text, text) from public, anon;
grant execute on function public.create_miami_shipment(uuid[], text, text) to authenticated;

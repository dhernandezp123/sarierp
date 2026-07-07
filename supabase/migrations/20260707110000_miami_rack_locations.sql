-- Miami bodega: ubicación física por rack con historial y auditoría.

alter table public.miami_packages
  add column if not exists rack_location text,
  add column if not exists location_updated_at timestamptz,
  add column if not exists location_updated_by uuid references public.profiles(id) on delete set null;

create index if not exists miami_packages_rack_location_idx
  on public.miami_packages (rack_location)
  where rack_location is not null;

create or replace function public.set_miami_package_location(
  p_tracking text,
  p_rack text
)
returns table (
  package_id uuid,
  tracking_number text,
  warehouse_number text,
  cliente_nombre text,
  old_rack text,
  new_rack text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tracking text := upper(btrim(coalesce(p_tracking, '')));
  v_rack text := upper(btrim(coalesce(p_rack, '')));
  v_pkg record;
  v_out_of_warehouse_status text;
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para ubicar paquetes Miami'
      using errcode = '42501';
  end if;

  if v_tracking = '' then
    raise exception 'El tracking es requerido'
      using errcode = '22023';
  end if;

  if v_rack = '' then
    raise exception 'El rack es requerido'
      using errcode = '22023';
  end if;

  -- Solo carga aún en bodega Miami puede ubicarse; ante trackings duplicados
  -- se toma el ingreso más reciente que siga en bodega.
  select mp.id, mp.tracking_number, mp.warehouse_number, mp.rack_location, c.nombre as cliente_nombre
  into v_pkg
  from public.miami_packages mp
  left join public.clientes c on c.id = mp.cliente_id
  where (upper(mp.tracking_number) = v_tracking or upper(coalesce(mp.warehouse_number, '')) = v_tracking)
    and mp.cargo_status in ('Recibido en Miami', 'En Consolidación')
  order by mp.received_at desc
  limit 1
  for update of mp;

  if v_pkg.id is null then
    select mp.cargo_status
    into v_out_of_warehouse_status
    from public.miami_packages mp
    where upper(mp.tracking_number) = v_tracking
       or upper(coalesce(mp.warehouse_number, '')) = v_tracking
    order by mp.received_at desc
    limit 1;

    if v_out_of_warehouse_status is null then
      raise exception 'Paquete Miami no encontrado'
        using errcode = 'P0002';
    end if;

    raise exception 'El paquete ya no está en bodega Miami (estado: %)', v_out_of_warehouse_status
      using errcode = '23514';
  end if;

  update public.miami_packages
  set rack_location = v_rack,
      location_updated_at = now(),
      location_updated_by = v_user_id
  where id = v_pkg.id;

  insert into public.miami_package_events (
    package_id,
    event_type,
    notes,
    created_by,
    metadata
  )
  values (
    v_pkg.id,
    'location_change',
    'Ubicado en rack ' || v_rack,
    v_user_id,
    jsonb_build_object(
      'source', 'inventory_rack_scan',
      'old_rack', v_pkg.rack_location,
      'new_rack', v_rack
    )
  );

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
    'set_miami_package_location',
    'miami_package',
    v_pkg.id,
    'Paquete ' || v_pkg.tracking_number || ' ubicado en rack ' || v_rack,
    jsonb_build_object(
      'old_rack', v_pkg.rack_location,
      'new_rack', v_rack
    )
  );

  return query select
    v_pkg.id,
    v_pkg.tracking_number,
    v_pkg.warehouse_number,
    v_pkg.cliente_nombre,
    v_pkg.rack_location,
    v_rack;
end;
$$;

revoke all on function public.set_miami_package_location(text, text) from public, anon;
grant execute on function public.set_miami_package_location(text, text) to authenticated;

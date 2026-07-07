-- Miami bodega: hardening de escaneo/cambios/eliminacion de paquetes en manifiestos.

create unique index if not exists miami_packages_manifest_tracking_unique_idx
  on public.miami_packages (manifest_id, upper(tracking_number))
  where manifest_id is not null;

create or replace function public.scan_miami_manifest_package(
  p_manifest_id uuid,
  p_tracking text,
  p_weight_lbs numeric default null,
  p_weight_kg numeric default null
)
returns table (
  package_id uuid,
  tracking_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manifest record;
  v_tracking text := upper(btrim(coalesce(p_tracking, '')));
  v_package_id uuid;
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para escanear paquetes Miami'
      using errcode = '42501';
  end if;

  if v_tracking = '' then
    raise exception 'El tracking es requerido'
      using errcode = '22023';
  end if;

  select mm.id, mm.manifest_number, mm.status, mm.carrier
  into v_manifest
  from public.miami_manifests mm
  where mm.id = p_manifest_id
  for update;

  if not found then
    raise exception 'Manifiesto Miami no encontrado'
      using errcode = 'P0002';
  end if;

  if v_manifest.status <> 'Abierto' then
    raise exception 'El manifiesto % esta cerrado', v_manifest.manifest_number
      using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(v_manifest.carrier, '')), '') is null then
    raise exception 'Selecciona el transportista del manifiesto antes de escanear'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.miami_packages mp
    where mp.manifest_id = p_manifest_id
      and upper(mp.tracking_number) = v_tracking
  ) then
    raise exception 'El tracking % ya esta en este manifiesto', v_tracking
      using errcode = '23505';
  end if;

  insert into public.miami_packages (
    tracking_number,
    carrier,
    weight_lbs,
    weight_kg,
    manifest_id,
    received_by,
    status
  )
  values (
    v_tracking,
    v_manifest.carrier,
    p_weight_lbs,
    p_weight_kg,
    p_manifest_id,
    v_user_id,
    'Sin asignar'
  )
  returning id into v_package_id;

  return query select v_package_id, v_tracking;
end;
$$;

revoke all on function public.scan_miami_manifest_package(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.scan_miami_manifest_package(uuid, text, numeric, numeric) to authenticated;

create or replace function public.update_miami_manifest_carrier(
  p_manifest_id uuid,
  p_carrier text
)
returns table (
  manifest_number text,
  updated_packages integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manifest record;
  v_carrier text := btrim(coalesce(p_carrier, ''));
  v_blocked_count integer;
  v_updated integer := 0;
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para cambiar el transportista del manifiesto'
      using errcode = '42501';
  end if;

  if v_carrier = '' then
    raise exception 'El transportista es requerido'
      using errcode = '22023';
  end if;

  select mm.id, mm.manifest_number, mm.status, mm.carrier
  into v_manifest
  from public.miami_manifests mm
  where mm.id = p_manifest_id
  for update;

  if not found then
    raise exception 'Manifiesto Miami no encontrado'
      using errcode = 'P0002';
  end if;

  if v_manifest.status <> 'Abierto' then
    raise exception 'Solo se puede cambiar el transportista de manifiestos abiertos'
      using errcode = '23514';
  end if;

  if v_carrier = coalesce(v_manifest.carrier, '') then
    return query select v_manifest.manifest_number, 0;
    return;
  end if;

  select count(*)
  into v_blocked_count
  from public.miami_packages mp
  where mp.manifest_id = p_manifest_id
    and (
      mp.status <> 'Sin asignar'
      or mp.cliente_id is not null
      or mp.warehouse_number is not null
    );

  if v_blocked_count > 0 then
    raise exception 'El manifiesto tiene % paquete(s) asignados o procesados; no se puede cambiar el transportista', v_blocked_count
      using errcode = '23514';
  end if;

  update public.miami_manifests
  set carrier = v_carrier
  where id = p_manifest_id;

  update public.miami_packages
  set carrier = v_carrier
  where manifest_id = p_manifest_id;
  get diagnostics v_updated = row_count;

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
    'update_miami_manifest_carrier',
    'miami_manifest',
    p_manifest_id,
    'Transportista del manifiesto ' || v_manifest.manifest_number || ' actualizado',
    jsonb_build_object(
      'manifest_number', v_manifest.manifest_number,
      'old_carrier', v_manifest.carrier,
      'new_carrier', v_carrier,
      'updated_packages', v_updated
    )
  );

  return query select v_manifest.manifest_number, v_updated;
end;
$$;

revoke all on function public.update_miami_manifest_carrier(uuid, text) from public, anon;
grant execute on function public.update_miami_manifest_carrier(uuid, text) to authenticated;

create or replace function public.delete_miami_manifest_package(
  p_package_id uuid
)
returns table (
  tracking_number text,
  manifest_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pkg record;
  v_shipment_count integer;
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para eliminar paquetes de manifiestos Miami'
      using errcode = '42501';
  end if;

  select
    mp.id,
    mp.tracking_number,
    mp.status,
    mp.cliente_id,
    mp.warehouse_number,
    mp.manifest_id,
    mm.manifest_number,
    mm.status as manifest_status
  into v_pkg
  from public.miami_packages mp
  join public.miami_manifests mm on mm.id = mp.manifest_id
  where mp.id = p_package_id
  for update of mp, mm;

  if not found then
    raise exception 'Paquete Miami no encontrado en manifiesto'
      using errcode = 'P0002';
  end if;

  if v_pkg.manifest_status <> 'Abierto' then
    raise exception 'El manifiesto % esta cerrado', v_pkg.manifest_number
      using errcode = '23514';
  end if;

  if v_pkg.status <> 'Sin asignar'
     or v_pkg.cliente_id is not null
     or v_pkg.warehouse_number is not null then
    raise exception 'El paquete ya fue asignado o procesado; no se puede eliminar'
      using errcode = '23514';
  end if;

  select count(*)
  into v_shipment_count
  from public.miami_shipment_packages msp
  where msp.package_id = p_package_id;

  if v_shipment_count > 0 then
    raise exception 'El paquete esta vinculado a un despacho; no se puede eliminar'
      using errcode = '23514';
  end if;

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
    'delete_miami_manifest_package',
    'miami_package',
    p_package_id,
    'Paquete ' || v_pkg.tracking_number || ' eliminado del manifiesto ' || v_pkg.manifest_number,
    jsonb_build_object(
      'tracking_number', v_pkg.tracking_number,
      'manifest_id', v_pkg.manifest_id,
      'manifest_number', v_pkg.manifest_number
    )
  );

  delete from public.miami_packages
  where id = p_package_id;

  return query select v_pkg.tracking_number, v_pkg.manifest_number;
end;
$$;

revoke all on function public.delete_miami_manifest_package(uuid) from public, anon;
grant execute on function public.delete_miami_manifest_package(uuid) to authenticated;

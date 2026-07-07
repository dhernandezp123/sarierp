-- Miami bodega: eliminación de manifiestos solo Admin, con motivo obligatorio
-- y registro permanente en activity_logs (los eventos de paquetes se borran en
-- cascada, por eso el log vive fuera del manifiesto).

create or replace function public.delete_miami_manifest(
  p_manifest_id uuid,
  p_reason text
)
returns table (
  manifest_number text,
  deleted_packages integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manifest record;
  v_blocked_count integer;
  v_shipment_count integer;
  v_trackings text[];
  v_deleted integer := 0;
begin
  if v_user_id is null or not public.is_admin() then
    raise exception 'Solo Admin puede eliminar manifiestos Miami'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo de la eliminación es obligatorio'
      using errcode = '22023';
  end if;

  select mm.id, mm.manifest_number, mm.status, mm.carrier, mm.total_packages, mm.created_at
  into v_manifest
  from public.miami_manifests mm
  where mm.id = p_manifest_id
  for update;

  if not found then
    raise exception 'Manifiesto Miami no encontrado'
      using errcode = 'P0002';
  end if;

  -- Solo se elimina si ningún paquete fue asignado a cliente ni avanzó de bodega
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
    raise exception 'El manifiesto tiene % paquete(s) asignados o procesados; desasignar antes de eliminar', v_blocked_count
      using errcode = '23514';
  end if;

  select count(*)
  into v_shipment_count
  from public.miami_shipment_packages msp
  join public.miami_packages mp on mp.id = msp.package_id
  where mp.manifest_id = p_manifest_id;

  if v_shipment_count > 0 then
    raise exception 'El manifiesto tiene paquetes vinculados a un despacho; no se puede eliminar'
      using errcode = '23514';
  end if;

  select coalesce(array_agg(mp.tracking_number order by mp.received_at), '{}')
  into v_trackings
  from public.miami_packages mp
  where mp.manifest_id = p_manifest_id;

  delete from public.miami_packages
  where manifest_id = p_manifest_id;
  get diagnostics v_deleted = row_count;

  -- Registro permanente antes de borrar el manifiesto
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
    'delete_miami_manifest',
    'miami_manifest',
    p_manifest_id,
    'Manifiesto ' || v_manifest.manifest_number || ' eliminado con ' || v_deleted || ' paquete(s)',
    jsonb_build_object(
      'manifest_number', v_manifest.manifest_number,
      'status', v_manifest.status,
      'carrier', v_manifest.carrier,
      'created_at', v_manifest.created_at,
      'reason', btrim(p_reason),
      'deleted_packages', v_deleted,
      'trackings', to_jsonb(v_trackings)
    )
  );

  delete from public.miami_manifests
  where id = p_manifest_id;

  return query select v_manifest.manifest_number, v_deleted;
end;
$$;

revoke all on function public.delete_miami_manifest(uuid, text) from public, anon;
grant execute on function public.delete_miami_manifest(uuid, text) to authenticated;

-- Fase 6: avance de estados Miami con historial transaccional.

create or replace function public.advance_miami_package_status(
  p_package_id uuid,
  p_next_status text,
  p_notes text default null
)
returns table (
  package_id uuid,
  old_status text,
  new_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_status text;
  v_allowed_next text;
  v_shipment_id uuid;
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para actualizar paquetes Miami'
      using errcode = '42501';
  end if;

  select mp.cargo_status
  into v_old_status
  from public.miami_packages mp
  where mp.id = p_package_id
  for update;

  if not found then
    raise exception 'Paquete Miami no encontrado'
      using errcode = 'P0002';
  end if;

  v_allowed_next := case v_old_status
    when 'Recibido en Miami' then 'En Consolidación'
    when 'En Consolidación' then 'En Tránsito'
    when 'En Tránsito' then 'Llegado Honduras'
    when 'Llegado Honduras' then 'Entregado'
    else null
  end;

  if v_allowed_next is null or p_next_status is distinct from v_allowed_next then
    raise exception 'Transicion de estado Miami invalida'
      using errcode = '23514';
  end if;

  select msp.shipment_id
  into v_shipment_id
  from public.miami_shipment_packages msp
  where msp.package_id = p_package_id
  limit 1;

  update public.miami_packages
  set cargo_status = p_next_status,
      cargo_status_updated_at = now(),
      status = case
        when p_next_status = 'Entregado' then 'Entregado'
        else status
      end
  where id = p_package_id;

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
  values (
    p_package_id,
    v_shipment_id,
    'status_change',
    v_old_status,
    p_next_status,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id,
    jsonb_build_object('source', 'miami_inventory')
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
    'advance_miami_package_status',
    'miami_package',
    p_package_id,
    'Estado Miami actualizado de ' || v_old_status || ' a ' || p_next_status,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_next_status,
      'shipment_id', v_shipment_id
    )
  );

  return query select p_package_id, v_old_status, p_next_status;
end;
$$;

revoke all on function public.advance_miami_package_status(uuid, text, text) from public, anon;
grant execute on function public.advance_miami_package_status(uuid, text, text) to authenticated;

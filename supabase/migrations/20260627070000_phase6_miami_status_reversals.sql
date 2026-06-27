-- Fase 6: reversos controlados de estados Miami con motivo obligatorio.

create or replace function public.reverse_miami_package_status(
  p_package_id uuid,
  p_reason text
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
  v_current_status text;
  v_previous_status text;
  v_shipment_id uuid;
  v_cliente_id uuid;
begin
  if v_user_id is null or not public.is_admin_or_operations() then
    raise exception 'No autorizado para reversar estados Miami'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del reverso es obligatorio'
      using errcode = '22023';
  end if;

  select mp.cargo_status, mp.cliente_id
  into v_current_status, v_cliente_id
  from public.miami_packages mp
  where mp.id = p_package_id
  for update;

  if not found then
    raise exception 'Paquete Miami no encontrado'
      using errcode = 'P0002';
  end if;

  v_previous_status := case v_current_status
    when 'En Consolidación' then 'Recibido en Miami'
    when 'En Tránsito' then 'En Consolidación'
    when 'Llegado Honduras' then 'En Tránsito'
    when 'Entregado' then 'Llegado Honduras'
    else null
  end;

  if v_previous_status is null then
    raise exception 'El estado Miami actual no permite reverso'
      using errcode = '23514';
  end if;

  select msp.shipment_id
  into v_shipment_id
  from public.miami_shipment_packages msp
  where msp.package_id = p_package_id
  limit 1;

  update public.miami_packages
  set cargo_status = v_previous_status,
      cargo_status_updated_at = now(),
      status = case
        when v_current_status = 'Entregado' and v_cliente_id is not null then 'Asignado'
        when v_current_status = 'Entregado' then 'Sin asignar'
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
    'status_reverse',
    v_current_status,
    v_previous_status,
    btrim(p_reason),
    v_user_id,
    jsonb_build_object('source', 'miami_inventory', 'reason', btrim(p_reason))
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
    'reverse_miami_package_status',
    'miami_package',
    p_package_id,
    'Estado Miami reversado de ' || v_current_status || ' a ' || v_previous_status,
    jsonb_build_object(
      'old_status', v_current_status,
      'new_status', v_previous_status,
      'shipment_id', v_shipment_id,
      'reason', btrim(p_reason)
    )
  );

  return query select p_package_id, v_current_status, v_previous_status;
end;
$$;

revoke all on function public.reverse_miami_package_status(uuid, text) from public, anon;
grant execute on function public.reverse_miami_package_status(uuid, text) to authenticated;

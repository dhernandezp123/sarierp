-- Fase 5: reemplazo atomico de contenedores de booking y BL.

create or replace function public.replace_booking_containers(
  p_booking_id uuid,
  p_containers jsonb default '[]'::jsonb
)
returns table (
  booking_id uuid,
  containers_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
begin
  if v_user_id is null
    or not public.can_manage_operations()
    or not public.can_select_booking(p_booking_id) then
    raise exception 'No tienes permiso para reemplazar contenedores del booking'
      using errcode = '42501';
  end if;

  perform 1
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'El booking no existe';
  end if;

  if jsonb_typeof(coalesce(p_containers, '[]'::jsonb)) <> 'array' then
    raise exception 'Los contenedores deben enviarse como arreglo';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_containers, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'container_type', '')), '') is null
      or coalesce((v_item->>'quantity')::integer, 0) <= 0 then
      raise exception 'Los contenedores del booking contienen valores invalidos';
    end if;
  end loop;

  delete from public.booking_containers
  where booking_id = p_booking_id;

  insert into public.booking_containers (
    booking_id, container_type, quantity, notes
  )
  select
    p_booking_id,
    btrim(value->>'container_type'),
    coalesce((value->>'quantity')::integer, 1),
    nullif(value->>'notes', '')
  from jsonb_array_elements(coalesce(p_containers, '[]'::jsonb));

  get diagnostics v_count = row_count;

  return query select p_booking_id, v_count;
end;
$$;

create or replace function public.replace_bl_containers(
  p_bl_id uuid,
  p_containers jsonb default '[]'::jsonb
)
returns table (
  bl_id uuid,
  containers_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
begin
  if v_user_id is null
    or not public.can_manage_operations()
    or not public.can_access_bill_of_lading(p_bl_id) then
    raise exception 'No tienes permiso para reemplazar contenedores del BL'
      using errcode = '42501';
  end if;

  perform 1
  from public.bills_of_lading bl
  where bl.id = p_bl_id
  for update;

  if not found then
    raise exception 'El BL no existe';
  end if;

  if jsonb_typeof(coalesce(p_containers, '[]'::jsonb)) <> 'array' then
    raise exception 'Los contenedores deben enviarse como arreglo';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_containers, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_item->>'container_number', v_item->>'container_type', '')), '') is null
      or coalesce((v_item->>'quantity')::integer, 1) <= 0 then
      raise exception 'Los contenedores del BL contienen valores invalidos';
    end if;
  end loop;

  delete from public.bl_containers
  where bl_id = p_bl_id;

  insert into public.bl_containers (
    bl_id, container_number, seal_number, container_type, quantity,
    gross_weight_kg, measurement_cbm, notes
  )
  select
    p_bl_id,
    nullif(value->>'container_number', ''),
    nullif(value->>'seal_number', ''),
    nullif(value->>'container_type', ''),
    coalesce((value->>'quantity')::integer, 1),
    nullif(value->>'gross_weight_kg', '')::numeric,
    nullif(value->>'measurement_cbm', '')::numeric,
    nullif(value->>'notes', '')
  from jsonb_array_elements(coalesce(p_containers, '[]'::jsonb));

  get diagnostics v_count = row_count;

  return query select p_bl_id, v_count;
end;
$$;

revoke all on function public.replace_booking_containers(uuid, jsonb)
  from public, anon;
grant execute on function public.replace_booking_containers(uuid, jsonb)
  to authenticated;

revoke all on function public.replace_bl_containers(uuid, jsonb)
  from public, anon;
grant execute on function public.replace_bl_containers(uuid, jsonb)
  to authenticated;

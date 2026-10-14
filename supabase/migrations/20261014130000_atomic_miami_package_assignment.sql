-- AUD-06: assigning an existing package is a one-time, locked operation.
-- Corrections of confirmed ownership are a separate administrative process.
create function public.guard_miami_assignment_write()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.cliente_id is not null or new.warehouse_number is not null
        or new.assigned_at is not null or new.assigned_by is not null or new.status = 'Asignado' then
        raise exception 'Usa el ingreso o la asignación de paquetes Miami' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.cliente_id is distinct from old.cliente_id
        or new.warehouse_number is distinct from old.warehouse_number
        or new.assigned_at is distinct from old.assigned_at
        or new.assigned_by is distinct from old.assigned_by
        or (new.status = 'Asignado' and new.status is distinct from old.status) then
        raise exception 'La asignación debe registrarse desde su acción autorizada' using errcode = '42501';
      end if;
    elsif old.cliente_id is not null or old.warehouse_number is not null then
      raise exception 'No se puede borrar una asignación confirmada desde el cliente' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_miami_assignment_write() from public, anon, authenticated;
create trigger guard_miami_assignment_write before insert or update or delete on public.miami_packages
for each row execute function public.guard_miami_assignment_write();

create function public.assign_miami_package_internal(
  p_package_id uuid, p_cliente_id uuid, p_expected_manifest_id uuid,
  p_source text
)
returns public.miami_packages language plpgsql security definer set search_path = public as $$
declare
  v_package public.miami_packages%rowtype;
  v_result public.miami_packages%rowtype;
  v_client_name text;
  v_wh text;
  v_tenant uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant is null or not public.is_admin_or_operations()
    or not public.is_approved_active_user() then
    raise exception 'Solo Administración u Operaciones pueden asignar paquetes Miami' using errcode = '42501';
  end if;
  -- Same parent -> package lock order as scan/delete manifest functions.
  -- A closed manifest can still have packages awaiting client assignment.
  if p_expected_manifest_id is not null then
    perform 1 from public.miami_manifests where id = p_expected_manifest_id and tenant_id = v_tenant for update;
    if not found then raise exception 'Manifiesto no disponible. Actualiza la lista' using errcode = 'PT409'; end if;
  end if;
  select mp.* into v_package from public.miami_packages mp
    where mp.id = p_package_id and mp.tenant_id = v_tenant for update;
  if not found then raise exception 'Paquete no disponible' using errcode = '42501'; end if;
  if v_package.manifest_id is distinct from p_expected_manifest_id
    or v_package.status <> 'Sin asignar' or v_package.warehouse_number is not null
    or v_package.assigned_at is not null or v_package.assigned_by is not null
    or (v_package.cliente_id is not null and v_package.cliente_id is distinct from p_cliente_id)
    or v_package.cargo_status <> 'Recibido en Miami'
    or exists (select 1 from public.miami_shipment_packages where package_id = p_package_id) then
    raise exception 'El paquete ya fue asignado o procesado. Actualiza la lista antes de continuar' using errcode = 'PT409';
  end if;
  select c.nombre into v_client_name from public.clientes c
    where c.id = p_cliente_id and c.tenant_id = v_tenant and c.deleted_at is null for share;
  if not found then raise exception 'Cliente no disponible para esta empresa' using errcode = '42501'; end if;
  v_wh := public.next_warehouse_number();
  if nullif(btrim(v_wh), '') is null then
    raise exception 'No se pudo generar el número de bodega' using errcode = '23514';
  end if;
  update public.miami_packages set cliente_id = p_cliente_id, warehouse_number = v_wh,
    status = 'Asignado', assigned_at = clock_timestamp(), assigned_by = auth.uid()
    where id = p_package_id returning * into v_result;
  insert into public.miami_package_events
    (tenant_id, package_id, event_type, old_status, new_status, created_by, metadata)
  values (v_tenant, p_package_id, 'assignment', v_package.status, 'Asignado', auth.uid(),
    jsonb_build_object('source', p_source, 'cliente_id', p_cliente_id, 'cliente_nombre', v_client_name,
      'warehouse_number', v_wh, 'manifest_id', p_expected_manifest_id));
  insert into public.client_notifications
    (tenant_id, profile_id, title, body, type, entity_type, entity_id)
  select v_tenant, p.id, 'Paquete recibido en bodega',
    'Tu paquete ' || v_result.tracking_number || ' llegó a bodega Miami. Número asignado: ' || v_wh || '.',
    'paquete', 'miami_packages', p_package_id
  from public.profiles p where p.tenant_id = v_tenant and p.cliente_id = p_cliente_id
    and p.rol = 'Cliente' and p.status = 'Aprobado' and p.is_active is true;
  insert into public.activity_logs(tenant_id, user_id, module, action, entity_type, entity_id, description, metadata)
  values (v_tenant, auth.uid(), 'Miami', 'assign_miami_package', 'miami_package', p_package_id,
    'Paquete ' || v_result.tracking_number || ' asignado a ' || v_client_name,
    jsonb_build_object('source', p_source, 'cliente_id', p_cliente_id, 'warehouse_number', v_wh));
  return v_result;
end;
$$;
revoke all on function public.assign_miami_package_internal(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

create function public.assign_miami_package(
  p_package_id uuid, p_cliente_id uuid, p_expected_manifest_id uuid default null
)
returns public.miami_packages language plpgsql security definer set search_path = public as $$
begin
  return public.assign_miami_package_internal(p_package_id, p_cliente_id, p_expected_manifest_id, 'manual');
end;
$$;
revoke all on function public.assign_miami_package(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_miami_package(uuid, uuid, uuid) to authenticated;

-- The package must exist before matching its FK and creating its event. Moving
-- this trigger AFTER INSERT also lets concurrent scans claim a pre-alert once.
drop trigger trg_auto_match_pre_alert on public.miami_packages;
create or replace function public.auto_match_pre_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_alert public.miami_pre_alerts%rowtype;
begin
  if new.cliente_id is not null or new.status <> 'Sin asignar' then return new; end if;
  select pa.* into v_alert from public.miami_pre_alerts pa
    join public.clientes c on c.id = pa.cliente_id and c.tenant_id = pa.tenant_id and c.deleted_at is null
    where pa.tenant_id = new.tenant_id and upper(btrim(pa.tracking_number)) = upper(btrim(new.tracking_number))
      and pa.status = 'Pendiente' order by pa.created_at, pa.id
    limit 1 for update of pa skip locked;
  if not found then return new; end if;
  perform public.assign_miami_package_internal(new.id, v_alert.cliente_id, new.manifest_id, 'pre_alert');
  update public.miami_pre_alerts set status = 'Recibido', matched_package_id = new.id where id = v_alert.id;
  return new;
end;
$$;
revoke all on function public.auto_match_pre_alert() from public, anon, authenticated;
create trigger trg_auto_match_pre_alert after insert on public.miami_packages
for each row execute function public.auto_match_pre_alert();

create function public.receive_miami_package(p_package_data jsonb, p_cliente_id uuid default null)
returns public.miami_packages language plpgsql security definer set search_path = public as $$
declare v_data public.miami_packages%rowtype; v_id uuid; v_result public.miami_packages%rowtype;
begin
  if auth.uid() is null or not public.is_admin_or_operations() or not public.is_approved_active_user() then
    raise exception 'Solo Administración u Operaciones pueden ingresar paquetes Miami' using errcode = '42501';
  end if;
  if p_package_data is null or jsonb_typeof(p_package_data) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_package_data) k where k <> all(array[
      'tracking_number', 'carrier', 'tipo_carga', 'weight_lbs', 'weight_kg', 'length_in', 'width_in', 'height_in', 'description', 'notes'])
  ) then raise exception 'Datos de ingreso inválidos' using errcode = '22023'; end if;
  select * into v_data from jsonb_populate_record(null::public.miami_packages, p_package_data);
  if nullif(btrim(v_data.tracking_number), '') is null then
    raise exception 'El tracking es requerido' using errcode = '22023';
  end if;
  if p_cliente_id is not null then
    perform 1 from public.clientes where id = p_cliente_id and tenant_id = public.current_tenant_id()
      and deleted_at is null for share;
    if not found then raise exception 'Cliente no disponible para esta empresa' using errcode = '42501'; end if;
  end if;
  -- Explicit client skips pre-alert matching; incomplete ownership never leaves
  -- this transaction. The assignment RPC generates the WH/actor/time/audit.
  insert into public.miami_packages(tenant_id, tracking_number, carrier, tipo_carga, weight_lbs, weight_kg,
    length_in, width_in, height_in, description, notes, received_by, status, cliente_id)
  values (public.current_tenant_id(), upper(btrim(v_data.tracking_number)), nullif(btrim(v_data.carrier), ''),
    coalesce(v_data.tipo_carga, 'Paquetería'), v_data.weight_lbs, v_data.weight_kg, v_data.length_in,
    v_data.width_in, v_data.height_in, v_data.description, v_data.notes, auth.uid(), 'Sin asignar', p_cliente_id)
    returning id into v_id;
  if p_cliente_id is not null then
    perform public.assign_miami_package_internal(v_id, p_cliente_id, null, 'receipt');
  end if;
  -- Re-read AFTER INSERT, whose trigger may have auto-assigned the row.
  select * into v_result from public.miami_packages where id = v_id;
  return v_result;
end;
$$;
revoke all on function public.receive_miami_package(jsonb, uuid) from public, anon;
grant execute on function public.receive_miami_package(jsonb, uuid) to authenticated;

create function public.guard_miami_assignment_event()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (tg_op <> 'DELETE' and new.event_type = 'assignment')
      or (tg_op <> 'INSERT' and old.event_type = 'assignment') then
      raise exception 'El evento de asignación se genera desde su acción autorizada' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_miami_assignment_event() from public, anon, authenticated;
create trigger guard_miami_assignment_event before insert or update or delete on public.miami_package_events
for each row execute function public.guard_miami_assignment_event();

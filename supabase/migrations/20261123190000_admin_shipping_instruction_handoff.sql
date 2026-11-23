-- FLOW-ADMIN-BOOKING-01: Admin can submit and accept an SI without changing roles.
-- Keep role, active-user, tenant, optimistic-lock and audit protections.

create or replace function public.save_shipping_instruction_sales_initial(
  p_shipping_instruction_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_submit_to_operations boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.shipping_instructions%rowtype;
  v_changes public.shipping_instructions%rowtype;
  v_new public.shipping_instructions%rowtype;
begin
  if v_user_id is null
     or not public.is_approved_active_user()
     or not public.is_role(array['Admin', 'Ventas']) then
    raise exception 'No autorizado para editar la informacion inicial de la SI'
      using errcode = '42501';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Los cambios deben ser un objeto JSON'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_changes) key_name
    where key_name <> all(array[
      'supplier_name', 'supplier_contact', 'supplier_email',
      'supplier_phone', 'supplier_address', 'sales_observations',
      'special_instructions'
    ])
  ) then
    raise exception 'El formulario contiene campos no editables por Ventas'
      using errcode = '42501';
  end if;

  select si.*
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
    and si.tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.sales_submitted_at is not null
     or coalesce(v_old.shipment_status, '') in ('Finalizado', 'Cancelada')
     or coalesce(v_old.operational_status, '') not in ('Pendiente Validación', 'Asignado')
     or (not public.is_role(array['Admin']) and (
       v_old.created_by is distinct from v_user_id
       or v_old.operational_status is distinct from 'Pendiente Validación'
     )) then
    raise exception 'El expediente ya fue enviado, esta cerrado o no tienes permiso para enviarlo'
      using errcode = '42501';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'SHIPPING_INSTRUCTION_VERSION_CONFLICT: la SI fue actualizada por otro usuario'
      using errcode = '40001';
  end if;

  select *
  into v_changes
  from jsonb_populate_record(v_old, p_changes);

  update public.shipping_instructions si
  set supplier_name = v_changes.supplier_name,
      supplier_contact = v_changes.supplier_contact,
      supplier_email = v_changes.supplier_email,
      supplier_phone = v_changes.supplier_phone,
      supplier_address = v_changes.supplier_address,
      sales_observations = v_changes.sales_observations,
      special_instructions = v_changes.special_instructions,
      sales_submitted_at = case
        when p_submit_to_operations then clock_timestamp()
        else v_old.sales_submitted_at
      end,
      updated_at = clock_timestamp()
  where si.id = v_old.id
  returning * into v_new;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_routing',
    case
      when p_submit_to_operations then 'shipping_instruction_submitted'
      else 'shipping_instruction_sales_initial_saved'
    end,
    'shipping_instruction',
    v_new.id,
    case
      when p_submit_to_operations
        then 'Informacion inicial enviada a Operaciones'
      else 'Informacion inicial guardada por Ventas'
    end,
    jsonb_build_object(
      'routing_number', v_new.routing_number,
      'submitted_to_operations', p_submit_to_operations
    )
  );

  return jsonb_build_object('shipping_instruction', to_jsonb(v_new));
end;
$$;

create or replace function public.accept_shipping_instruction_handoff(
  p_shipping_instruction_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.shipping_instructions%rowtype;
  v_new public.shipping_instructions%rowtype;
begin
  if v_user_id is null
     or not public.can_manage_operations()
     or not public.is_role(array['Admin', 'Operaciones']) then
    raise exception 'Solo Admin u Operaciones pueden aceptar el expediente'
      using errcode = '42501';
  end if;

  select si.*
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
    and si.tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'SHIPPING_INSTRUCTION_VERSION_CONFLICT: la SI fue actualizada por otro usuario'
      using errcode = '40001';
  end if;

  if v_old.sales_submitted_at is null then
    raise exception 'Ventas debe enviar el expediente antes de que Operaciones lo acepte'
      using errcode = '55000';
  end if;

  if coalesce(v_old.shipment_status, '') in ('Finalizado', 'Cancelada')
     or coalesce(v_old.operational_status, '') in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede aceptar una Shipping Instruction cerrada'
      using errcode = '55000';
  end if;

  if v_old.operations_accepted_at is not null then
    if v_old.operations_accepted_by is distinct from v_user_id then
      raise exception 'El expediente ya fue aceptado por otro operativo'
        using errcode = '55000';
    end if;
    return jsonb_build_object('shipping_instruction', to_jsonb(v_old));
  end if;

  if not public.is_role(array['Admin'])
     and v_old.operations_assigned_to is not null
     and v_old.operations_assigned_to is distinct from v_user_id then
    raise exception 'El expediente esta asignado a otro operativo'
      using errcode = '42501';
  end if;

  update public.shipping_instructions si
  set operations_assigned_to = v_user_id,
      operations_accepted_at = clock_timestamp(),
      operations_accepted_by = v_user_id,
      operational_status = case
        when coalesce(si.operational_status, 'Pendiente Validación')
          in ('Pendiente Validación', 'Asignado') then 'Asignado'
        else si.operational_status
      end,
      updated_at = clock_timestamp()
  where si.id = v_old.id
  returning * into v_new;

  update public.shipments shipment
  set assigned_to = v_user_id,
      updated_at = clock_timestamp()
  where shipment.shipping_instruction_id = v_new.id
    and shipment.tenant_id = public.current_tenant_id();

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_routing',
    'shipping_instruction_accepted',
    'shipping_instruction',
    v_new.id,
    format('Operaciones acepto el expediente %s', v_new.routing_number),
    jsonb_build_object(
      'sales_submitted_at', v_new.sales_submitted_at,
      'previous_assigned_to', v_old.operations_assigned_to,
      'accepted_by_admin', public.is_role(array['Admin']),
      'operations_assigned_to', v_new.operations_assigned_to,
      'operations_accepted_at', v_new.operations_accepted_at
    )
  );

  return jsonb_build_object('shipping_instruction', to_jsonb(v_new));
end;
$$;

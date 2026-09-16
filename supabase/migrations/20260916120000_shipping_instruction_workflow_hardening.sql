-- FLOW-027 / SEC-025 / PERF-006
-- Endurece Shipping Instructions sin modificar bookings ni snapshots comerciales.

create or replace function public.can_update_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_shipping_instruction_id is not null
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Operaciones'])
    and exists (
      select 1
      from public.shipping_instructions si
      where si.id = p_shipping_instruction_id
        and si.deleted_at is null
        and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
        and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
    )
$$;

revoke all on function public.can_update_shipping_instruction(uuid)
  from public, anon;
grant execute on function public.can_update_shipping_instruction(uuid)
  to authenticated, service_role;

create or replace function public.list_shipping_instructions(
  p_search text default '',
  p_status text default 'Todos',
  p_assignment text default 'Todos',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_assignment text := coalesce(p_assignment, 'Todos');
  v_pattern text;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_approved_active_user() then
    raise exception 'Se requiere un usuario interno activo y aprobado'
      using errcode = '42501';
  end if;

  if p_page is null or p_page < 1 then
    raise exception 'La pagina debe ser mayor o igual a 1'
      using errcode = '22023';
  end if;

  if p_page_size is null or p_page_size <> all(array[25, 50, 100]) then
    raise exception 'El tamano de pagina debe ser 25, 50 o 100'
      using errcode = '22023';
  end if;

  if char_length(v_search) > 200 then
    raise exception 'La busqueda no puede exceder 200 caracteres'
      using errcode = '22023';
  end if;

  if v_assignment not in (
    'Todos', 'Sin asignar', 'Mis asignados'
  ) then
    raise exception 'Filtro de asignacion invalido'
      using errcode = '22023';
  end if;

  v_pattern := '%' || replace(
    replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';

  with authorized as materialized (
    select
      si.id,
      si.routing_number,
      si.shipment_status,
      si.operational_status,
      si.created_by,
      si.agent_name,
      si.created_at,
      si.operations_assigned_to,
      si.status,
      si.origin_address,
      si.destination_address,
      si.container_qty,
      si.container_type,
      c.nombre as client_name,
      q.quotation_number,
      assigned.nombre as assigned_first_name,
      assigned.apellido as assigned_last_name,
      case
        when nullif(btrim(coalesce(si.shipment_status, '')), '') is not null
          and btrim(si.shipment_status) not in ('Pendiente Validacion', 'Pendiente Validación', 'Validada')
          then btrim(si.shipment_status)
        when btrim(coalesce(si.operational_status, '')) in (
          'Asignado', 'Listo para Booking', 'En Booking'
        ) then btrim(si.operational_status)
        when btrim(coalesce(si.shipment_status, '')) = 'Validada'
          then 'Listo para Booking'
        else coalesce(
          nullif(btrim(coalesce(si.shipment_status, '')), ''),
          nullif(btrim(coalesce(si.operational_status, '')), ''),
          'Pendiente Validación'
        )
      end as fallback_status
    from public.shipping_instructions si
    left join public.clientes c on c.id = si.client_id
    left join public.quotations q on q.id = si.quotation_id
    left join public.profiles assigned on assigned.id = si.operations_assigned_to
    where si.deleted_at is null
      and public.can_select_shipping_instruction(si.id)
  ), status_rows as materialized (
    select
      authorized.*,
      case
        when exists (
          select 1
          from public.bookings b
          where b.shipping_instruction_id = authorized.id
        ) then public.aggregate_shipping_instruction_booking_status(
          authorized.id,
          authorized.fallback_status
        )
        else authorized.fallback_status
      end as display_status
    from authorized
  ), filtered as materialized (
    select *
    from status_rows row_data
    where (
        v_search = ''
        or row_data.routing_number ilike v_pattern escape E'\\'
        or row_data.agent_name ilike v_pattern escape E'\\'
        or row_data.client_name ilike v_pattern escape E'\\'
        or row_data.quotation_number ilike v_pattern escape E'\\'
      )
      and (
        coalesce(p_status, 'Todos') = 'Todos'
        or row_data.display_status = p_status
      )
      and (
        v_assignment = 'Todos'
        or (v_assignment = 'Sin asignar' and row_data.operations_assigned_to is null)
        or (v_assignment = 'Mis asignados' and row_data.operations_assigned_to = auth.uid())
      )
  ), filtered_count as (
    select count(*)::integer as total
    from filtered
  ), paging as (
    select
      filtered_count.total,
      greatest(
        1,
        least(
          p_page,
          greatest(1, ceil(filtered_count.total::numeric / p_page_size)::integer)
        )
      ) as effective_page
    from filtered_count
  ), page_rows as materialized (
    select row_data.*
    from filtered row_data
    order by row_data.created_at desc nulls last, row_data.id desc
    limit p_page_size
    offset ((select effective_page from paging) - 1) * p_page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', row_data.id,
          'routing_number', row_data.routing_number,
          'shipment_status', row_data.shipment_status,
          'operational_status', row_data.operational_status,
          'display_status', row_data.display_status,
          'created_by', row_data.created_by,
          'agent_name', row_data.agent_name,
          'created_at', row_data.created_at,
          'operations_assigned_to', row_data.operations_assigned_to,
          'status', row_data.status,
          'origin_address', row_data.origin_address,
          'destination_address', row_data.destination_address,
          'container_qty', row_data.container_qty,
          'container_type', row_data.container_type,
          'cliente', case
            when row_data.client_name is null then null
            else jsonb_build_object('nombre', row_data.client_name)
          end,
          'quotation', case
            when row_data.quotation_number is null then null
            else jsonb_build_object('quotation_number', row_data.quotation_number)
          end,
          'assigned_user', case
            when row_data.operations_assigned_to is null then null
            else jsonb_build_object(
              'nombre', row_data.assigned_first_name,
              'apellido', row_data.assigned_last_name
            )
          end
        )
        order by row_data.created_at desc nulls last, row_data.id desc
      )
      from page_rows row_data
    ), '[]'::jsonb),
    'total', (select total from paging),
    'page', (select effective_page from paging),
    'page_size', p_page_size,
    'metrics', (
      select jsonb_build_object(
        'total', count(*)::integer,
        'pendientes', count(*) filter (
          where display_status = 'Pendiente Validación'
        )::integer,
        'listos', count(*) filter (
          where display_status = 'Listo para Booking'
        )::integer,
        'en_booking', count(*) filter (
          where display_status in (
            'En Booking', 'Booking Solicitado', 'Booking Confirmado',
            'Parcialmente Confirmado'
          )
        )::integer
      )
      from status_rows
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.list_shipping_instructions(
  text, text, text, integer, integer
) from public, anon;
grant execute on function public.list_shipping_instructions(
  text, text, text, integer, integer
) to authenticated, service_role;

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
     or not public.is_role(array['Ventas']) then
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
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.created_by is distinct from v_user_id
     or v_old.sales_submitted_at is not null
     or v_old.operational_status is distinct from 'Pendiente Validación'
     or coalesce(v_old.shipment_status, '') in ('Finalizado', 'Cancelada') then
    raise exception 'La informacion inicial ya no puede ser editada por Ventas'
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

create or replace function public.save_shipping_instruction_operations_details(
  p_shipping_instruction_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb
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
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para editar la Shipping Instruction'
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
      'supplier_phone', 'supplier_address', 'freight_terms',
      'release_type', 'hbl_freight_visibility', 'printed_at_destination',
      'insurance_requested', 'shipper', 'consignee', 'consignee_tax_id',
      'consignee_address', 'consignee_contact', 'consignee_email',
      'consignee_phone', 'notify_party', 'notify_party_tax_id',
      'notify_party_address', 'notify_party_contact', 'notify_party_email',
      'notify_party_phone', 'sales_observations', 'special_instructions'
    ])
  ) then
    raise exception 'El formulario contiene campos operativos no editables'
      using errcode = '42501';
  end if;

  select si.*
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if coalesce(v_old.shipment_status, '') in ('Finalizado', 'Cancelada')
     or coalesce(v_old.operational_status, '') in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede editar una Shipping Instruction cerrada'
      using errcode = '55000';
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
      freight_terms = v_changes.freight_terms,
      release_type = v_changes.release_type,
      hbl_freight_visibility = v_changes.hbl_freight_visibility,
      printed_at_destination = v_changes.printed_at_destination,
      insurance_requested = v_changes.insurance_requested,
      shipper = v_changes.shipper,
      consignee = v_changes.consignee,
      consignee_tax_id = v_changes.consignee_tax_id,
      consignee_address = v_changes.consignee_address,
      consignee_contact = v_changes.consignee_contact,
      consignee_email = v_changes.consignee_email,
      consignee_phone = v_changes.consignee_phone,
      notify_party = v_changes.notify_party,
      notify_party_tax_id = v_changes.notify_party_tax_id,
      notify_party_address = v_changes.notify_party_address,
      notify_party_contact = v_changes.notify_party_contact,
      notify_party_email = v_changes.notify_party_email,
      notify_party_phone = v_changes.notify_party_phone,
      sales_observations = v_changes.sales_observations,
      special_instructions = v_changes.special_instructions,
      updated_at = clock_timestamp()
  where si.id = v_old.id
  returning * into v_new;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_routing',
    'shipping_instruction_updated',
    'shipping_instruction',
    v_new.id,
    format('Shipping Instructions %s actualizadas', v_new.routing_number),
    jsonb_build_object('updated_by', v_user_id)
  );

  return jsonb_build_object('shipping_instruction', to_jsonb(v_new));
end;
$$;

create or replace function public.validate_shipping_instruction(
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
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para validar la Shipping Instruction'
      using errcode = '42501';
  end if;

  select si.*
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'SHIPPING_INSTRUCTION_VERSION_CONFLICT: la SI fue actualizada por otro usuario'
      using errcode = '40001';
  end if;

  if coalesce(v_old.shipment_status, '') in ('Finalizado', 'Cancelada')
     or coalesce(v_old.operational_status, '') in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede validar una Shipping Instruction cerrada'
      using errcode = '55000';
  end if;

  if coalesce(v_old.shipment_status, 'Pendiente Validación')
       not in ('Pendiente Validación', 'Validada')
     or coalesce(v_old.operational_status, 'Pendiente Validación')
       not in ('Pendiente Validación', 'Asignado', 'Validada') then
    raise exception 'La Shipping Instruction ya avanzo a otra etapa operativa'
      using errcode = '55000';
  end if;

  if nullif(btrim(coalesce(v_old.supplier_name, '')), '') is null
     or nullif(btrim(coalesce(v_old.supplier_contact, '')), '') is null
     or nullif(btrim(coalesce(v_old.supplier_email, '')), '') is null
     or nullif(btrim(coalesce(v_old.supplier_address, '')), '') is null then
    raise exception 'Completa proveedor, contacto, email y direccion antes de validar'
      using errcode = '23514';
  end if;

  update public.shipping_instructions si
  set shipment_status = 'Validada',
      operational_status = 'Listo para Booking',
      validated_at = clock_timestamp(),
      validated_by = v_user_id,
      updated_at = clock_timestamp()
  where si.id = v_old.id
  returning * into v_new;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_routing',
    'shipping_instruction_validated',
    'shipping_instruction',
    v_new.id,
    format('Shipping Instructions %s validadas', v_new.routing_number),
    jsonb_build_object(
      'previous_shipment_status', v_old.shipment_status,
      'previous_operational_status', v_old.operational_status
    )
  );

  return jsonb_build_object('shipping_instruction', to_jsonb(v_new));
end;
$$;

create or replace function public.assign_shipping_instruction(
  p_shipping_instruction_id uuid,
  p_operations_user_id uuid,
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
  v_operational_status text;
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para asignar la Shipping Instruction'
      using errcode = '42501';
  end if;

  if p_operations_user_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.id = p_operations_user_id
      and profile.rol = 'Operaciones'
      and profile.status = 'Aprobado'
      and coalesce(profile.is_active, true) = true
  ) then
    raise exception 'El usuario asignado no es un operativo activo y aprobado'
      using errcode = '23514';
  end if;

  select si.*
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'SHIPPING_INSTRUCTION_VERSION_CONFLICT: la SI fue actualizada por otro usuario'
      using errcode = '40001';
  end if;

  if coalesce(v_old.shipment_status, '') in ('Finalizado', 'Cancelada')
     or coalesce(v_old.operational_status, '') in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede asignar una Shipping Instruction cerrada'
      using errcode = '55000';
  end if;

  if v_old.operations_assigned_to is not distinct from p_operations_user_id then
    return jsonb_build_object('shipping_instruction', to_jsonb(v_old));
  end if;

  v_operational_status := case
    when coalesce(v_old.operational_status, 'Pendiente Validación')
      in ('Pendiente Validación', 'Asignado')
      then case
        when p_operations_user_id is null then 'Pendiente Validación'
        else 'Asignado'
      end
    else v_old.operational_status
  end;

  update public.shipping_instructions si
  set operations_assigned_to = p_operations_user_id,
      operational_status = v_operational_status,
      updated_at = clock_timestamp()
  where si.id = v_old.id
  returning * into v_new;

  update public.shipments shipment
  set assigned_to = p_operations_user_id,
      updated_at = clock_timestamp()
  where shipment.shipping_instruction_id = v_new.id;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_routing',
    'shipping_instruction_assigned',
    'shipping_instruction',
    v_new.id,
    format('Shipping Instructions %s asignadas a operaciones', v_new.routing_number),
    jsonb_build_object(
      'previous_assigned_to', v_old.operations_assigned_to,
      'assigned_to', p_operations_user_id,
      'operational_status', v_new.operational_status
    )
  );

  return jsonb_build_object('shipping_instruction', to_jsonb(v_new));
end;
$$;

create or replace function public.cancel_shipping_instruction(
  p_shipping_instruction_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_old public.shipping_instructions%rowtype;
  v_new public.shipping_instructions%rowtype;
  v_shipment public.shipments%rowtype;
begin
  if v_user_id is null or not public.can_manage_operations() then
    raise exception 'No autorizado para cancelar la Shipping Instruction'
      using errcode = '42501';
  end if;

  if v_reason = '' or char_length(v_reason) > 1000 then
    raise exception 'El motivo de cancelacion es requerido y admite hasta 1000 caracteres'
      using errcode = '22023';
  end if;

  select si.*
  into v_old
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'Shipping Instruction no encontrada'
      using errcode = 'P0002';
  end if;

  if v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'SHIPPING_INSTRUCTION_VERSION_CONFLICT: la SI fue actualizada por otro usuario'
      using errcode = '40001';
  end if;

  if coalesce(v_old.shipment_status, '') = 'Finalizado'
     or coalesce(v_old.operational_status, '') = 'Finalizado' then
    raise exception 'No se puede cancelar una Shipping Instruction finalizada'
      using errcode = '55000';
  end if;

  if coalesce(v_old.shipment_status, '') = 'Cancelada'
     or coalesce(v_old.operational_status, '') = 'Cancelada' then
    raise exception 'La Shipping Instruction ya esta cancelada'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.bookings booking
    where booking.shipping_instruction_id = v_old.id
  ) then
    raise exception 'No se puede cancelar la Shipping Instruction porque ya existen bookings'
      using errcode = '55000';
  end if;

  update public.shipping_instructions si
  set shipment_status = 'Cancelada',
      operational_status = 'Cancelada',
      updated_at = clock_timestamp()
  where si.id = v_old.id
  returning * into v_new;

  update public.shipments shipment
  set operational_status = 'Cancelada',
      closed_at = coalesce(shipment.closed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where shipment.shipping_instruction_id = v_new.id
  returning * into v_shipment;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations_routing',
    'shipping_instruction_cancelled',
    'shipping_instruction',
    v_new.id,
    format('Shipping Instruction %s cancelada', v_new.routing_number),
    jsonb_build_object(
      'routing_number', v_new.routing_number,
      'previous_shipment_status', v_old.shipment_status,
      'previous_operational_status', v_old.operational_status,
      'reason', v_reason,
      'cancelled_by', v_user_id
    )
  );

  perform public.record_operational_event(
    v_new.id,
    null,
    null,
    'OPERATIONAL_NOTE',
    'Shipping Instruction cancelada',
    clock_timestamp(),
    null,
    format(
      'Shipping Instruction %s cancelada. Motivo: %s',
      v_new.routing_number,
      v_reason
    ),
    jsonb_build_object(
      'routing_number', v_new.routing_number,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'shipping_instruction', to_jsonb(v_new),
    'shipment', case
      when v_shipment.id is null then null
      else to_jsonb(v_shipment)
    end
  );
end;
$$;

revoke all on function public.save_shipping_instruction_sales_initial(
  uuid, timestamptz, jsonb, boolean
) from public, anon;
revoke all on function public.save_shipping_instruction_operations_details(
  uuid, timestamptz, jsonb
) from public, anon;
revoke all on function public.validate_shipping_instruction(uuid, timestamptz)
  from public, anon;
revoke all on function public.assign_shipping_instruction(uuid, uuid, timestamptz)
  from public, anon;
revoke all on function public.cancel_shipping_instruction(uuid, timestamptz, text)
  from public, anon;

grant execute on function public.save_shipping_instruction_sales_initial(
  uuid, timestamptz, jsonb, boolean
) to authenticated, service_role;
grant execute on function public.save_shipping_instruction_operations_details(
  uuid, timestamptz, jsonb
) to authenticated, service_role;
grant execute on function public.validate_shipping_instruction(uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.assign_shipping_instruction(uuid, uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.cancel_shipping_instruction(uuid, timestamptz, text)
  to authenticated, service_role;

-- Fase 3: handoff Ventas -> Operaciones y salida verificable a Facturacion.
-- Reutiliza el cierre canonico de shipments; no introduce un segundo estado operativo.

alter table public.shipping_instructions
  add column if not exists operations_accepted_at timestamptz,
  add column if not exists operations_accepted_by uuid
    references public.profiles(id) on delete set null;

alter table public.shipping_instructions
  drop constraint if exists shipping_instructions_operations_acceptance_pair_check;
alter table public.shipping_instructions
  add constraint shipping_instructions_operations_acceptance_pair_check
  check (
    (operations_accepted_at is null and operations_accepted_by is null)
    or (operations_accepted_at is not null and operations_accepted_by is not null)
  );

create index if not exists idx_shipping_instructions_operations_acceptance
  on public.shipping_instructions (operations_accepted_at, operations_assigned_to)
  where deleted_at is null;

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
     or not public.is_role(array['Operaciones']) then
    raise exception 'Solo un usuario de Operaciones puede aceptar el expediente'
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

  if v_old.operations_assigned_to is not null
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
  where shipment.shipping_instruction_id = v_new.id;

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
      'operations_assigned_to', v_new.operations_assigned_to,
      'operations_accepted_at', v_new.operations_accepted_at
    )
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

  if v_old.operations_accepted_at is null
     or v_old.operations_accepted_by is null
     or v_old.operations_assigned_to is distinct from v_old.operations_accepted_by then
    raise exception 'Operaciones debe aceptar formalmente el expediente antes de validarlo'
      using errcode = '55000';
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
    raise exception 'La Shipping Instruction ya avanzo a otra etapa operativa (embarque: %, operativo: %)',
      v_old.shipment_status,
      v_old.operational_status
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
      'previous_operational_status', v_old.operational_status,
      'operations_accepted_by', v_old.operations_accepted_by,
      'operations_accepted_at', v_old.operations_accepted_at
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
      operations_accepted_at = null,
      operations_accepted_by = null,
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
      'acceptance_reset', v_old.operations_accepted_at is not null,
      'operational_status', v_new.operational_status
    )
  );

  return jsonb_build_object('shipping_instruction', to_jsonb(v_new));
end;
$$;

create or replace function public.quotation_operations_complete(
  p_quotation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) > 0
    and bool_and(
      shipment.closed_at is not null
      and shipment.operational_status = 'Finalizado'
    )
  from public.shipments shipment
  join public.shipping_instructions si
    on si.id = shipment.shipping_instruction_id
   and si.deleted_at is null
  where shipment.quotation_id = p_quotation_id
    and shipment.operational_status not in ('Cancelada', 'Cancelado')
$$;

create or replace function public.guard_quotation_financial_validation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.financial_validation_status = 'Validado'
    and (
      tg_op = 'INSERT'
      or old.financial_validation_status is distinct from 'Validado'
    ) then
    if auth.uid() is null
      or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
      raise exception 'Solo Finanzas o Contabilidad puede validar los costos'
        using errcode = '42501';
    end if;

    if new.status is distinct from 'Ganada' then
      raise exception 'Solo una cotizacion ganada puede validarse para facturacion';
    end if;

    if not public.quotation_operations_complete(new.id) then
      raise exception 'Todas las operaciones activas deben estar finalizadas antes de validar costos';
    end if;

    if not exists (
      select 1
      from public.pricing_items pi
      where pi.quotation_id = new.id
        and pi.deleted_at is null
    ) then
      raise exception 'La cotizacion no tiene lineas comerciales para facturar';
    end if;

    if exists (
      select 1
      from public.pricing_items pi
      where pi.quotation_id = new.id
        and pi.deleted_at is null
        and not exists (
          select 1
          from public.provider_invoice_items provider_item
          where provider_item.quotation_id = new.id
            and provider_item.pricing_item_id = pi.id
            and provider_item.deleted_at is null
            and coalesce(nullif(btrim(provider_item.currency), ''), 'USD')
              = coalesce(nullif(btrim(pi.currency), ''), 'USD')
        )
    ) then
      raise exception 'Todos los cargos cotizados deben tener costos de proveedor conciliados';
    end if;

    if exists (
      select 1
      from public.provider_invoice_items provider_item
      left join public.pricing_items pi
        on pi.id = provider_item.pricing_item_id
       and pi.quotation_id = new.id
       and pi.deleted_at is null
      where provider_item.quotation_id = new.id
        and provider_item.deleted_at is null
        and (
          pi.id is null
          or coalesce(nullif(btrim(provider_item.currency), ''), 'USD')
            <> coalesce(nullif(btrim(pi.currency), ''), 'USD')
          or coalesce(provider_item.quantity, 0) <= 0
          or coalesce(provider_item.unit_cost, -1) < 0
          or coalesce(provider_item.total_cost, -1) < 0
          or coalesce(provider_item.tax_amount, -1) < 0
        )
    ) then
      raise exception 'Existen costos de proveedor sin conciliar o con importes invalidos';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_quotation_financial_costs(
  p_quotation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quotation public.quotations%rowtype;
begin
  if v_user_id is null
     or not public.is_approved_active_user()
     or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'Solo Finanzas o Contabilidad puede validar los costos'
      using errcode = '42501';
  end if;

  select quotation.*
  into v_quotation
  from public.quotations quotation
  where quotation.id = p_quotation_id
    and quotation.deleted_at is null
  for update;

  if not found then
    raise exception 'Cotizacion no encontrada'
      using errcode = 'P0002';
  end if;

  if v_quotation.financial_validation_status = 'Validado' then
    return jsonb_build_object('quotation', to_jsonb(v_quotation));
  end if;

  update public.quotations quotation
  set financial_validation_status = 'Validado'
  where quotation.id = v_quotation.id
  returning * into v_quotation;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'cost_validation',
    'quotation_financial_costs_validated',
    'quotation',
    v_quotation.id,
    format('Costos validados para cotizacion %s', v_quotation.quotation_number),
    jsonb_build_object(
      'financial_validation_status', v_quotation.financial_validation_status
    )
  );

  return jsonb_build_object('quotation', to_jsonb(v_quotation));
end;
$$;

create or replace function public.guard_linked_invoice_operations_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quotation_id is not null
     and new.invoice_type = 'Factura'
     and new.status <> 'Anulada'
     and new.deleted_at is null
     and (
       tg_op = 'INSERT'
       or old.quotation_id is distinct from new.quotation_id
       or old.invoice_type is distinct from new.invoice_type
       or old.status = 'Anulada'
       or old.deleted_at is not null
     )
     and not public.quotation_operations_complete(new.quotation_id) then
    raise exception 'No se puede facturar: la operacion vinculada aun no esta finalizada'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_linked_invoice_operations_complete_trigger
  on public.invoices;
create trigger guard_linked_invoice_operations_complete_trigger
before insert or update of quotation_id, invoice_type, status, deleted_at
on public.invoices
for each row execute function public.guard_linked_invoice_operations_complete();

create or replace function public.get_billing_work_queue()
returns table (
  quotation_id uuid,
  quotation_number text,
  client_id uuid,
  client_name text,
  shipment_count integer,
  shipment_numbers text,
  primary_shipping_instruction_id uuid,
  latest_closed_at timestamptz,
  financial_validation_status text,
  currency text,
  estimated_total numeric,
  readiness_code text,
  blocker text,
  next_action text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.is_approved_active_user()
     or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No autorizado para consultar la cola de facturacion'
      using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      q.id,
      q.quotation_number,
      q.cliente_id,
      client.nombre as client_name,
      client.rtn as client_rtn,
      coalesce(q.financial_validation_status, 'Pendiente') as financial_status,
      coalesce(operation.shipment_count, 0) as shipment_count,
      operation.shipment_numbers,
      operation.primary_shipping_instruction_id,
      operation.latest_closed_at,
      coalesce(operation.operations_complete, false) as operations_complete,
      coalesce(pricing.line_count, 0) as line_count,
      pricing.currency_count,
      pricing.currency,
      coalesce(pricing.estimated_total, 0) as estimated_total,
      coalesce(pricing.has_invalid_line, false) as has_invalid_line
    from public.quotations q
    join public.clientes client
      on client.id = q.cliente_id
     and client.deleted_at is null
    left join lateral (
      select
        count(*)::integer as shipment_count,
        string_agg(shipment.shipment_number, ', ' order by shipment.created_at) as shipment_numbers,
        (array_agg(si.id order by shipment.created_at desc, shipment.id desc))[1]
          as primary_shipping_instruction_id,
        max(shipment.closed_at) as latest_closed_at,
        bool_and(
          shipment.closed_at is not null
          and shipment.operational_status = 'Finalizado'
        ) as operations_complete
      from public.shipments shipment
      join public.shipping_instructions si
        on si.id = shipment.shipping_instruction_id
       and si.deleted_at is null
      where shipment.quotation_id = q.id
        and shipment.operational_status not in ('Cancelada', 'Cancelado')
    ) operation on true
    left join lateral (
      select
        count(*)::integer as line_count,
        count(distinct coalesce(nullif(btrim(pi.currency), ''), 'USD'))::integer
          as currency_count,
        min(coalesce(nullif(btrim(pi.currency), ''), 'USD')) as currency,
        sum(
          coalesce(pi.quantity, 0) * coalesce(pi.sale_amount, 0)
          * (1 + case
              when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0) / 100
              else 0
            end)
        ) as estimated_total,
        bool_or(
          nullif(btrim(coalesce(pi.description, '')), '') is null
          or coalesce(pi.quantity, 0) <= 0
          or coalesce(pi.sale_amount, -1) < 0
          or (case
              when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0)
              else 0
            end) not in (0, 15, 18)
        ) as has_invalid_line
      from public.pricing_items pi
      where pi.quotation_id = q.id
        and pi.deleted_at is null
    ) pricing on true
    where q.deleted_at is null
      and q.status = 'Ganada'
      and not exists (
        select 1
        from public.invoices invoice
        where invoice.quotation_id = q.id
          and invoice.invoice_type = 'Factura'
          and invoice.status <> 'Anulada'
          and invoice.deleted_at is null
      )
  ), classified as (
    select
      candidate.*,
      case
        when not candidate.operations_complete then 'OPERATIONS_PENDING'
        when candidate.financial_status <> 'Validado' then 'COSTS_PENDING'
        when nullif(btrim(coalesce(candidate.client_rtn, '')), '') is null then 'CLIENT_DATA_MISSING'
        when candidate.line_count = 0
          or candidate.currency_count <> 1
          or candidate.currency not in ('USD', 'HNL')
          or candidate.has_invalid_line then 'PRICING_INVALID'
        else 'READY_TO_INVOICE'
      end as readiness_code
    from candidates candidate
  )
  select
    classified.id,
    classified.quotation_number,
    classified.cliente_id,
    classified.client_name,
    classified.shipment_count,
    classified.shipment_numbers,
    classified.primary_shipping_instruction_id,
    classified.latest_closed_at,
    classified.financial_status,
    classified.currency,
    classified.estimated_total,
    classified.readiness_code,
    case classified.readiness_code
      when 'OPERATIONS_PENDING' then case
        when classified.shipment_count = 0 then 'La cotizacion aun no tiene una operacion activa.'
        else 'Todas las operaciones activas deben estar finalizadas.'
      end
      when 'COSTS_PENDING' then 'Finanzas debe conciliar y validar los costos.'
      when 'CLIENT_DATA_MISSING' then 'El cliente no tiene RTN registrado.'
      when 'PRICING_INVALID' then 'Las lineas comerciales o su moneda requieren correccion.'
      else null
    end,
    case classified.readiness_code
      when 'OPERATIONS_PENDING' then 'Completar operacion'
      when 'COSTS_PENDING' then 'Validar costos'
      when 'CLIENT_DATA_MISSING' then 'Completar datos fiscales'
      when 'PRICING_INVALID' then 'Corregir Pricing'
      else 'Generar factura'
    end
  from classified
  order by
    case classified.readiness_code
      when 'READY_TO_INVOICE' then 1
      when 'COSTS_PENDING' then 2
      when 'CLIENT_DATA_MISSING' then 3
      when 'PRICING_INVALID' then 4
      else 5
    end,
    classified.latest_closed_at desc nulls last,
    classified.quotation_number;
end;
$$;

revoke all on function public.accept_shipping_instruction_handoff(uuid, timestamptz)
  from public, anon;
revoke all on function public.validate_quotation_financial_costs(uuid)
  from public, anon;
revoke all on function public.quotation_operations_complete(uuid)
  from public, anon;
revoke all on function public.get_billing_work_queue()
  from public, anon;

grant execute on function public.accept_shipping_instruction_handoff(uuid, timestamptz)
  to authenticated;
grant execute on function public.validate_quotation_financial_costs(uuid)
  to authenticated;
grant execute on function public.quotation_operations_complete(uuid)
  to authenticated, service_role;
grant execute on function public.get_billing_work_queue()
  to authenticated;

comment on column public.shipping_instructions.operations_accepted_at is
  'Timestamp del handoff formal aceptado por el operativo asignado.';
comment on function public.quotation_operations_complete(uuid) is
  'Verdadero cuando existe al menos un shipment activo y todos cerraron con el flujo canonico.';
comment on function public.get_billing_work_queue() is
  'Cola derivada de cotizaciones ganadas sin factura activa; no almacena estados paralelos.';

notify pgrst, 'reload schema';

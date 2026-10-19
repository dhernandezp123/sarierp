-- FLOW-037: synchronize SI and canonical shipment customer with the quotation.
-- Keep the existing RPC signature and the carrier/booking synchronization chain.

create or replace function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(
  p_shipping_instruction_id uuid,
  p_reason text default null
)
returns table (
  shipping_instruction_id uuid,
  quotation_id uuid,
  agent_quote_id uuid,
  updated_booking_ids uuid[],
  skipped_bookings jsonb,
  updated_bookings integer,
  skipped_count integer,
  carrier text,
  agent_name text,
  agent_contact text,
  agent_email text,
  etd date,
  estimated_transit_days integer,
  free_days integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
  v_effective_carrier text;
  v_si public.shipping_instructions%rowtype;
  v_quotation public.quotations%rowtype;
  v_shipment public.shipments%rowtype;
  v_quotation_id uuid;
begin
  -- Lock quotation -> SI -> shipment, as in the quotation transition RPC.
  if auth.uid() is null or not public.can_select_shipping_instruction(p_shipping_instruction_id) then
    raise exception 'Shipping Instruction no disponible' using errcode = '42501';
  end if;

  select si.quotation_id into v_quotation_id
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.tenant_id = public.current_tenant_id() and si.deleted_at is null;

  select q.* into v_quotation from public.quotations q
  where q.id = v_quotation_id and q.tenant_id = public.current_tenant_id()
    and q.deleted_at is null for share;
  if not found then
    raise exception 'Cotización no disponible' using errcode = '42501';
  end if;

  perform 1 from public.clientes c
  where c.id = v_quotation.cliente_id and c.tenant_id = v_quotation.tenant_id
    and c.deleted_at is null for share;
  if not found then
    raise exception 'Cliente de cotización no disponible' using errcode = '23514';
  end if;

  select si.* into v_si from public.shipping_instructions si
  where si.id = p_shipping_instruction_id and si.quotation_id = v_quotation.id
    and si.tenant_id = v_quotation.tenant_id and si.deleted_at is null for update;
  if not found then
    raise exception 'Shipping Instruction cambió. Recarga antes de sincronizar' using errcode = '40001';
  end if;

  select s.* into v_shipment from public.shipments s
  where s.shipping_instruction_id = v_si.id and s.quotation_id = v_quotation.id
    and s.tenant_id = v_si.tenant_id for update;
  if not found then
    raise exception 'Shipment canónico no disponible' using errcode = '23514';
  end if;
  if v_shipment.closed_at is not null
    or v_shipment.operational_status in ('Finalizado', 'Cancelada')
    or v_si.shipment_status in ('Finalizado', 'Cancelada')
    or v_si.operational_status in ('Finalizado', 'Cancelada') then
    raise exception 'No se puede sincronizar una operación cerrada o cancelada' using errcode = '23514';
  end if;

  -- Preserve the existing role checks, selected rate, booking exclusions and audit.
  select *
  into v_result
  from public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b_core(
    p_shipping_instruction_id,
    p_reason
  );

  v_effective_carrier := nullif(btrim(coalesce(v_result.carrier, '')), '');

  update public.shipping_instructions si
  set carrier = coalesce(v_effective_carrier, si.carrier),
      client_id = v_quotation.cliente_id,
      updated_at = clock_timestamp()
  where si.id = v_result.shipping_instruction_id
    and si.deleted_at is null;

  -- Customer ownership is a relationship, independent from editable BL parties.
  update public.shipments s
  set client_id = v_quotation.cliente_id, updated_at = clock_timestamp()
  where s.id = v_shipment.id and s.client_id is distinct from v_quotation.cliente_id;

  if v_si.client_id is distinct from v_quotation.cliente_id
    or v_shipment.client_id is distinct from v_quotation.cliente_id then
    insert into public.activity_logs (
      tenant_id, user_id, module, action, entity_type, entity_id, description, metadata
    ) values (
      v_si.tenant_id, auth.uid(), 'operations', 'shipping_instruction_client_synced',
      'shipping_instruction', v_si.id, 'Cliente de SI y shipment sincronizado desde cotización',
      jsonb_build_object('quotation_id', v_quotation.id, 'shipment_id', v_shipment.id,
        'previous_si_client_id', v_si.client_id, 'previous_shipment_client_id', v_shipment.client_id,
        'client_id', v_quotation.cliente_id, 'reason', nullif(btrim(p_reason), ''))
    );
  end if;

  return query select
    v_result.shipping_instruction_id,
    v_result.quotation_id,
    v_result.agent_quote_id,
    v_result.updated_booking_ids,
    v_result.skipped_bookings,
    v_result.updated_bookings,
    v_result.skipped_count,
    v_result.carrier,
    v_result.agent_name,
    v_result.agent_contact,
    v_result.agent_email,
    v_result.etd,
    v_result.estimated_transit_days,
    v_result.free_days;
end;
$$;

revoke all on function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b_core(
  uuid, text
) from public, anon, authenticated;
revoke all on function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(
  uuid, text
) from public, anon, authenticated;

grant execute on function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b_core(
  uuid, text
) to service_role;
grant execute on function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(
  uuid, text
) to service_role;

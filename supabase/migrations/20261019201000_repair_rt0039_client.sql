-- FLOW-037: repair only the verified open RT0039 case, without repricing.
-- Re-running is a no-op; later customer/booking/closure changes prevent repair.
do $$
declare
  v_quotation public.quotations%rowtype;
  v_si public.shipping_instructions%rowtype;
  v_shipment public.shipments%rowtype;
  v_previous_client constant uuid := '96078cfc-f6e9-4945-9306-c6b787aea3d2';
  v_current_client constant uuid := '4e1b8695-aaeb-4e51-9d1c-86d6fa3920d4';
begin
  select q.* into v_quotation from public.quotations q
  where q.id = '9720a5c2-a187-4cca-98ca-439e60095d48'
    and q.quotation_number = 'SARIHN-2610-0340-AP'
    and q.tenant_id = '00000000-0000-4000-8000-000000000001'
    and q.cliente_id = v_current_client and q.status = 'Ganada'
    and q.deleted_at is null for update;
  if not found then return; end if;

  perform 1 from public.clientes c
  where c.id = v_current_client and c.tenant_id = v_quotation.tenant_id
    and c.deleted_at is null for share;
  if not found then return; end if;

  select si.* into v_si from public.shipping_instructions si
  where si.id = '3abede6a-c1a0-43b0-a112-5c38c678c483'
    and si.routing_number = 'RT0039' and si.quotation_id = v_quotation.id
    and si.tenant_id = v_quotation.tenant_id and si.client_id = v_previous_client
    and si.deleted_at is null
    and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
    and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
  for update;
  if not found then return; end if;

  select s.* into v_shipment from public.shipments s
  where s.id = '3abede6a-c1a0-43b0-a112-5c38c678c483'
    and s.shipping_instruction_id = v_si.id and s.quotation_id = v_quotation.id
    and s.tenant_id = v_si.tenant_id and s.client_id = v_previous_client
    and s.closed_at is null and s.operational_status = 'Sin bookings'
  for update;
  if not found then return; end if;

  if exists (select 1 from public.bookings b
    where b.shipping_instruction_id = v_si.id or b.shipment_id = v_shipment.id) then
    return;
  end if;

  update public.shipping_instructions
  set client_id = v_current_client, updated_at = clock_timestamp() where id = v_si.id;
  update public.shipments
  set client_id = v_current_client, updated_at = clock_timestamp() where id = v_shipment.id;

  insert into public.activity_logs (
    tenant_id, user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_si.tenant_id, null, 'operations', 'shipping_instruction_client_backfilled',
    'shipping_instruction', v_si.id, 'Cliente de RT0039 reparado desde cotización',
    jsonb_build_object('quotation_id', v_quotation.id, 'shipment_id', v_shipment.id,
      'previous_si_client_id', v_si.client_id, 'previous_shipment_client_id', v_shipment.client_id,
      'client_id', v_current_client, 'migration', '20261019201000_repair_rt0039_client')
  );
end;
$$;

-- SI insurance is an operational instruction to the agent, independent from
-- whether the customer requested cargo insurance in the commercial quotation.

alter table public.shipping_instructions
  add column if not exists insurance_requested boolean default false;

update public.shipping_instructions si
set insurance_requested = true
from public.quotations q
where si.quotation_id = q.id
  and q.requires_insurance is true
  and si.insurance_requested is distinct from true;

create or replace function public.sync_shipping_instruction_from_selected_agent_quote(
  p_shipping_instruction_id uuid,
  p_reason text default null
)
returns table (
  shipping_instruction_id uuid,
  quotation_id uuid,
  agent_quote_id uuid,
  updated_bookings integer,
  carrier text,
  agent_name text,
  agent_contact text,
  agent_email text,
  etd date,
  estimated_transit_days integer,
  free_days text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_si public.shipping_instructions%rowtype;
  v_agent public.agent_quotes%rowtype;
  v_agent_contact text;
  v_agent_email text;
  v_carrier text;
  v_agent_name text;
  v_etd date;
  v_transit_days integer;
  v_free_days text;
  v_free_days_int integer;
  v_updated_bookings integer := 0;
begin
  if v_user_id is null
    or not (
      public.can_manage_operations()
      or public.can_manage_pricing_catalogs()
    ) then
    raise exception 'No tienes permiso para sincronizar datos operativos'
      using errcode = '42501';
  end if;

  select si.*
  into v_si
  from public.shipping_instructions si
  where si.id = p_shipping_instruction_id
    and si.deleted_at is null
  for update;

  if not found then
    raise exception 'La Shipping Instruction no existe o fue eliminada';
  end if;

  if v_si.quotation_id is null then
    raise exception 'La Shipping Instruction no tiene cotizacion vinculada';
  end if;

  if coalesce(v_si.operational_status, v_si.shipment_status) = 'Cancelada'
    or v_si.shipment_status = 'Finalizado' then
    raise exception 'No se puede sincronizar una Shipping Instruction cancelada o finalizada';
  end if;

  select aq.*
  into v_agent
  from public.agent_quotes aq
  where aq.quotation_id = v_si.quotation_id
    and aq.is_selected is true
    and aq.deleted_at is null
  for update;

  if not found then
    raise exception 'No hay una tarifa seleccionada en Pricing para sincronizar';
  end if;

  select a.contact_name, a.email
  into v_agent_contact, v_agent_email
  from public.agents a
  where a.id = v_agent.agent_id
    and a.deleted_at is null;

  v_carrier := coalesce(nullif(v_agent.carrier, ''), v_si.carrier);
  v_agent_name := coalesce(nullif(v_agent.agente_nombre, ''), v_si.agent_name);
  v_etd := coalesce(v_agent.etd, v_si.etd);
  v_transit_days := case
    when nullif(btrim(coalesce(v_agent.transit_time, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then trunc(v_agent.transit_time::numeric)::integer
    else v_si.estimated_transit_days
  end;
  v_free_days := coalesce(v_agent.free_days_destination::text, v_si.free_days);
  v_free_days_int := case
    when nullif(btrim(coalesce(v_free_days, '')), '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then trunc(v_free_days::numeric)::integer
    else null
  end;

  update public.shipping_instructions si
  set carrier = v_carrier,
      agent_name = v_agent_name,
      agent_contact = coalesce(nullif(v_agent_contact, ''), v_si.agent_contact),
      agent_email = coalesce(nullif(v_agent_email, ''), v_si.agent_email),
      etd = v_etd,
      estimated_transit_days = v_transit_days,
      free_days = v_free_days,
      updated_at = now()
  where si.id = v_si.id;

  update public.bookings b
  set carrier = v_carrier,
      etd = v_etd,
      estimated_transit_days = v_transit_days,
      free_days = v_free_days_int,
      eta = case
        when b.eta is null and v_etd is not null and v_transit_days is not null
          then v_etd + v_transit_days
        else b.eta
      end,
      updated_at = now()
  where b.shipping_instruction_id = v_si.id
    and b.booking_number is null
    and b.carrier_booking is null
    and b.master_bl is null;

  get diagnostics v_updated_bookings = row_count;

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id,
    'operations',
    'shipping_instruction_refreshed_from_pricing',
    'shipping_instruction',
    v_si.id,
    'Shipping Instruction sincronizada con la tarifa seleccionada en Pricing',
    jsonb_build_object(
      'quotation_id', v_si.quotation_id,
      'agent_quote_id', v_agent.id,
      'updated_bookings', v_updated_bookings,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'carrier', v_carrier,
      'etd', v_etd
    )
  );

  return query select
    v_si.id,
    v_si.quotation_id,
    v_agent.id,
    v_updated_bookings,
    v_carrier,
    v_agent_name,
    coalesce(nullif(v_agent_contact, ''), v_si.agent_contact),
    coalesce(nullif(v_agent_email, ''), v_si.agent_email),
    v_etd,
    v_transit_days,
    v_free_days;
end;
$$;

revoke all on function public.sync_shipping_instruction_from_selected_agent_quote(uuid, text)
  from public, anon;
grant execute on function public.sync_shipping_instruction_from_selected_agent_quote(uuid, text)
  to authenticated;

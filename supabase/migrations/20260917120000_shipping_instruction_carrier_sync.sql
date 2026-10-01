-- FLOW-028: la Shipping Instruction debe reflejar el carrier de la tarifa
-- seleccionada, incluso cuando sus bookings confirmados se omiten del repricing.

do $$
begin
  if to_regprocedure(
    'public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b_core(uuid,text)'
  ) is null then
    alter function public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(
      uuid, text
    ) rename to sync_shipping_instruction_from_selected_agent_quote_v2_v4b_core;
  end if;
end;
$$;

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
begin
  select *
  into v_result
  from public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b_core(
    p_shipping_instruction_id,
    p_reason
  );

  v_effective_carrier := nullif(btrim(coalesce(v_result.carrier, '')), '');

  update public.shipping_instructions si
  set carrier = coalesce(v_effective_carrier, si.carrier),
      updated_at = clock_timestamp()
  where si.id = v_result.shipping_instruction_id
    and si.deleted_at is null;

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

-- Reparacion idempotente del caso que revelo la omision. Las condiciones
-- protegen cualquier correccion operativa posterior y no modifican bookings.
do $$
declare
  v_shipping_instruction_id uuid;
  v_quotation_id uuid;
  v_agent_quote_id uuid;
  v_previous_carrier text;
  v_selected_carrier text;
begin
  select
    si.id,
    q.id,
    aq.id,
    si.carrier,
    btrim(aq.carrier)
  into
    v_shipping_instruction_id,
    v_quotation_id,
    v_agent_quote_id,
    v_previous_carrier,
    v_selected_carrier
  from public.shipping_instructions si
  join public.quotations q
    on q.id = si.quotation_id
  join public.agent_quotes aq
    on aq.quotation_id = q.id
   and aq.is_selected is true
   and aq.deleted_at is null
  where q.quotation_number = 'SARIHN-2609-0266-AP'
    and q.deleted_at is null
    and si.reference_number = 'RT0032'
    and si.deleted_at is null
    and upper(btrim(coalesce(si.carrier, ''))) = 'COSCO'
    and upper(btrim(coalesce(aq.carrier, ''))) in ('MSK', 'MAERSK');

  if found and v_previous_carrier is distinct from v_selected_carrier then
    update public.shipping_instructions
    set carrier = v_selected_carrier,
        updated_at = clock_timestamp()
    where id = v_shipping_instruction_id
      and carrier is not distinct from v_previous_carrier;

    if found then
      insert into public.activity_logs (
        user_id,
        module,
        action,
        entity_type,
        entity_id,
        description,
        metadata
      ) values (
        null,
        'operations',
        'shipping_instruction_carrier_backfilled',
        'shipping_instruction',
        v_shipping_instruction_id,
        'Carrier de Shipping Instruction reparado desde la tarifa seleccionada',
        jsonb_build_object(
          'quotation_id', v_quotation_id,
          'agent_quote_id', v_agent_quote_id,
          'previous_carrier', v_previous_carrier,
          'carrier', v_selected_carrier,
          'migration', '20260917120000_shipping_instruction_carrier_sync'
        )
      );
    end if;
  end if;
end;
$$;

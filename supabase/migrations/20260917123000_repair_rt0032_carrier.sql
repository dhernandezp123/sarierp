-- FLOW-028: reparacion puntual de RT0032. La referencia visible no esta
-- persistida en shipping_instructions.reference_number, por lo que se usa el
-- UUID canonico comprobado en Production.

do $$
declare
  v_shipping_instruction_id constant uuid := '62909f82-241e-462b-90f0-f6e89421f4db';
  v_quotation_id uuid;
  v_agent_quote_id uuid;
  v_previous_carrier text;
  v_selected_carrier text;
begin
  select
    q.id,
    aq.id,
    si.carrier,
    btrim(aq.carrier)
  into
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
  where si.id = v_shipping_instruction_id
    and si.deleted_at is null
    and q.quotation_number = 'SARIHN-2609-0266-AP'
    and q.deleted_at is null
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
          'migration', '20260917123000_repair_rt0032_carrier'
        )
      );
    end if;
  end if;
end;
$$;

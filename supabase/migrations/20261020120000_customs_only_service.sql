-- CUS-01: servicio propio de aduanas, entrega opcional y expediente sin booking.
-- No reescribe cotizaciones, snapshots, facturas ni estados históricos.
begin;

alter table public.quotations drop constraint quotations_service_product_check;
alter table public.quotations add constraint quotations_service_product_check check (
  service_product is null or service_product in ('miami_lcl', 'miami_air',
    'other_origin_fcl', 'other_origin_lcl', 'other_origin_air', 'usa_ltl_ftl', 'courier', 'customs_only')
);
insert into public.service_products(tenant_id, value, label, applies_client_rates, active, sort_order)
select id, 'customs_only', 'Servicio de Aduanas', false, true, 80 from public.tenants
on conflict (tenant_id, value) do nothing;

-- Validate both browser RPCs with the same business rules; pure input validation.
create function public.validate_customs_quotation(p_data jsonb, p_items jsonb, p_draft boolean)
returns void language plpgsql set search_path = public as $$
declare sale numeric; cost numeric;
begin
  if coalesce(p_data->>'service_product', '') <> 'customs_only' then return; end if;
  if p_data->>'quote_type' is distinct from 'Aduanas'
    or p_data->>'tipo_transporte' is distinct from 'Aduanas'
    or nullif(p_data->>'incoterm', '') is not null
    or coalesce((p_data->>'requires_insurance')::boolean, false) then
    raise exception 'Servicio de Aduanas no incluye flete, modalidad de transporte ni seguro de carga' using errcode = '23514';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Los cargos deben ser un arreglo' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where
    nullif(btrim(i->>'description'), '') is null
    or coalesce((i->>'quantity')::numeric, 1) <= 0
    or coalesce((i->>'sale_amount')::numeric, 0) < 0
    or coalesce((i->>'cost_amount')::numeric, 0) < 0
    or coalesce((i->>'sale_amount')::numeric, 0)::text in ('NaN','Infinity','-Infinity')
    or coalesce((i->>'cost_amount')::numeric, 0)::text in ('NaN','Infinity','-Infinity')
    or coalesce(i->>'item_type','') <> 'destination_charge') then
    raise exception 'Cargos de aduanas inválidos' using errcode = '23514';
  end if;
  if p_draft then return; end if;
  if nullif(btrim(p_data->>'commodity'), '') is null
    or nullif(btrim(p_data->>'puerto_destino'), '') is null
    or nullif(p_data->>'valid_until', '') is null
    or (p_data->>'valid_until')::date < current_date then
    raise exception 'Completa mercancía, aduana de despacho y vigencia válida' using errcode = '23514';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_items) i
    where i->>'rate_code' = 'customs_service' and (i->>'sale_amount')::numeric > 0) then
    raise exception 'Ingresa los honorarios del servicio de Aduanas' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where i->>'rate_code' = 'customs_delivery')
    and (nullif(btrim(p_data->>'delivery_address'), '') is null
      or not exists (select 1 from jsonb_array_elements(p_items) i
        where i->>'rate_code' = 'customs_delivery' and (i->>'sale_amount')::numeric > 0)) then
    raise exception 'Completa dirección y precio de entrega final' using errcode = '23514';
  end if;
  select sum((i->>'sale_amount')::numeric * coalesce((i->>'quantity')::numeric,1)),
    sum((i->>'cost_amount')::numeric * coalesce((i->>'quantity')::numeric,1))
    into sale,cost from jsonb_array_elements(p_items) i;
  if sale>0 and (sale-cost)/sale<0.05 and nullif(btrim(p_data->>'pricing_notes'),'') is null then
    raise exception 'Justifica el margen menor al 5%% en las notas internas de rentabilidad' using errcode='23514';
  end if;
end;
$$;
revoke all on function public.validate_customs_quotation(jsonb,jsonb,boolean) from public,anon,authenticated;
-- Pure input validation: the INVOKER editor needs EXECUTE; no data is read or written.
grant execute on function public.validate_customs_quotation(jsonb,jsonb,boolean) to authenticated;

-- Preserve the deployed canonical bodies, including PT409 conflicts, won-sale
-- adjustments, pricing locks, RLS, tenant ownership and audit. Fail closed if a
-- previous definition has changed. Cargo requirements remain Miami-specific.
do $$
declare d text; before_text text; after_text text; signature text;
begin
  foreach signature in array array[
    'public.can_write_quotation_pricing(uuid)',
    'public.create_quotation_with_child_lines(jsonb,jsonb,jsonb,jsonb)',
    'public.guard_quotation_initial_state()',
    'public.transition_quotation(uuid,text,bigint,text,text,text,text,boolean)',
    'public.create_shipment_from_quotation(uuid,text)'
  ] loop
    d := pg_get_functiondef(signature::regprocedure);
    before_text := '(''miami_lcl'', ''miami_air'')';
    after_text := '(''miami_lcl'', ''miami_air'', ''customs_only'')';
    if strpos(d, before_text) = 0 then raise exception 'Own-pricing guard missing: %',signature; end if;
    execute replace(d, before_text, after_text);
  end loop;

  d := pg_get_functiondef('public.create_quotation_with_child_lines(jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  before_text := '  return query select * from public.create_quotation_with_child_lines_aud01_internal(';
  after_text := $patch$  if p_quotation_data->>'service_product' = 'customs_only' then
    if jsonb_array_length(p_container_lines) > 0 or jsonb_array_length(p_cargo_lines) > 0 then
      raise exception 'Servicio de Aduanas no utiliza líneas de flete' using errcode = '23514';
    end if;
    perform public.validate_customs_quotation(p_quotation_data, p_pricing_items, v_initial_status = 'Borrador');
    p_quotation_data := p_quotation_data || jsonb_build_object('id', coalesce(nullif(p_quotation_data->>'id','')::uuid, gen_random_uuid()));
  end if;
  return query select * from public.create_quotation_with_child_lines_aud01_internal($patch$;
  if strpos(d,before_text)=0 then raise exception 'Creation entrypoint changed'; end if;
  execute replace(d,before_text,after_text);

  d := pg_get_functiondef('public.create_quotation_with_child_lines(jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  before_text := 'p_container_lines, p_cargo_lines, p_pricing_items);';
  after_text := $patch$p_container_lines, p_cargo_lines, p_pricing_items);
  if p_quotation_data->>'service_product' = 'customs_only' then
    update public.quotations q set total_cost=t.cost, total_sale=t.sale,
      profit_amount=t.sale-t.cost, gp_percentage=case when t.sale>0 then (t.sale-t.cost)/t.sale*100 else 0 end
    from (select coalesce(sum((i->>'cost_amount')::numeric * coalesce((i->>'quantity')::numeric,1)),0) cost,
      coalesce(sum((i->>'sale_amount')::numeric * coalesce((i->>'quantity')::numeric,1)),0) sale
      from jsonb_array_elements(p_pricing_items) i) t
    where q.id=(p_quotation_data->>'id')::uuid;
  end if;$patch$;
  if strpos(d,before_text)=0 then raise exception 'Creation totals point changed'; end if;
  execute replace(d,before_text,after_text);

  d := pg_get_functiondef('public.guard_quotation_transition()'::regprocedure);
  before_text := 'and not public.is_role(array[''Admin'', ''Pricing'']) then';
  after_text := 'and not (public.is_role(array[''Admin'', ''Pricing'']) or (new.service_product = ''customs_only'' and public.is_role(array[''Ventas'']))) then';
  if strpos(d,before_text)=0 then raise exception 'Transition role guard changed'; end if;
  d := replace(d,before_text,after_text);
  before_text := 'and not public.quotation_transition_allowed(old.status, new.status, old.repricing_return_status) then';
  after_text := 'and not (public.quotation_transition_allowed(old.status, new.status, old.repricing_return_status)
      or (new.service_product = ''customs_only'' and old.status = ''Borrador'' and new.status = ''Pricing Aprobado'')) then';
  if strpos(d,before_text)=0 then raise exception 'Transition graph guard changed'; end if;
  execute replace(d,before_text,after_text);

  d := pg_get_functiondef('public.create_shipment_from_quotation(uuid,text)'::regprocedure);
  before_text := 'nullif(btrim(coalesce(v_quotation.origen, '''')), '''')';
  after_text := 'case when v_quotation.service_product=''customs_only'' then v_quotation.puerto_destino else nullif(btrim(coalesce(v_quotation.origen, '''')), '''') end';
  if strpos(d,before_text)=0 then raise exception 'Shipment origin point changed'; end if;
  d := replace(d,before_text,after_text);
  before_text := 'nullif(btrim(coalesce(v_quotation.destino, '''')), '''')';
  after_text := 'case when v_quotation.service_product=''customs_only'' then coalesce(nullif(v_quotation.delivery_address,''''),v_quotation.puerto_destino) else nullif(btrim(coalesce(v_quotation.destino, '''')), '''') end';
  if strpos(d,before_text)=0 then raise exception 'Shipment destination point changed'; end if;
  d := replace(d,before_text,after_text);
  before_text := 'nullif(btrim(coalesce(v_quotation.quote_type, '''')), '''')';
  after_text := 'case when v_quotation.service_product=''customs_only'' then null else nullif(btrim(coalesce(v_quotation.quote_type, '''')), '''') end';
  if strpos(d,before_text)=0 then raise exception 'Shipment container fallback changed'; end if;
  execute replace(d,before_text,after_text);

  d := pg_get_functiondef('public.transition_quotation(uuid,text,bigint,text,text,text,text,boolean)'::regprocedure);
  before_text := 'if not public.is_role(array[''Admin'', ''Pricing'']) then';
  after_text := 'if not (public.is_role(array[''Admin'', ''Pricing'']) or (v_old.service_product = ''customs_only'' and public.is_role(array[''Ventas'']))) then';
  if strpos(d,before_text)=0 then raise exception 'Approval role guard changed'; end if;
  d := replace(d,before_text,after_text);
  before_text := 'and not (v_old.status = ''Pricing Aprobado'' and p_new_status = v_old.status) then';
  after_text := 'and not (v_old.status = ''Pricing Aprobado'' and p_new_status = v_old.status)
    and not (v_old.service_product = ''customs_only'' and v_old.status = ''Borrador'' and p_new_status = ''Pricing Aprobado'') then';
  if strpos(d,before_text)=0 then raise exception 'Approval graph guard changed'; end if;
  d := replace(d,before_text,after_text);
  before_text := '  if v_approval then';
  after_text := $patch$  if v_old.service_product = 'customs_only' and (v_approval or p_new_status in ('Enviada al Cliente','Ganada')) then
    v_reason := coalesce(v_reason,nullif(btrim(v_old.pricing_notes),''));
    perform public.validate_customs_quotation(to_jsonb(v_old),
      coalesce((select jsonb_agg(to_jsonb(i)) from public.pricing_items i where i.quotation_id = p_quotation_id and i.deleted_at is null), '[]'::jsonb), false);
  end if;
  if v_approval then$patch$;
  if strpos(d,before_text)=0 then raise exception 'Approval validation point changed'; end if;
  execute replace(d,before_text,after_text);

  d := pg_get_functiondef('public.save_quotation_edit(uuid,text,jsonb,boolean,jsonb,boolean,jsonb,boolean,jsonb,boolean,bigint,text)'::regprocedure);
  before_text := 'if p_replace_pricing and coalesce(v_new.service_product, '''') not in (''miami_lcl'', ''miami_air'') then';
  after_text := 'if p_replace_pricing and coalesce(v_new.service_product, '''') not in (''miami_lcl'', ''miami_air'', ''customs_only'') then';
  if strpos(d,before_text)=0 then raise exception 'Editor pricing guard changed'; end if;
  d := replace(d,before_text,after_text);
  before_text := '  if p_send_to_pricing then
    perform public.transition_quotation';
  after_text := $patch$  if v_new.service_product = 'customs_only' then
    perform public.validate_customs_quotation(to_jsonb(v_new),
      coalesce((select jsonb_agg(to_jsonb(i)) from public.pricing_items i where i.quotation_id = p_quotation_id and i.deleted_at is null), '[]'::jsonb),
      v_old.status = 'Borrador' and not p_send_to_pricing);
  end if;
  if p_send_to_pricing and v_new.service_product = 'customs_only' then
    perform public.transition_quotation(p_quotation_id, v_old.status, v_old.status_revision, 'Pricing Aprobado', p_repricing_reason);
  elsif p_send_to_pricing then
    perform public.transition_quotation$patch$;
  if strpos(d,before_text)=0 then raise exception 'Editor transition point changed'; end if;
  execute replace(d,before_text,after_text);

  d := pg_get_functiondef('public.derive_shipment_operational_status(uuid)'::regprocedure);
  before_text := 'begin';
  after_text := $patch$begin
  if exists (select 1 from public.shipments where id = p_shipment_id and service_type = 'customs_only') then
    return (select case when operational_status='Cancelada' then 'Cancelado' else operational_status end from public.shipments where id = p_shipment_id);
  end if;$patch$;
  if strpos(d,before_text)=0 then raise exception 'Shipment status function changed'; end if;
  execute replace(d,before_text,after_text);
end;
$$;

-- Repricing keeps the existing revision/audit/return-to-won transaction. A
-- customs file synchronizes its customer and service addresses without an agent.
do $$
declare d text; needle text; replacement text;
begin
  d := pg_get_functiondef('public.transition_quotation(uuid,text,bigint,text,text,text,text,boolean)'::regprocedure);
  needle := 'perform public.sync_shipping_instruction_from_selected_agent_quote_v2(v_si.id, coalesce(v_reason, ''Repricing desde Pricing Comparison''));';
  replacement := $patch$if v_old.service_product = 'customs_only' then
        update public.shipping_instructions set client_id=v_old.cliente_id, updated_at=clock_timestamp(),
          origin_address=case when operational_status in ('Pendiente Validación','En gestión aduanera') then v_old.puerto_destino else origin_address end,
          destination_address=case when operational_status <> 'Entregado' then coalesce(nullif(v_old.delivery_address,''),v_old.puerto_destino) else destination_address end
          where id=v_si.id;
        update public.shipments set client_id=v_old.cliente_id, updated_at=clock_timestamp(),
          origin=case when operational_status in ('Pendiente Validación','En gestión aduanera') then v_old.puerto_destino else origin end,
          destination=case when operational_status <> 'Entregado' then coalesce(nullif(v_old.delivery_address,''),v_old.puerto_destino) else destination end
          where shipping_instruction_id=v_si.id;
      else
        perform public.sync_shipping_instruction_from_selected_agent_quote_v2(v_si.id, coalesce(v_reason, 'Repricing desde Pricing Comparison'));
      end if;$patch$;
  if strpos(d,needle)=0 then raise exception 'Repricing synchronization point changed'; end if;
  execute replace(d,needle,replacement);
end;
$$;

create function public.guard_customs_freight_lines()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.quotations where id=new.quotation_id and service_product='customs_only') then
    raise exception 'Servicio de Aduanas no utiliza tarifas de agente ni líneas de flete' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_customs_freight_lines() from public,anon,authenticated;
create trigger guard_customs_freight_lines before insert or update on public.quotation_containers
for each row execute function public.guard_customs_freight_lines();
create trigger guard_customs_freight_lines before insert or update on public.quotation_cargo_lines
for each row execute function public.guard_customs_freight_lines();
create trigger guard_customs_freight_lines before insert or update on public.agent_quotes
for each row execute function public.guard_customs_freight_lines();

-- Customs quotations cannot inherit international freight or be reclassified
-- after creation (which would otherwise leave agents/bookings attached).
create function public.guard_customs_quotation_shape()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'UPDATE' and (new.service_product = 'customs_only' or old.service_product = 'customs_only')
    and new.service_product is distinct from old.service_product then
    raise exception 'Crea una nueva cotización para cambiar entre aduanas y transporte' using errcode='23514';
  end if;
  if new.service_product = 'customs_only' then
    if tg_op = 'INSERT' and new.status = 'Pricing Aprobado' then
      new.pricing_approved := true;
      new.pricing_approved_at := clock_timestamp();
      new.pricing_approved_by := auth.uid();
    end if;
    if new.quote_type is distinct from 'Aduanas' or new.tipo_transporte is distinct from 'Aduanas'
      or nullif(new.incoterm,'') is not null or coalesce(new.requires_insurance,false)
      or coalesce(new.container_qty,0) <> 0 or nullif(new.container_type,'') is not null then
      raise exception 'Servicio de Aduanas no utiliza contenedores, incoterm ni seguro de flete' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_customs_quotation_shape() from public,anon,authenticated;
create trigger guard_customs_quotation_shape before insert or update on public.quotations
for each row execute function public.guard_customs_quotation_shape();

create function public.initialize_customs_shipment()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.service_type = 'customs_only' then
    new.operational_status := 'Pendiente Validación';
    new.requires_hbl := false;
  end if;
  return new;
end;
$$;
revoke all on function public.initialize_customs_shipment() from public,anon,authenticated;
create trigger initialize_customs_shipment before insert on public.shipments
for each row execute function public.initialize_customs_shipment();

-- A zero external cost for the company's own honorarium is explicitly checked
-- by Finance. All other lines retain supplier reconciliation; no fake invoice.
do $$
declare d text; needle text;
begin
  d := pg_get_functiondef('public.guard_quotation_financial_validation()'::regprocedure);
  needle := 'and not exists (
          select 1
          from public.provider_invoice_items provider_item';
  if strpos(d,needle)=0 then raise exception 'Financial reconciliation guard changed'; end if;
  execute replace(d,needle,'and not (coalesce(new.service_product,'''') = ''customs_only'' and coalesce(pi.rate_code,'''') = ''customs_service'' and coalesce(pi.cost_amount,-1) = 0)
        '||needle);
end;
$$;

-- Existing SI/shipment IDs, customer ownership and financial closure stay canonical.
-- These additional operational states apply only to the customs service RPC.
alter table public.shipping_instructions drop constraint shipping_instructions_operational_status_check;
alter table public.shipping_instructions add constraint shipping_instructions_operational_status_check check (
  operational_status is null or operational_status in ('Pendiente Validación','Validada','Asignado',
    'Listo para Booking','En Booking','Booking Solicitado','Booking Confirmado','Documentación Pendiente',
    'Listo para Embarque','Embarcado','En Tránsito','Arribado','Finalizado','Cancelada',
    'En gestión aduanera','Liberado','Entregado')
);

create function public.advance_customs_service(p_shipping_instruction_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_notes text)
returns void language plpgsql security definer set search_path=public as $$
declare si public.shipping_instructions%rowtype; s public.shipments%rowtype;
  q public.quotations%rowtype; expected text; delivery boolean;
begin
  if auth.uid() is null or not public.is_approved_active_user()
    or not public.is_role(array['Admin','Operaciones']) then
    raise exception 'Solo Operaciones puede avanzar el servicio' using errcode='42501';
  end if;
  select quotation.* into q from public.quotations quotation
    join public.shipping_instructions i on i.quotation_id=quotation.id and i.tenant_id=quotation.tenant_id
    where i.id=p_shipping_instruction_id and i.tenant_id=public.current_tenant_id()
      and quotation.deleted_at is null for share of quotation;
  if not found or q.service_product <> 'customs_only' or q.status <> 'Ganada' then
    raise exception 'Servicio de Aduanas no disponible' using errcode='42501';
  end if;
  select * into si from public.shipping_instructions where id=p_shipping_instruction_id
    and tenant_id=public.current_tenant_id() and deleted_at is null for update;
  if not found or not public.can_select_shipping_instruction(si.id) then
    raise exception 'Expediente no disponible' using errcode='42501';
  end if;
  if si.updated_at is distinct from p_expected_updated_at then
    raise exception 'El expediente cambió. Recarga antes de continuar' using errcode='PT409';
  end if;
  select * into s from public.shipments where shipping_instruction_id=si.id and tenant_id=si.tenant_id for update;
  if not found or s.closed_at is not null or exists(select 1 from public.bookings where shipment_id=s.id) then
    raise exception 'El expediente está cerrado o contiene bookings' using errcode='23514';
  end if;
  if si.operations_assigned_to is not null and si.operations_assigned_to <> auth.uid()
    and not public.is_role(array['Admin']) then
    raise exception 'El expediente está asignado a otro operativo' using errcode='42501';
  end if;
  if nullif(btrim(p_notes),'') is null then
    raise exception 'Registra la evidencia o referencia de la gestión' using errcode='23514';
  end if;
  select exists(select 1 from public.pricing_items where quotation_id=q.id and deleted_at is null
    and rate_code='customs_delivery' and sale_amount>0) into delivery;
  expected := case si.operational_status
    when 'Pendiente Validación' then 'En gestión aduanera'
    when 'En gestión aduanera' then 'Liberado'
    when 'Liberado' then case when delivery then 'Entregado' else 'Finalizado' end
    when 'Entregado' then 'Finalizado' end;
  if (expected is null or p_next_status is distinct from expected) and
    not (p_next_status='Cancelada' and si.operational_status not in ('Finalizado','Cancelada')) then
    raise exception 'Transición de aduanas no permitida' using errcode='23514';
  end if;
  update public.shipping_instructions set operational_status=p_next_status,
    shipment_status=case when p_next_status in ('Finalizado','Cancelada') then p_next_status else shipment_status end,
    operations_assigned_to=coalesce(operations_assigned_to,auth.uid()),
    operations_accepted_by=coalesce(operations_accepted_by,auth.uid()),
    operations_accepted_at=coalesce(operations_accepted_at,clock_timestamp()),
    sales_submitted_at=coalesce(sales_submitted_at,clock_timestamp()), updated_at=clock_timestamp()
    where id=si.id;
  update public.shipments set service_type='customs_only', requires_hbl=false, operational_status=p_next_status,
    assigned_to=coalesce(assigned_to,auth.uid()),
    closed_at=case when p_next_status in ('Finalizado','Cancelada') then clock_timestamp() else null end,
    updated_at=clock_timestamp() where id=s.id;
  insert into public.operational_events(tenant_id,shipment_id,shipping_instruction_id,event_code,event_label,
    occurred_at,notes,source_system,created_by,metadata)
  values(si.tenant_id,s.id,si.id,case p_next_status when 'Liberado' then 'CUSTOMS_RELEASED'
    when 'Entregado' then 'DELIVERED' else 'OPERATIONAL_NOTE' end,p_next_status,
    clock_timestamp(),btrim(p_notes),'transition',auth.uid(),jsonb_build_object('service_product','customs_only'));
  insert into public.activity_logs(tenant_id,user_id,module,action,entity_type,entity_id,description,metadata)
  values(si.tenant_id,auth.uid(),'operations','customs_service_advanced','shipping_instruction',si.id,
    'Servicio de Aduanas: '||p_next_status,jsonb_build_object('old_status',si.operational_status,'new_status',p_next_status,'notes',btrim(p_notes)));
end;
$$;
revoke all on function public.advance_customs_service(uuid,timestamptz,text,text) from public,anon;
grant execute on function public.advance_customs_service(uuid,timestamptz,text,text) to authenticated;

-- Do not let direct booking URLs fabricate freight for a customs-only service.
create function public.guard_customs_booking()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.shipping_instructions si join public.quotations q
    on q.id=si.quotation_id and q.tenant_id=si.tenant_id
    where si.id=new.shipping_instruction_id and q.service_product='customs_only') then
    raise exception 'El servicio de Aduanas se gestiona sin booking' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_customs_booking() from public,anon,authenticated;
create trigger guard_customs_booking before insert or update on public.bookings
for each row execute function public.guard_customs_booking();

create function public.guard_customs_operational_state()
returns trigger language plpgsql security invoker set search_path=public as $$
declare customs boolean;
begin
  select coalesce(q.service_product='customs_only',false) into customs from public.quotations q where q.id=new.quotation_id;
  if new.operational_status in ('En gestión aduanera','Liberado','Entregado') and not coalesce(customs,false) then
    raise exception 'Los estados de aduanas requieren un Servicio de Aduanas' using errcode='23514';
  end if;
  if coalesce(customs,false) and tg_op='UPDATE' and current_user in ('authenticated','anon') then
    if new.operational_status is distinct from old.operational_status then
      raise exception 'Avanza el Servicio de Aduanas desde su expediente' using errcode='42501';
    end if;
    if tg_table_name='shipments' then
      if new.closed_at is distinct from old.closed_at then
        raise exception 'Cierra el Servicio de Aduanas desde su expediente' using errcode='42501';
      end if;
    elsif new.shipment_status is distinct from old.shipment_status then
      raise exception 'Avanza el Servicio de Aduanas desde su expediente' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_customs_operational_state() from public,anon,authenticated;
create trigger guard_customs_operational_state before insert or update on public.shipping_instructions
for each row execute function public.guard_customs_operational_state();
create trigger guard_customs_operational_state before insert or update on public.shipments
for each row execute function public.guard_customs_operational_state();

notify pgrst,'reload schema';
commit;

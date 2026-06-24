-- Fase 5: selección de tarifa y regeneración de pricing en una transacción.

create or replace function public.select_agent_quote_and_replace_pricing(
  p_quotation_id uuid,
  p_agent_quote_id uuid,
  p_pricing_lines jsonb,
  p_reason text
)
returns table (
  agent_quote_id uuid,
  valid_until date,
  preferred_carrier text,
  transit_time text,
  transshipment text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.quotations%rowtype;
  v_agent public.agent_quotes%rowtype;
  v_line jsonb;
  v_description text;
  v_quantity numeric;
  v_cost numeric;
  v_sale numeric;
  v_tax numeric;
  v_total numeric;
begin
  if v_user_id is null or not public.can_manage_pricing_catalogs() then
    raise exception 'No tienes permiso para seleccionar tarifas'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El motivo del cambio es obligatorio';
  end if;

  if jsonb_typeof(p_pricing_lines) <> 'array'
    or jsonb_array_length(p_pricing_lines) = 0 then
    raise exception 'La tarifa debe generar al menos una línea de pricing';
  end if;

  select * into v_quote
  from public.quotations
  where id = p_quotation_id and deleted_at is null
  for update;

  if not found then raise exception 'La cotización no existe o fue eliminada'; end if;

  select * into v_agent
  from public.agent_quotes
  where id = p_agent_quote_id
    and quotation_id = p_quotation_id
  for update;

  if not found then
    raise exception 'La tarifa no pertenece a la cotización';
  end if;

  for v_line in select value from jsonb_array_elements(p_pricing_lines)
  loop
    v_description := btrim(coalesce(v_line->>'description', ''));
    v_quantity := coalesce((v_line->>'quantity')::numeric, 0);
    v_cost := coalesce((v_line->>'cost_amount')::numeric, 0);
    v_sale := coalesce((v_line->>'sale_amount')::numeric, 0);
    v_tax := coalesce((v_line->>'tax_amount')::numeric, 0);
    v_total := coalesce((v_line->>'total_amount')::numeric, v_sale * v_quantity + v_tax);

    if v_description = '' or v_quantity <= 0
      or v_cost < 0 or v_sale < 0 or v_tax < 0 or v_total < 0 then
      raise exception 'Las líneas de pricing contienen valores inválidos';
    end if;
  end loop;

  delete from public.pricing_items where quotation_id = p_quotation_id;

  update public.agent_quotes
  set is_selected = (id = p_agent_quote_id)
  where quotation_id = p_quotation_id;

  update public.quotations
  set valid_until = coalesce(v_agent.valid_until, v_quote.valid_until),
      preferred_carrier = coalesce(v_agent.carrier, v_quote.preferred_carrier),
      transit_time = coalesce(v_agent.transit_time, v_quote.transit_time),
      transshipment = coalesce(v_agent.transshipment, v_quote.transshipment)
  where id = p_quotation_id;

  insert into public.pricing_items (
    quotation_id, item_type, description, cost_amount, sale_amount,
    quantity, taxable, tax_rate, tax_amount, total_amount, currency,
    supplier, notes, rate_code, created_by
  )
  select
    p_quotation_id,
    coalesce(nullif(value->>'item_type', ''), 'Otro'),
    btrim(value->>'description'),
    coalesce((value->>'cost_amount')::numeric, 0),
    coalesce((value->>'sale_amount')::numeric, 0),
    coalesce((value->>'quantity')::numeric, 1),
    coalesce((value->>'taxable')::boolean, false),
    coalesce((value->>'tax_rate')::numeric, 0),
    coalesce((value->>'tax_amount')::numeric, 0),
    coalesce(
      (value->>'total_amount')::numeric,
      coalesce((value->>'sale_amount')::numeric, 0)
        * coalesce((value->>'quantity')::numeric, 1)
        + coalesce((value->>'tax_amount')::numeric, 0)
    ),
    coalesce(nullif(value->>'currency', ''), 'USD'),
    nullif(value->>'supplier', ''),
    nullif(value->>'notes', ''),
    nullif(value->>'rate_code', ''),
    v_user_id
  from jsonb_array_elements(p_pricing_lines);

  insert into public.activity_logs (
    user_id, module, action, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, 'pricing', 'agent_quote_selected', 'quotation', p_quotation_id,
    'Tarifa seleccionada y pricing regenerado para '
      || coalesce(v_quote.quotation_number, p_quotation_id::text),
    jsonb_build_object(
      'agent_quote_id', p_agent_quote_id,
      'reason', btrim(p_reason),
      'pricing_lines', jsonb_array_length(p_pricing_lines)
    )
  );

  return query select
    v_agent.id,
    coalesce(v_agent.valid_until, v_quote.valid_until),
    coalesce(v_agent.carrier, v_quote.preferred_carrier),
    coalesce(v_agent.transit_time, v_quote.transit_time),
    coalesce(v_agent.transshipment, v_quote.transshipment);
end;
$$;

revoke all on function public.select_agent_quote_and_replace_pricing(uuid, uuid, jsonb, text)
  from public, anon;
grant execute on function public.select_agent_quote_and_replace_pricing(uuid, uuid, jsonb, text)
  to authenticated;

create or replace function public.notify_expired_selected_agent_quotes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('notify_expired_selected_agent_quotes')) then
    return;
  end if;

  insert into public.notifications (user_id, title, message, type)
  select
    p.id,
    'Tarifa vencida en cotización activa',
    'La tarifa seleccionada de la cotización '
      || coalesce(q.quotation_number, q.id::text)
      || ' venció el ' || to_char(aq.valid_until, 'DD/MM/YYYY')
      || '. Actualizar antes de continuar.',
    'warning'
  from public.agent_quotes aq
  join public.quotations q on q.id = aq.quotation_id
  cross join public.profiles p
  where aq.valid_until < current_date
    and aq.is_selected is true
    and aq.expiry_notified_at is null
    and q.deleted_at is null
    and q.status in (
      'Pendiente de Fijar Precios', 'Pricing Aprobado',
      'Enviada al Cliente', 'Ganada'
    )
    and p.rol = 'Pricing'
    and p.is_active is true
    and p.status = 'Aprobado';

  update public.agent_quotes aq
  set expiry_notified_at = now()
  from public.quotations q
  where q.id = aq.quotation_id
    and aq.valid_until < current_date
    and aq.is_selected is true
    and aq.expiry_notified_at is null
    and q.deleted_at is null
    and q.status in (
      'Pendiente de Fijar Precios', 'Pricing Aprobado',
      'Enviada al Cliente', 'Ganada'
    );
end;
$$;

revoke all on function public.notify_expired_selected_agent_quotes()
  from public, anon, authenticated;
grant execute on function public.notify_expired_selected_agent_quotes()
  to service_role;

notify pgrst, 'reload schema';

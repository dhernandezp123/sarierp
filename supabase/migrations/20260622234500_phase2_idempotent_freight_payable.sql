-- Fase 2: creación idempotente de la CxP de flete seleccionada.

alter table public.cuentas_pagar
  add column if not exists generation_source text,
  add column if not exists generation_key text;

create unique index if not exists cuentas_pagar_generation_key_unique_idx
  on public.cuentas_pagar (generation_source, generation_key);

create or replace function public.create_freight_account_payable(
  p_quotation_id uuid
)
returns table (
  account_payable_id uuid,
  was_created boolean,
  provider_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_quotation public.quotations%rowtype;
  v_agent_quote public.agent_quotes%rowtype;
  v_provider public.proveedores%rowtype;
  v_provider_count integer;
  v_account_payable_id uuid;
  v_was_created boolean := false;
  v_generation_source constant text := 'quotation_selected_freight';
  v_generation_key text := p_quotation_id::text;
begin
  if v_user_id is null
    or not public.is_role(array['Admin', 'Finanzas', 'Contabilidad']) then
    raise exception 'No tienes permiso para generar cuentas por pagar'
      using errcode = '42501';
  end if;

  select q.*
  into v_quotation
  from public.quotations q
  where q.id = p_quotation_id
    and q.deleted_at is null;

  if not found then
    raise exception 'La cotización no existe o fue eliminada';
  end if;

  if v_quotation.status <> 'Ganada' then
    raise exception 'La cotización debe estar Ganada para generar la cuenta por pagar';
  end if;

  select aq.*
  into v_agent_quote
  from public.agent_quotes aq
  where aq.quotation_id = p_quotation_id
    and aq.is_selected is true
    and aq.deleted_at is null;

  if not found then
    raise exception 'La cotización no tiene una tarifa seleccionada';
  end if;

  if v_agent_quote.agent_id is null then
    raise exception 'La tarifa seleccionada no tiene un agente vinculado';
  end if;

  select count(*)::integer
  into v_provider_count
  from public.proveedores p
  where p.agente_id = v_agent_quote.agent_id
    and p.is_active is true;

  if v_provider_count = 0 then
    raise exception 'El agente seleccionado no tiene un proveedor activo vinculado';
  elsif v_provider_count > 1 then
    raise exception 'El agente seleccionado tiene más de un proveedor activo vinculado';
  end if;

  select p.*
  into v_provider
  from public.proveedores p
  where p.agente_id = v_agent_quote.agent_id
    and p.is_active is true;

  if coalesce(v_agent_quote.costo, 0) <= 0 then
    raise exception 'La tarifa seleccionada debe tener un costo mayor que cero';
  end if;

  insert into public.cuentas_pagar (
    proveedor_id,
    quotation_id,
    descripcion,
    monto,
    moneda,
    fecha_factura,
    fecha_vencimiento,
    notas,
    created_by,
    generation_source,
    generation_key
  )
  values (
    v_provider.id,
    v_quotation.id,
    'Flete - ' || coalesce(v_quotation.quotation_number, v_quotation.id::text),
    v_agent_quote.costo,
    coalesce(v_agent_quote.moneda, v_provider.moneda, 'USD'),
    current_date,
    current_date + coalesce(v_provider.terminos_pago, 30),
    'Generado desde cotización '
      || coalesce(v_quotation.quotation_number, v_quotation.id::text),
    v_user_id,
    v_generation_source,
    v_generation_key
  )
  on conflict (generation_source, generation_key) do nothing
  returning id into v_account_payable_id;

  if v_account_payable_id is not null then
    v_was_created := true;
  else
    select cp.id
    into v_account_payable_id
    from public.cuentas_pagar cp
    where cp.generation_source = v_generation_source
      and cp.generation_key = v_generation_key;
  end if;

  return query
  select v_account_payable_id, v_was_created, v_provider.nombre;
end;
$$;

revoke all on function public.create_freight_account_payable(uuid)
  from public, anon;
grant execute on function public.create_freight_account_payable(uuid)
  to authenticated;

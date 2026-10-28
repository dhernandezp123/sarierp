-- Fase 5: adapta la idempotencia de la cuenta por pagar de flete al indice
-- parcial por tenant, sin cambiar el contrato de la RPC publica.

create or replace function public.create_freight_account_payable_tenant_internal(
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
  v_tenant_id uuid := public.current_tenant_id();
  v_quotation public.quotations%rowtype;
  v_agent_quote public.agent_quotes%rowtype;
  v_provider public.proveedores%rowtype;
  v_provider_count integer;
  v_account_payable_id uuid;
  v_was_created boolean := false;
  v_generation_source constant text := 'quotation_selected_freight';
  v_generation_key text := p_quotation_id::text;
begin
  if v_user_id is null or v_tenant_id is null
    or not public.is_role(array['Admin', 'Finanzas', 'Contabilidad']) then
    raise exception 'No tienes permiso para generar cuentas por pagar'
      using errcode = '42501';
  end if;

  select quotation.*
  into v_quotation
  from public.quotations quotation
  where quotation.id = p_quotation_id
    and quotation.tenant_id = v_tenant_id
    and quotation.deleted_at is null;

  if not found then
    raise exception 'La cotizacion no existe o fue eliminada';
  end if;
  if v_quotation.status <> 'Ganada' then
    raise exception 'La cotizacion debe estar Ganada para generar la cuenta por pagar';
  end if;

  select quote.*
  into v_agent_quote
  from public.agent_quotes quote
  where quote.quotation_id = p_quotation_id
    and quote.tenant_id = v_tenant_id
    and quote.is_selected is true
    and quote.deleted_at is null;

  if not found then
    raise exception 'La cotizacion no tiene una tarifa seleccionada';
  end if;
  if v_agent_quote.agent_id is null then
    raise exception 'La tarifa seleccionada no tiene un agente vinculado';
  end if;

  select count(*)::integer
  into v_provider_count
  from public.proveedores provider
  where provider.tenant_id = v_tenant_id
    and provider.agente_id = v_agent_quote.agent_id
    and provider.is_active is true;

  if v_provider_count = 0 then
    raise exception 'El agente seleccionado no tiene un proveedor activo vinculado';
  elsif v_provider_count > 1 then
    raise exception 'El agente seleccionado tiene mas de un proveedor activo vinculado';
  end if;

  select provider.*
  into v_provider
  from public.proveedores provider
  where provider.tenant_id = v_tenant_id
    and provider.agente_id = v_agent_quote.agent_id
    and provider.is_active is true;

  if coalesce(v_agent_quote.costo, 0) <= 0 then
    raise exception 'La tarifa seleccionada debe tener un costo mayor que cero';
  end if;

  insert into public.cuentas_pagar (
    tenant_id, proveedor_id, quotation_id, descripcion, monto, moneda,
    fecha_factura, fecha_vencimiento, notas, created_by,
    generation_source, generation_key
  ) values (
    v_tenant_id, v_provider.id, v_quotation.id,
    'Flete - ' || coalesce(v_quotation.quotation_number, v_quotation.id::text),
    v_agent_quote.costo,
    coalesce(v_agent_quote.moneda, v_provider.moneda, 'USD'),
    current_date,
    current_date + coalesce(v_provider.terminos_pago, 30),
    'Generado desde cotizacion '
      || coalesce(v_quotation.quotation_number, v_quotation.id::text),
    v_user_id,
    v_generation_source,
    v_generation_key
  )
  on conflict do nothing
  returning id into v_account_payable_id;

  if v_account_payable_id is not null then
    v_was_created := true;
  else
    select account.id
    into v_account_payable_id
    from public.cuentas_pagar account
    where account.tenant_id = v_tenant_id
      and account.generation_source = v_generation_source
      and account.generation_key = v_generation_key;
  end if;

  return query
  select v_account_payable_id, v_was_created, v_provider.nombre;
end;
$$;

revoke all on function public.create_freight_account_payable_tenant_internal(uuid)
  from public, anon, authenticated;

comment on function public.create_freight_account_payable_tenant_internal(uuid) is
  'Implementacion atomica interna de CxP con idempotencia acotada por tenant.';

notify pgrst, 'reload schema';

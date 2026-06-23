-- Portal Cliente: exposición controlada de envíos sin abrir tablas internas.

-- Estas políticas nunca deben existir: RLS limita filas, no columnas, y
-- permitirían consultar contactos de agentes/proveedores y notas operativas.
drop policy if exists "quotations_cliente_select" on public.quotations;
drop policy if exists "shipping_instructions_cliente_select" on public.shipping_instructions;

create or replace function public.get_client_shipments(
  p_shipment_id uuid default null,
  p_include_completed boolean default false
)
returns table (
  id uuid,
  routing_number text,
  shipment_status text,
  carrier text,
  etd date,
  eta date,
  actual_etd date,
  actual_eta date,
  vessel_name text,
  voyage text,
  tracking_url text,
  master_bl text,
  house_bl text,
  origin_address text,
  destination_address text,
  freight_terms text,
  created_at timestamptz,
  service_product text,
  origen text,
  destino text,
  quotation_number text,
  commodity text,
  incoterm text,
  peso_kg numeric,
  volumen_cbm numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if auth.uid() is null or not public.is_cliente() then
    raise exception 'Acceso disponible únicamente para clientes autorizados'
      using errcode = '42501';
  end if;

  v_cliente_id := public.current_user_cliente_id();
  if v_cliente_id is null then
    raise exception 'El usuario no está vinculado a un cliente'
      using errcode = '42501';
  end if;

  return query
  select
    si.id,
    si.routing_number,
    si.shipment_status,
    si.carrier,
    si.etd,
    si.eta,
    si.actual_etd,
    si.actual_eta,
    si.vessel_name,
    si.voyage,
    si.tracking_url,
    si.master_bl,
    si.house_bl,
    si.origin_address,
    si.destination_address,
    si.freight_terms,
    si.created_at,
    q.service_product,
    q.origen,
    q.destino,
    q.quotation_number,
    q.commodity,
    q.incoterm,
    q.peso_kg,
    q.volumen_cbm
  from public.shipping_instructions si
  join public.quotations q on q.id = si.quotation_id
  where q.cliente_id = v_cliente_id
    and q.deleted_at is null
    and si.deleted_at is null
    and (p_shipment_id is null or si.id = p_shipment_id)
    and (
      p_include_completed
      or si.shipment_status not in ('Finalizado', 'Cancelada')
    )
  order by si.created_at desc;
end;
$$;

revoke all on function public.get_client_shipments(uuid, boolean)
  from public, anon;
grant execute on function public.get_client_shipments(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';

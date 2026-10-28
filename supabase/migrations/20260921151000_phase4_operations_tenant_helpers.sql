-- Fase 4 SaaS: los helpers SECURITY DEFINER deben filtrar el tenant antes de
-- leer o autorizar. Los guards de fila de la migracion anterior cubren todas
-- las mutaciones, incluidas las ejecutadas por RPC atomicas existentes.

create or replace function public.is_sales_owner_of_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shipping_instructions si
    where si.id = p_shipping_instruction_id
      and si.tenant_id = public.current_tenant_id()
      and si.created_by = auth.uid()
      and public.current_user_role() = 'Ventas'
  )
$$;

create or replace function public.can_insert_shipping_instruction(
  p_quotation_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_quotation_id is null then false
      when p_created_by is distinct from auth.uid() then false
      when not public.is_approved_active_user() then false
      when public.current_tenant_id() is null then false
      when public.is_role(array['Admin', 'Operaciones']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.tenant_id = public.current_tenant_id()
          and q.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.quotations q
        where q.id = p_quotation_id
          and q.tenant_id = public.current_tenant_id()
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;

create or replace function public.can_select_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_shipping_instruction_id is null then false
      when public.current_tenant_id() is null then false
      when not public.is_approved_active_user() then false
      when not exists (
        select 1
        from public.shipping_instructions si
        where si.id = p_shipping_instruction_id
          and si.tenant_id = public.current_tenant_id()
      ) then false
      when public.is_role(array['Admin', 'Operaciones']) then true
      when public.is_role(array['Pricing']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q
          on q.id = si.quotation_id
         and q.tenant_id = si.tenant_id
        where si.id = p_shipping_instruction_id
          and si.tenant_id = public.current_tenant_id()
          and q.deleted_at is null
      )
      when public.is_role(array['Ventas']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q
          on q.id = si.quotation_id
         and q.tenant_id = si.tenant_id
        left join public.clientes c
          on c.id = q.cliente_id
         and c.tenant_id = q.tenant_id
        where si.id = p_shipping_instruction_id
          and si.tenant_id = public.current_tenant_id()
          and q.deleted_at is null
          and (
            si.created_by = auth.uid()
            or q.created_by = auth.uid()
            or c.vendedor_asignado = auth.uid()
          )
      )
      when public.is_role(array['Contabilidad']) then exists (
        select 1
        from public.shipping_instructions si
        join public.quotations q
          on q.id = si.quotation_id
         and q.tenant_id = si.tenant_id
        where si.id = p_shipping_instruction_id
          and si.tenant_id = public.current_tenant_id()
          and q.deleted_at is null
          and q.status = 'Ganada'
      )
      else false
    end
$$;

create or replace function public.can_update_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_shipping_instruction_id is not null
    and public.current_tenant_id() is not null
    and public.is_approved_active_user()
    and public.is_role(array['Admin', 'Operaciones'])
    and exists (
      select 1
      from public.shipping_instructions si
      where si.id = p_shipping_instruction_id
        and si.tenant_id = public.current_tenant_id()
        and si.deleted_at is null
        and coalesce(si.shipment_status, '') not in ('Finalizado', 'Cancelada')
        and coalesce(si.operational_status, '') not in ('Finalizado', 'Cancelada')
    )
$$;

create or replace function public.can_select_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.tenant_id = public.current_tenant_id()
      and (
        public.is_admin_or_operations()
        or public.is_sales_owner_of_shipping_instruction(b.shipping_instruction_id)
      )
  )
$$;

create or replace function public.can_select_shipment(p_shipment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_shipment_id is null then false
    when public.current_tenant_id() is null then false
    when not public.is_approved_active_user() then false
    when not exists (
      select 1
      from public.shipments shipment
      where shipment.id = p_shipment_id
        and shipment.tenant_id = public.current_tenant_id()
    ) then false
    when exists (
      select 1
      from public.shipments shipment
      where shipment.id = p_shipment_id
        and shipment.tenant_id = public.current_tenant_id()
        and shipment.shipping_instruction_id is not null
        and public.can_select_shipping_instruction(shipment.shipping_instruction_id)
    ) then true
    when public.is_role(array['Admin', 'Operaciones']) then true
    when public.is_role(array['Ventas']) then exists (
      select 1
      from public.shipments shipment
      where shipment.id = p_shipment_id
        and shipment.tenant_id = public.current_tenant_id()
        and shipment.created_by = auth.uid()
    )
    when public.is_role(array['Contabilidad', 'Pricing']) then exists (
      select 1
      from public.shipments shipment
      join public.quotations q
        on q.id = shipment.quotation_id
       and q.tenant_id = shipment.tenant_id
      where shipment.id = p_shipment_id
        and shipment.tenant_id = public.current_tenant_id()
        and q.deleted_at is null
    )
    else false
  end
$$;

create or replace function public.can_access_bill_of_lading(p_bl_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_operations()
    and exists (
      select 1
      from public.bills_of_lading bl
      where bl.id = p_bl_id
        and bl.tenant_id = public.current_tenant_id()
    )
$$;

create or replace function public.can_access_miami_package_document(
  p_package_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.miami_packages mp
    where mp.id = p_package_id
      and mp.tenant_id = public.current_tenant_id()
      and (
        public.is_admin_or_operations()
        or (
          public.is_cliente()
          and mp.cliente_id = public.current_user_cliente_id()
        )
      )
  )
$$;

-- Esta funcion estaba expuesta a authenticated y podia revelar la modalidad
-- de un booking conocido por UUID. Se conserva la API y se cierra por tenant.
create or replace function public.booking_operational_mode(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with source as (
    select
      lower(translate(coalesce(q.quote_type, ''), 'áéíóúüñ', 'aeiouun')) as quote_type,
      lower(
        translate(
          concat_ws(' ', q.tipo_transporte, q.service_product, s.service_type),
          'áéíóúüñ',
          'aeiouun'
        )
      ) as context
    from public.bookings b
    join public.shipments s
      on s.id = b.shipment_id
     and s.tenant_id = b.tenant_id
    left join public.quotations q
      on q.id = s.quotation_id
     and q.tenant_id = s.tenant_id
    where b.id = p_booking_id
      and (
        auth.uid() is null
        or b.tenant_id = public.current_tenant_id()
      )
  )
  select case
    when context ~ '(aereo|air|miami_air|courier)' then 'AIR'
    when quote_type = 'ftl' then 'ROAD_FTL'
    when quote_type = 'ltl' then 'ROAD_LTL'
    when quote_type = 'lcl' then 'SEA_LCL'
    when quote_type = 'fcl' then 'SEA_FCL'
    when context ~ '(ftl)' then 'ROAD_FTL'
    when context ~ '(terrestre|road|truck|ltl)' then 'ROAD_LTL'
    when context ~ '(lcl|miami_lcl|consolidado maritimo)' then 'SEA_LCL'
    when context ~ '(fcl|maritima|maritimo|ocean)' then 'SEA_FCL'
    else 'UNKNOWN'
  end
  from source
$$;

-- Cola compartida por Operaciones/Finanzas: la cotizacion raiz limita todos
-- los laterales a la empresa autenticada sin cambiar la clasificacion vigente.
create or replace function public.get_billing_work_queue()
returns table (
  quotation_id uuid,
  quotation_number text,
  client_id uuid,
  client_name text,
  shipment_count integer,
  shipment_numbers text,
  primary_shipping_instruction_id uuid,
  latest_closed_at timestamptz,
  financial_validation_status text,
  currency text,
  estimated_total numeric,
  readiness_code text,
  blocker text,
  next_action text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.current_tenant_id() is null
     or not public.is_approved_active_user()
     or not public.is_role(array['Admin', 'Contabilidad', 'Finanzas']) then
    raise exception 'No autorizado para consultar la cola de facturacion'
      using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      q.id,
      q.quotation_number,
      q.cliente_id,
      client.nombre as client_name,
      client.rtn as client_rtn,
      coalesce(q.financial_validation_status, 'Pendiente') as financial_status,
      coalesce(operation.shipment_count, 0) as shipment_count,
      operation.shipment_numbers,
      operation.primary_shipping_instruction_id,
      operation.latest_closed_at,
      coalesce(operation.operations_complete, false) as operations_complete,
      coalesce(pricing.line_count, 0) as line_count,
      pricing.currency_count,
      pricing.currency,
      coalesce(pricing.estimated_total, 0) as estimated_total,
      coalesce(pricing.has_invalid_line, false) as has_invalid_line
    from public.quotations q
    join public.clientes client
      on client.id = q.cliente_id
     and client.tenant_id = q.tenant_id
     and client.deleted_at is null
    left join lateral (
      select
        count(*)::integer as shipment_count,
        string_agg(shipment.shipment_number, ', ' order by shipment.created_at) as shipment_numbers,
        (array_agg(si.id order by shipment.created_at desc, shipment.id desc))[1]
          as primary_shipping_instruction_id,
        max(shipment.closed_at) as latest_closed_at,
        bool_and(
          shipment.closed_at is not null
          and shipment.operational_status = 'Finalizado'
        ) as operations_complete
      from public.shipments shipment
      join public.shipping_instructions si
        on si.id = shipment.shipping_instruction_id
       and si.tenant_id = shipment.tenant_id
       and si.deleted_at is null
      where shipment.quotation_id = q.id
        and shipment.tenant_id = q.tenant_id
        and shipment.operational_status not in ('Cancelada', 'Cancelado')
    ) operation on true
    left join lateral (
      select
        count(*)::integer as line_count,
        count(distinct coalesce(nullif(btrim(pi.currency), ''), 'USD'))::integer
          as currency_count,
        min(coalesce(nullif(btrim(pi.currency), ''), 'USD')) as currency,
        sum(
          coalesce(pi.quantity, 0) * coalesce(pi.sale_amount, 0)
          * (1 + case
              when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0) / 100
              else 0
            end)
        ) as estimated_total,
        bool_or(
          nullif(btrim(coalesce(pi.description, '')), '') is null
          or coalesce(pi.quantity, 0) <= 0
          or coalesce(pi.sale_amount, -1) < 0
          or (case
              when coalesce(pi.taxable, false) then coalesce(pi.tax_rate, 0)
              else 0
            end) not in (0, 15, 18)
        ) as has_invalid_line
      from public.pricing_items pi
      where pi.quotation_id = q.id
        and pi.tenant_id = q.tenant_id
        and pi.deleted_at is null
    ) pricing on true
    where q.tenant_id = public.current_tenant_id()
      and q.deleted_at is null
      and q.status = 'Ganada'
      and not exists (
        select 1
        from public.invoices invoice
        where invoice.quotation_id = q.id
          and invoice.invoice_type = 'Factura'
          and invoice.status <> 'Anulada'
          and invoice.deleted_at is null
      )
  ), classified as (
    select
      candidate.*,
      case
        when not candidate.operations_complete then 'OPERATIONS_PENDING'
        when candidate.financial_status <> 'Validado' then 'COSTS_PENDING'
        when nullif(btrim(coalesce(candidate.client_rtn, '')), '') is null then 'CLIENT_DATA_MISSING'
        when candidate.line_count = 0
          or candidate.currency_count <> 1
          or candidate.currency not in ('USD', 'HNL')
          or candidate.has_invalid_line then 'PRICING_INVALID'
        else 'READY_TO_INVOICE'
      end as readiness_code
    from candidates candidate
  )
  select
    classified.id,
    classified.quotation_number,
    classified.cliente_id,
    classified.client_name,
    classified.shipment_count,
    classified.shipment_numbers,
    classified.primary_shipping_instruction_id,
    classified.latest_closed_at,
    classified.financial_status,
    classified.currency,
    classified.estimated_total,
    classified.readiness_code,
    case classified.readiness_code
      when 'OPERATIONS_PENDING' then case
        when classified.shipment_count = 0 then 'La cotizacion aun no tiene una operacion activa.'
        else 'Todas las operaciones activas deben estar finalizadas.'
      end
      when 'COSTS_PENDING' then 'Finanzas debe conciliar y validar los costos.'
      when 'CLIENT_DATA_MISSING' then 'El cliente no tiene RTN registrado.'
      when 'PRICING_INVALID' then 'Las lineas comerciales o su moneda requieren correccion.'
      else null
    end,
    case classified.readiness_code
      when 'OPERATIONS_PENDING' then 'Completar operacion'
      when 'COSTS_PENDING' then 'Validar costos'
      when 'CLIENT_DATA_MISSING' then 'Completar datos fiscales'
      when 'PRICING_INVALID' then 'Corregir Pricing'
      else 'Generar factura'
    end
  from classified
  order by
    case classified.readiness_code
      when 'READY_TO_INVOICE' then 1
      when 'COSTS_PENDING' then 2
      when 'CLIENT_DATA_MISSING' then 3
      when 'PRICING_INVALID' then 4
      else 5
    end,
    classified.latest_closed_at desc nulls last,
    classified.quotation_number;
end;
$$;

comment on function public.booking_operational_mode(uuid) is
  'Clasifica modalidad canonica sin revelar bookings de otro tenant.';
comment on function public.get_billing_work_queue() is
  'Cola de facturacion limitada al tenant autenticado.';

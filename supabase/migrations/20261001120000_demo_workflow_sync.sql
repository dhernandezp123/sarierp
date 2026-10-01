-- DEMO-SYNC-001: preserve sandbox semantics after functional upgrades.
do $$
begin
  if not exists (select 1 from public.platform_environment where singleton
    and environment = 'demo' and project_ref = 'wlssekvxpfxhwedsjhpz') then
    raise exception 'This migration only applies to the verified Demo project';
  end if;
end;
$$;

create or replace function public.allocate_internal_hbl_number(p_number_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(
    p_number_date,
    timezone('America/Tegucigalpa', clock_timestamp())::date
  );
  v_prefix text := 'DEMO-HBL-' || to_char(v_date, 'YYYYMMDD') || '-';
  v_existing_max integer;
  v_next integer;
begin
  select coalesce(max(
    case
      when substring(bl.bl_number from char_length(v_prefix) + 1) ~ '^[0-9]+$'
        then substring(bl.bl_number from char_length(v_prefix) + 1)::integer
      else null
    end
  ), 0)
  into v_existing_max
  from public.bills_of_lading bl
  where bl.bl_type = 'HBL'
    and bl.bl_number like v_prefix || '%';

  insert into public.hbl_number_counters as counter (
    number_date,
    last_value,
    updated_at
  ) values (
    v_date,
    v_existing_max + 1,
    clock_timestamp()
  )
  on conflict (number_date) do update
  set last_value = greatest(counter.last_value, excluded.last_value - 1) + 1,
      updated_at = clock_timestamp()
  returning last_value into v_next;

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;

create or replace function public.guard_linked_invoice_operations_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only the armed service-role reset may insert historical demo fixtures.
  if auth.role() = 'service_role' and exists (
    select 1 from public.platform_environment where singleton
      and environment = 'demo' and project_ref = 'wlssekvxpfxhwedsjhpz'
      and reset_enabled and reset_armed_at > clock_timestamp() - interval '5 minutes'
  ) then
    return new;
  end if;
  if new.quotation_id is not null
     and new.invoice_type in ('Factura', 'Proforma')
     and new.status <> 'Anulada'
     and new.deleted_at is null
     and (
       tg_op = 'INSERT'
       or old.quotation_id is distinct from new.quotation_id
       or old.invoice_type is distinct from new.invoice_type
       or old.status = 'Anulada'
       or old.deleted_at is not null
     )
     and not public.quotation_operations_complete(new.quotation_id) then
    raise exception 'No se puede facturar: la operacion vinculada aun no esta finalizada'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

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
       and si.deleted_at is null
      where shipment.quotation_id = q.id
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
        and pi.deleted_at is null
    ) pricing on true
    where q.deleted_at is null
      and q.status = 'Ganada'
      and not exists (
        select 1
        from public.invoices invoice
        where invoice.quotation_id = q.id
          and invoice.invoice_type in ('Factura', 'Proforma')
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

-- Extend the explicit allowlist; keep nonce, project and service-role guards.
create or replace function public.reset_and_seed_demo(
  p_confirmation text,
  p_reset_nonce uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_environment public.platform_environment%rowtype;
  v_actor_profile_id uuid;
  v_now timestamp with time zone := clock_timestamp();
  v_linked_client_profiles integer := 0;
  v_storage_objects_preserved bigint := 0;
  v_storage_buckets_forced_private integer := 0;
  v_error_message text;
  v_error_detail text;
  v_error_state text;
  v_atlas_client_id constant uuid :=
    '10000000-0000-4000-8000-000000000001'::uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo service_role puede ejecutar el reset demo'
      using errcode = '42501';
  end if;

  if p_confirmation is distinct from
    'RESET Y SEMBRAR DEMO wlssekvxpfxhwedsjhpz'
  then
    raise exception 'Confirmacion de reset incorrecta'
      using errcode = '22023';
  end if;

  select pe.*
  into v_environment
  from public.platform_environment pe
  where pe.singleton is true
  for update;

  if not found
    or v_environment.environment <> 'demo'
    or v_environment.project_ref is distinct from 'wlssekvxpfxhwedsjhpz'
  then
    raise exception 'El sentinel no identifica el proyecto demo autorizado'
      using errcode = '42501';
  end if;

  if v_environment.reset_enabled is not true
    or v_environment.reset_nonce is distinct from p_reset_nonce
    or v_environment.reset_armed_at is null
    or v_environment.reset_armed_at < clock_timestamp() - interval '5 minutes'
  then
    raise exception 'El nonce/flag de reset no esta armado o ya vencio'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.cliente_id is not null
      and p.cliente_id <> v_atlas_client_id
  ) then
    raise exception 'Hay perfiles vinculados a clientes distintos de Atlas; se requiere revision manual'
      using errcode = '55000';
  end if;

  select p.id
  into v_actor_profile_id
  from public.profiles p
  where lower(coalesce(p.email, '')) = 'demo-bootstrap@forwarders.app'
    and p.rol = 'Admin'
    and p.status = 'Rechazado'
    and p.is_active is false
    and p.cliente_id is null
    and p.is_demo_user is false
    and p.demo_expires_at is null
    and p.demo_access_grant_id is null
    and p.is_platform_admin is false
  limit 1;

  if v_actor_profile_id is null then
    raise exception 'No existe un perfil que pueda actuar como creador del dataset'
      using errcode = '55000';
  end if;

  begin
    -- Allowlist cerrada. No usa CASCADE ni reinicia secuencias. Una FK futura
    -- que apunte a estas tablas y no este incluida hace fallar la transaccion.
    truncate table
      public.quotation_option_items,
      public.quotation_options,
      public.bl_validation_exceptions,
      public.invoice_payment_splits,
      public.miami_package_documents,
      public.client_email_deliveries,
      public.activity_logs,
      public.agent_quote_container_rates,
      public.agent_quotes,
      public.agent_route_rates,
      public.agents,
      public.bills_of_lading,
      public.bl_amendments,
      public.bl_containers,
      public.bl_draft_sends,
      public.booking_containers,
      public.booking_cutoffs,
      public.booking_documents,
      public.booking_readiness_evaluations,
      public.booking_readiness_exceptions,
      public.booking_readiness_requirements,
      public.booking_schedule_revisions,
      public.bookings,
      public.cai_ranges,
      public.client_addresses,
      public.client_notes,
      public.client_notifications,
      public.client_pickup_requests,
      public.client_rates,
      public.cliente_history,
      public.company_settings,
      public.container_vgm_records,
      public.cost_validations,
      public.cuentas_pagar,
      public.document_sequences,
      public.email_templates,
      public.garantias_navieras,
      public.invoice_items,
      public.invoice_payments,
      public.invoices,
      public.miami_incidencias,
      public.miami_manifests,
      public.miami_package_events,
      public.miami_packages,
      public.miami_pre_alerts,
      public.miami_shipment_packages,
      public.miami_shipments,
      public.notifications,
      public.operational_events,
      public.pagos_proveedor,
      public.pricing_items,
      public.proveedores,
      public.provider_invoice_items,
      public.push_tokens,
      public.quotation_cargo_lines,
      public.quotation_change_logs,
      public.quotation_containers,
      public.quotation_status_history,
      public.quotations,
      public.sales_activities,
      public.shipments,
      public.shipping_instruction_events,
      public.shipping_instructions,
      public.user_tasks;

    update storage.buckets
    set public = false
    where id = any (array[
      'avatars',
      'booking-documents',
      'proveedor-docs',
      'miami-package-photos'
    ])
      and public is true;

    get diagnostics v_storage_buckets_forced_private = row_count;

    delete from public.clientes
    where id <> v_atlas_client_id;

    insert into public.clientes (
      id,
      nombre,
      nit,
      rtn,
      direccion,
      ciudad,
      departamento_estado,
      pais,
      codigo_cliente,
      telefono,
      email_1,
      contacto,
      tipo_persona,
      condicion_pago,
      dias_credito,
      tipo_cliente,
      origen_frecuente,
      asegura_carga,
      seguro_porcentaje,
      preferred_miami_rate_destination,
      observaciones,
      deleted_at,
      deleted_by
    ) values (
      v_atlas_client_id,
      'Atlas Forwarding Demo',
      'DEMO-NO-FISCAL',
      'DEMO-NO-FISCAL',
      'Zona Industrial Demo, Boulevard Logistico',
      'San Pedro Sula',
      'Cortes',
      'Honduras',
      'ATLAS-DEMO',
      '+504 0000-0000',
      'atlas-demo@example.com',
      'Equipo Evaluador',
      'Corporativo',
      'Credito',
      30,
      'Demo',
      'Miami, FL',
      true,
      1.00,
      'SPS',
      'Cliente completamente ficticio. Uso exclusivo del sandbox comercial.',
      null,
      null
    )
    on conflict (id) do update
    set nombre = excluded.nombre,
        nit = excluded.nit,
        rtn = excluded.rtn,
        direccion = excluded.direccion,
        ciudad = excluded.ciudad,
        departamento_estado = excluded.departamento_estado,
        pais = excluded.pais,
        codigo_cliente = excluded.codigo_cliente,
        telefono = excluded.telefono,
        email_1 = excluded.email_1,
        contacto = excluded.contacto,
        tipo_persona = excluded.tipo_persona,
        condicion_pago = excluded.condicion_pago,
        dias_credito = excluded.dias_credito,
        tipo_cliente = excluded.tipo_cliente,
        origen_frecuente = excluded.origen_frecuente,
        asegura_carga = excluded.asegura_carga,
        seguro_porcentaje = excluded.seguro_porcentaje,
        preferred_miami_rate_destination = excluded.preferred_miami_rate_destination,
        observaciones = excluded.observaciones,
        deleted_at = null,
        deleted_by = null;

    update public.profiles
    set cliente_id = v_atlas_client_id
    where is_demo_user is true
      and rol = 'Cliente'
      and lower(coalesce(email, '')) in (
        'demo-cliente-01@forwarders.app',
        'demo-cliente-02@forwarders.app',
        'demo-cliente-03@forwarders.app',
        'demo-cliente-04@forwarders.app',
        'demo-cliente-05@forwarders.app'
      );

    get diagnostics v_linked_client_profiles = row_count;

    insert into public.company_settings (
      id,
      legal_name,
      trade_name,
      rtn,
      address,
      city,
      country,
      phone,
      email,
      website,
      logo_url,
      default_currency,
      default_tax_rate,
      invoice_footer_note,
      exchange_rate_usd_hnl,
      condiciones_bl,
      condiciones_awb,
      condiciones_carta_porte,
      updated_at,
      updated_by
    ) values (
      '12000000-0000-4000-8000-000000000001'::uuid,
      'Atlas Forwarding Demo, S.A.',
      'Atlas Forwarding Demo',
      'DEMO-NO-FISCAL',
      'Direccion ficticia para demostracion comercial',
      'San Pedro Sula',
      'Honduras',
      '+504 0000-0000',
      'demo@forwarders.app',
      'https://forwarders.app',
      null,
      'USD',
      15,
      'DOCUMENTO DEMOSTRATIVO - SIN VALIDEZ FISCAL',
      26.50,
      'Condiciones simuladas para fines de demostracion.',
      'Condiciones simuladas para fines de demostracion.',
      'Condiciones simuladas para fines de demostracion.',
      v_now,
      v_actor_profile_id
    );

    insert into public.email_templates (
      id,
      template_key,
      nombre,
      descripcion,
      asunto,
      cuerpo,
      is_active,
      updated_by
    ) values
    (
      '13000000-0000-4000-8000-000000000001'::uuid,
      'cotizacion_cliente',
      'Cotizacion demo al cliente',
      'Plantilla ficticia del sandbox. No representa una comunicacion enviada.',
      '[DEMO] Cotizacion {{numero_cotizacion}} - Forwarders ERP',
      E'Hola {{cliente}},\n\nAdjuntamos una cotizacion simulada para el recorrido comercial de Forwarders ERP.\n\nReferencia: {{numero_cotizacion}}\nServicio: {{servicio}}\nOrigen: {{origen}}\nDestino: {{destino}}\n\nEste mensaje es demostrativo y no constituye una oferta comercial.\n\n{{cierre}}',
      true,
      v_actor_profile_id
    ),
    (
      '13000000-0000-4000-8000-000000000002'::uuid,
      'seguimiento_cotizacion',
      'Seguimiento de cotizacion demo',
      'Plantilla ficticia para probar el flujo de seguimiento.',
      '[DEMO] Seguimiento {{numero_cotizacion}} - Forwarders ERP',
      E'Hola {{cliente}},\n\nEste es un seguimiento simulado de la referencia {{numero_cotizacion}}.\n\nNo respondas a este mensaje; pertenece al ambiente de demostracion.\n\n{{cierre}}',
      true,
      v_actor_profile_id
    );

    insert into public.agents (
      id,
      name,
      type,
      country,
      city,
      contact_name,
      email,
      phone,
      profit_per_container,
      mbl_fee,
      currency,
      active,
      notes
    ) values
    (
      '20000000-0000-4000-8000-000000000001'::uuid,
      'BlueWave Demo Logistics',
      'Agente',
      'Estados Unidos',
      'Miami',
      'Contacto Ficticio 01',
      'bluewave-demo@example.com',
      '+1 000 000 0000',
      450,
      75,
      'USD',
      true,
      'Proveedor ficticio del dataset Atlas.'
    ),
    (
      '20000000-0000-4000-8000-000000000002'::uuid,
      'Pacific Bridge Demo Cargo',
      'Agente',
      'China',
      'Shanghai',
      'Contacto Ficticio 02',
      'pacific-demo@example.com',
      '+86 000 0000 0000',
      500,
      85,
      'USD',
      true,
      'Alternativa ficticia para comparar tarifas.'
    );

    insert into public.agent_route_rates (
      id,
      agent_id,
      origin,
      destination,
      carrier,
      service_type,
      base_rate,
      currency,
      transit_time,
      transshipment,
      free_days_destination,
      valid_from,
      valid_until,
      notes
    ) values
    (
      '20100000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000001'::uuid,
      'Shanghai, China',
      'Puerto Cortes, Honduras',
      'Demo Ocean Line',
      'FCL 40HC',
      3450,
      'USD',
      28,
      'Cartagena',
      10,
      current_date - 15,
      current_date + 45,
      'Tarifa totalmente ficticia.'
    ),
    (
      '20100000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      'Shanghai, China',
      'Puerto Cortes, Honduras',
      'Atlas Demo Shipping',
      'FCL 40HC',
      3625,
      'USD',
      25,
      'Directo',
      12,
      current_date - 15,
      current_date + 45,
      'Tarifa alternativa ficticia.'
    );

    insert into public.proveedores (
      id,
      nombre,
      tipo,
      rtn,
      email,
      telefono,
      contacto,
      pais,
      moneda,
      terminos_pago,
      agente_id,
      is_active,
      notas
    ) values (
      '21000000-0000-4000-8000-000000000001'::uuid,
      'BlueWave Demo Logistics',
      'Agente',
      'DEMO-NO-FISCAL',
      'bluewave-demo@example.com',
      '+1 000 000 0000',
      'Contacto Ficticio 01',
      'Estados Unidos',
      'USD',
      30,
      '20000000-0000-4000-8000-000000000001'::uuid,
      true,
      'Proveedor ficticio. No realizar pagos ni enviar documentos.'
    );

    insert into public.client_addresses (
      id,
      cliente_id,
      nombre_completo,
      company_name,
      address_line,
      suite,
      city,
      state,
      zip,
      country,
      phone,
      is_active
    ) values (
      '11000000-0000-4000-8000-000000000001'::uuid,
      v_atlas_client_id,
      'Atlas Forwarding Demo',
      'Atlas Forwarding Demo',
      '1234 Demo Logistics Way',
      'ATLAS-DEMO',
      'Miami',
      'FL',
      '00000',
      'USA',
      '+1 000 000 0000',
      true
    );

    insert into public.client_rates (
      id,
      cliente_id,
      rate_code,
      rate_label,
      category,
      unit,
      currency,
      amount,
      is_active,
      valid_from,
      valid_to,
      notes,
      miami_rate_destination
    ) values
    (
      '11100000-0000-4000-8000-000000000001'::uuid,
      v_atlas_client_id,
      'lcl_maritimo_sps_ft3',
      'LCL Maritimo SPS - FT3',
      'LCL Maritimo',
      'FT3',
      'USD',
      4.25,
      true,
      current_date - 30,
      current_date + 90,
      'Tarifa demo.',
      'SPS'
    ),
    (
      '11100000-0000-4000-8000-000000000002'::uuid,
      v_atlas_client_id,
      'consolidado_aereo_kg',
      'Consolidado Aereo - KG',
      'Consolidado Aereo',
      'KG',
      'USD',
      3.85,
      true,
      current_date - 30,
      current_date + 90,
      'Tarifa demo.',
      'SPS'
    ),
    (
      '11100000-0000-4000-8000-000000000003'::uuid,
      v_atlas_client_id,
      'documentos_manejo',
      'Documentos / Manejo',
      'Otros Cargos',
      'flat',
      'USD',
      45,
      true,
      current_date - 30,
      current_date + 90,
      'Cargo demo.',
      null
    );

    insert into public.quotations (
      id, cliente_id, created_by, status, incoterm, tipo_transporte,
      origen, destino, puerto_origen, puerto_destino, peso_kg,
      observaciones, created_at, quotation_number, valid_until,
      contact_name, contact_email, contact_phone, container_type,
      gross_weight, commodity, quote_type, commercial_value,
      requires_insurance, service_product, trade_direction,
      pricing_notes, client_notes
    ) values (
      '30000000-0000-4000-8000-000000000001'::uuid,
      v_atlas_client_id,
      v_actor_profile_id,
      'Pendiente de Fijar Precios',
      'FOB',
      'Maritimo FCL',
      'Shanghai, China',
      'San Pedro Sula, Honduras',
      'Shanghai',
      'Puerto Cortes',
      18500,
      'Escenario demo pendiente de seleccion de tarifa.',
      v_now - interval '2 days',
      'DEMO-Q-ATLAS-001',
      current_date + 30,
      'Equipo Evaluador',
      'atlas-demo@example.com',
      '+504 0000-0000',
      '40HC',
      18500,
      'Mobiliario de exhibicion - carga ficticia',
      'Cotizacion Maritima FCL',
      42000,
      false,
      'other_origin_fcl',
      'import',
      'Comparar ambas alternativas ficticias.',
      'Tarifa sujeta a espacio y equipo. Datos demostrativos.'
    );

    insert into public.quotations (
      id, cliente_id, created_by, status, incoterm, tipo_transporte,
      origen, destino, peso_kg, volumen_cbm, cantidad_bultos,
      observaciones, created_at, quotation_number, valid_until,
      contact_name, contact_email, commodity, quote_type,
      commercial_value, requires_insurance, total_cost, total_sale,
      profit_amount, gp_percentage, pricing_approved,
      pricing_approved_by, pricing_approved_at, transit_time,
      service_frequency, transshipment, package_type,
      financial_validation_status, service_product, trade_direction,
      miami_rate_destination, client_notes
    ) values (
      '30000000-0000-4000-8000-000000000002'::uuid,
      v_atlas_client_id,
      v_actor_profile_id,
      'Enviada al Cliente',
      'EXW',
      'Maritimo LCL',
      'Miami, FL',
      'San Pedro Sula, Honduras',
      820,
      3.4,
      4,
      'Escenario LCL listo para revision comercial.',
      v_now - interval '4 days',
      'DEMO-Q-ATLAS-002',
      current_date + 20,
      'Equipo Evaluador',
      'atlas-demo@example.com',
      'Repuestos automotrices no peligrosos - ficticios',
      'Cotizacion Maritima LCL',
      6800,
      true,
      1025,
      1450,
      425,
      29.31,
      true,
      v_actor_profile_id,
      v_now - interval '3 days',
      '12 dias',
      'Semanal',
      'Directo',
      'Pallets',
      'Aprobado',
      'miami_lcl',
      'import',
      'SPS',
      'Incluye seguro y manejo documental. Ejemplo sin valor comercial.'
    );

    insert into public.quotations (
      id, cliente_id, created_by, status, incoterm, tipo_transporte,
      origen, destino, puerto_origen, puerto_destino, peso_kg,
      observaciones, created_at, quotation_number, valid_until,
      contact_name, contact_email, container_type, gross_weight,
      commodity, quote_type, commercial_value, requires_insurance,
      total_cost, total_sale, profit_amount, gp_percentage,
      pricing_approved, pricing_approved_by, pricing_approved_at,
      transit_time, service_frequency, transshipment, container_qty,
      financial_validation_status, service_product, trade_direction,
      client_notes
    ) values (
      '30000000-0000-4000-8000-000000000003'::uuid,
      v_atlas_client_id,
      v_actor_profile_id,
      'Ganada',
      'FOB',
      'Maritimo FCL',
      'Shanghai, China',
      'San Pedro Sula, Honduras',
      'Shanghai',
      'Puerto Cortes',
      17200,
      'Operacion demo activa con booking y tracking.',
      v_now - interval '18 days',
      'DEMO-Q-ATLAS-003',
      current_date + 15,
      'Equipo Evaluador',
      'atlas-demo@example.com',
      '40HC',
      17200,
      'Equipo promocional - carga ficticia',
      'Cotizacion Maritima FCL',
      38500,
      true,
      3650,
      4950,
      1300,
      26.26,
      true,
      v_actor_profile_id,
      v_now - interval '16 days',
      '28 dias',
      'Semanal',
      'Cartagena',
      1,
      'Aprobado',
      'other_origin_fcl',
      'import',
      'Carga ficticia. Fechas y naviera son demostrativas.'
    );

    insert into public.quotations (
      id, cliente_id, created_by, status, incoterm, tipo_transporte,
      origen, destino, peso_kg, cantidad_bultos, observaciones,
      created_at, quotation_number, contact_name, contact_email,
      commodity, quote_type, commercial_value, requires_insurance,
      service_product, trade_direction, loss_reason, loss_reason_detail
    ) values (
      '30000000-0000-4000-8000-000000000004'::uuid,
      v_atlas_client_id,
      v_actor_profile_id,
      'Perdida',
      'EXW',
      'Aereo Consolidado',
      'Madrid, Espana',
      'San Pedro Sula, Honduras',
      240,
      2,
      'Escenario cerrado para metricas comerciales.',
      v_now - interval '25 days',
      'DEMO-Q-ATLAS-004',
      'Equipo Evaluador',
      'atlas-demo@example.com',
      'Muestras textiles - carga ficticia',
      'Cotizacion Aerea',
      3200,
      false,
      'other_origin_air',
      'import',
      'Precio',
      'El prospecto eligio otra alternativa en este escenario ficticio.'
    );

    insert into public.quotation_containers (
      id, quotation_id, container_type_name, quantity, notes
    ) values
    (
      '31000000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000001'::uuid,
      '40HC',
      1,
      'Contenedor demo.'
    ),
    (
      '31000000-0000-4000-8000-000000000003'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid,
      '40HC',
      1,
      'Contenedor demo de operacion activa.'
    );

    insert into public.quotation_cargo_lines (
      id, quotation_id, quantity, package_type, length, width, height,
      dimension_unit, weight_lbs, ft3, cbm
    ) values
    (
      '31100000-0000-4000-8000-000000000002'::uuid,
      '30000000-0000-4000-8000-000000000002'::uuid,
      4,
      'Pallets',
      48,
      40,
      48,
      'in',
      1808,
      213.33,
      6.04
    ),
    (
      '31100000-0000-4000-8000-000000000004'::uuid,
      '30000000-0000-4000-8000-000000000004'::uuid,
      2,
      'Cajas',
      24,
      20,
      18,
      'in',
      529,
      10,
      0.28
    );

    insert into public.agent_quotes (
      id, quotation_id, agente_nombre, costo, moneda, transit_time,
      is_selected, agent_id, ocean_freight, exw_cost, mbl_fee,
      containers_qty, free_days_destination, carrier,
      profit_per_container, suggested_sale, transshipment,
      valid_until, etd
    ) values
    (
      '32000000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000001'::uuid,
      'BlueWave Demo Logistics',
      3450,
      'USD',
      '28 dias',
      false,
      '20000000-0000-4000-8000-000000000001'::uuid,
      3200,
      175,
      75,
      1,
      10,
      'Demo Ocean Line',
      450,
      4425,
      'Cartagena',
      current_date + 30,
      current_date + 12
    ),
    (
      '32000000-0000-4000-8000-000000000002'::uuid,
      '30000000-0000-4000-8000-000000000001'::uuid,
      'Pacific Bridge Demo Cargo',
      3625,
      'USD',
      '25 dias',
      false,
      '20000000-0000-4000-8000-000000000002'::uuid,
      3400,
      140,
      85,
      1,
      12,
      'Atlas Demo Shipping',
      500,
      4510,
      'Directo',
      current_date + 30,
      current_date + 10
    ),
    (
      '32000000-0000-4000-8000-000000000003'::uuid,
      '30000000-0000-4000-8000-000000000002'::uuid,
      'BlueWave Demo Logistics',
      1025,
      'USD',
      '12 dias',
      true,
      '20000000-0000-4000-8000-000000000001'::uuid,
      925,
      100,
      0,
      1,
      8,
      'Demo Consolidation',
      0,
      1450,
      'Directo',
      current_date + 20,
      current_date + 7
    ),
    (
      '32000000-0000-4000-8000-000000000004'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid,
      'BlueWave Demo Logistics',
      3650,
      'USD',
      '28 dias',
      true,
      '20000000-0000-4000-8000-000000000001'::uuid,
      3400,
      175,
      75,
      1,
      10,
      'Demo Ocean Line',
      0,
      4950,
      'Cartagena',
      current_date + 15,
      current_date - 6
    );

    insert into public.agent_quote_container_rates (
      id, agent_quote_id, quotation_container_id,
      container_type_name, quantity, ocean_freight,
      total_ocean_freight
    ) values
    (
      '32100000-0000-4000-8000-000000000001'::uuid,
      '32000000-0000-4000-8000-000000000001'::uuid,
      '31000000-0000-4000-8000-000000000001'::uuid,
      '40HC',
      1,
      3200,
      3200
    ),
    (
      '32100000-0000-4000-8000-000000000002'::uuid,
      '32000000-0000-4000-8000-000000000002'::uuid,
      '31000000-0000-4000-8000-000000000001'::uuid,
      '40HC',
      1,
      3400,
      3400
    );

    insert into public.pricing_items (
      id, quotation_id, item_type, description, cost_amount,
      sale_amount, currency, supplier, notes, created_by,
      quantity, taxable, tax_rate, tax_amount, total_amount
    ) values
    (
      '33000000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000002'::uuid,
      'freight',
      'Consolidado maritimo Miami - SPS (demo)',
      1025,
      1450,
      'USD',
      'BlueWave Demo Logistics',
      'Valores ficticios.',
      v_actor_profile_id,
      1,
      false,
      0,
      0,
      1450
    ),
    (
      '33000000-0000-4000-8000-000000000002'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid,
      'freight',
      'Flete maritimo FCL 40HC (demo)',
      3650,
      4950,
      'USD',
      'BlueWave Demo Logistics',
      'Valores ficticios.',
      v_actor_profile_id,
      1,
      false,
      0,
      0,
      4950
    );

    insert into public.cost_validations (
      id, quotation_id, agent_quote_id, quoted_cost, invoiced_cost,
      difference, status, observations, validated_by
    ) values (
      '33100000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid,
      '32000000-0000-4000-8000-000000000004'::uuid,
      3650,
      3650,
      0,
      'Validado',
      'Costo ficticio coincide con la tarifa seleccionada.',
      v_actor_profile_id
    );

    perform set_config('app.shipment_creation_mode', 'canonical_rpc', true);

    insert into public.shipping_instructions (
      id, routing_number, quotation_id, client_id, status,
      operations_assigned_to, supplier_name, supplier_contact,
      supplier_email, origin_address, destination_address,
      container_qty, container_type, agent_name, agent_contact,
      agent_email, special_instructions, validated_by, validated_at,
      created_by, created_at, booking_number, carrier_booking,
      master_bl, house_bl, etd, eta, free_days, shipper,
      consignee, notify_party, shipment_status, freight_terms,
      release_type, carrier, vessel_name, voyage,
      operational_comments, operational_status, sales_submitted_at,
      insurance_requested
    ) values (
      '40000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-RT-ATLAS-001',
      '30000000-0000-4000-8000-000000000003'::uuid,
      v_atlas_client_id,
      'Convertida a Embarque',
      v_actor_profile_id,
      'BlueWave Demo Logistics',
      'Contacto Ficticio 01',
      'bluewave-demo@example.com',
      'Shanghai, China',
      'San Pedro Sula, Honduras',
      1,
      '40HC',
      'BlueWave Demo Logistics',
      'Contacto Ficticio 01',
      'bluewave-demo@example.com',
      'Operacion ficticia; no contactar naviera ni proveedor.',
      v_actor_profile_id,
      v_now - interval '14 days',
      v_actor_profile_id,
      v_now - interval '15 days',
      'DEMO-BKG-ATLAS-001',
      'CARRIER-DEMO-001',
      'DEMO-MBL-001',
      'DEMO-HBL-001',
      current_date - 5,
      current_date + 18,
      '10',
      'Proveedor Ficticio Shanghai',
      'Atlas Forwarding Demo',
      'Atlas Forwarding Demo',
      'En Tránsito',
      'Prepaid',
      'Express Release',
      'Demo Ocean Line',
      'MV Atlas Demo',
      'AD-101',
      'Embarque simulado actualmente en transito.',
      'En Tránsito',
      v_now - interval '16 days',
      true
    );

    insert into public.shipments (
      id, shipment_number, quotation_id, client_id,
      shipping_instruction_id, service_type, incoterm, origin,
      destination, operational_status, requires_hbl, assigned_to,
      created_by, created_at, updated_at, metadata
    ) values (
      '41000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-SHP-ATLAS-001',
      '30000000-0000-4000-8000-000000000003'::uuid,
      v_atlas_client_id,
      '40000000-0000-4000-8000-000000000001'::uuid,
      'other_origin_fcl',
      'FOB',
      'Shanghai, China',
      'San Pedro Sula, Honduras',
      'En Tránsito',
      true,
      v_actor_profile_id,
      v_actor_profile_id,
      v_now - interval '15 days',
      v_now,
      jsonb_build_object(
        'dataset', 'atlas-forwarding-demo-v1',
        'is_fictional', true
      )
    );

    insert into public.bookings (
      id, shipping_instruction_id, shipment_id, booking_number,
      carrier_booking, master_bl, house_bl, carrier, vessel_name,
      voyage, etd, eta, original_eta, actual_etd, tracking_url,
      shipment_status, estimated_transit_days, free_days,
      remaining_free_days, freight_terms, release_type,
      operational_comments, created_by, created_at, updated_at,
      original_etd, routing_summary, booking_lifecycle_status,
      client_schedule_notified_at
    ) values (
      '42000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      '41000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-BKG-ATLAS-001',
      'CARRIER-DEMO-001',
      'DEMO-MBL-001',
      'DEMO-HBL-001',
      'Demo Ocean Line',
      'MV Atlas Demo',
      'AD-101',
      current_date - 5,
      current_date + 18,
      current_date + 18,
      current_date - 5,
      null,
      'En Tránsito',
      23,
      10,
      10,
      'Prepaid',
      'Express Release',
      'Tracking simulado; no existe enlace externo.',
      v_actor_profile_id,
      v_now - interval '14 days',
      v_now,
      current_date - 5,
      'Shanghai > Cartagena > Puerto Cortes',
      'ACTIVE',
      v_now - interval '13 days'
    );

    update public.shipping_instructions
    set primary_booking_id = '42000000-0000-4000-8000-000000000001'::uuid,
        updated_at = v_now
    where id = '40000000-0000-4000-8000-000000000001'::uuid;

    insert into public.booking_containers (
      id, booking_id, container_type, quantity, notes
    ) values (
      '42100000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      '40HC',
      1,
      'MSCU-DEMO-000001 / sello DEMO-001'
    );

    perform public.seed_booking_readiness_requirements(
      '42000000-0000-4000-8000-000000000001'::uuid,
      false
    );

    insert into public.booking_cutoffs (
      id, shipment_id, booking_id, booking_container_id,
      cutoff_code, cutoff_label, due_at, timezone,
      source, source_reference, status, notes, metadata,
      created_by
    ) values (
      '42200000-0000-4000-8000-000000000001'::uuid,
      '41000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      '42100000-0000-4000-8000-000000000001'::uuid,
      'DOCUMENTATION',
      'Documentacion final demo',
      v_now + interval '2 days',
      'America/Tegucigalpa',
      'MANUAL',
      'ATLAS-DEMO',
      'PENDING',
      'Cutoff ficticio para mostrar alertas de readiness.',
      jsonb_build_object('is_fictional', true),
      v_actor_profile_id
    );

    insert into public.container_vgm_records (
      id, shipment_id, booking_id, booking_container_id,
      version_number, gross_mass, unit, verification_method,
      status, notes, metadata, created_by
    ) values (
      '42300000-0000-4000-8000-000000000001'::uuid,
      '41000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      '42100000-0000-4000-8000-000000000001'::uuid,
      1,
      19850,
      'KG',
      'METHOD_2',
      'DRAFT',
      'VGM ficticia pendiente de verificacion.',
      jsonb_build_object('is_fictional', true),
      v_actor_profile_id
    );

    insert into public.operational_events (
      id, shipping_instruction_id, booking_id, booking_container_id,
      shipment_id, event_code, event_label, occurred_at,
      location, notes, metadata, source_system, created_by
    ) values
    (
      '43000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      null,
      '41000000-0000-4000-8000-000000000001'::uuid,
      'BOOKING_CONFIRMED',
      'Booking confirmado',
      v_now - interval '12 days',
      'Shanghai',
      'Evento ficticio.',
      jsonb_build_object('is_fictional', true),
      'manual',
      v_actor_profile_id
    ),
    (
      '43000000-0000-4000-8000-000000000002'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      '42100000-0000-4000-8000-000000000001'::uuid,
      '41000000-0000-4000-8000-000000000001'::uuid,
      'ON_BOARD',
      'Contenedor a bordo',
      v_now - interval '5 days',
      'Shanghai',
      'Salida simulada.',
      jsonb_build_object('is_fictional', true),
      'manual',
      v_actor_profile_id
    );

    insert into public.shipping_instruction_events (
      id, shipping_instruction_id, event_type, event_date,
      location, notes, created_by
    ) values (
      '43100000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      'Salida',
      v_now - interval '5 days',
      'Shanghai',
      'Evento legacy ficticio para compatibilidad visual.',
      v_actor_profile_id
    );

    insert into public.bills_of_lading (
      id, booking_id, shipping_instruction_id, bl_type,
      parent_bl_id, bl_number, status, release_type,
      originals_count, copies_count, freight_terms,
      hbl_freight_visibility, bl_date, issue_date,
      shipper, consignee, notify_party, place_of_receipt,
      port_of_loading, port_of_discharge, place_of_delivery,
      carrier, vessel_name, voyage, etd, eta,
      description_of_goods, number_of_packages, package_type,
      gross_weight_kg, special_instructions, created_by
    ) values
    (
      '44000000-0000-4000-8000-000000000001'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      'MBL',
      null,
      'DEMO-MBL-001',
      'MBL Validado',
      'Express Release',
      0,
      3,
      'Prepaid',
      null,
      current_date - 5,
      current_date - 4,
      'Proveedor Ficticio Shanghai',
      'Atlas Forwarding Demo',
      'Atlas Forwarding Demo',
      'Shanghai',
      'Shanghai',
      'Puerto Cortes',
      'San Pedro Sula',
      'Demo Ocean Line',
      'MV Atlas Demo',
      'AD-101',
      current_date - 5,
      current_date + 18,
      'Equipo promocional ficticio',
      520,
      'Cajas',
      17200,
      'Documento demostrativo sin validez.',
      v_actor_profile_id
    ),
    (
      '44000000-0000-4000-8000-000000000002'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      '40000000-0000-4000-8000-000000000001'::uuid,
      'HBL',
      '44000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-HBL-001',
      'Aprobado por Cliente',
      'Express Release',
      0,
      3,
      'Prepaid',
      'As Arranged',
      current_date - 5,
      current_date - 4,
      'Proveedor Ficticio Shanghai',
      'Atlas Forwarding Demo',
      'Atlas Forwarding Demo',
      'Shanghai',
      'Shanghai',
      'Puerto Cortes',
      'San Pedro Sula',
      'Demo Ocean Line',
      'MV Atlas Demo',
      'AD-101',
      current_date - 5,
      current_date + 18,
      'Equipo promocional ficticio',
      520,
      'Cajas',
      17200,
      'Documento demostrativo sin validez.',
      v_actor_profile_id
    );

    insert into public.bl_containers (
      id, bl_id, container_number, seal_number, container_type,
      quantity, gross_weight_kg, notes
    ) values (
      '44100000-0000-4000-8000-000000000001'::uuid,
      '44000000-0000-4000-8000-000000000001'::uuid,
      'MSCU-DEMO-000001',
      'DEMO-001',
      '40HC',
      1,
      17200,
      'Identificadores completamente ficticios.'
    );

    insert into public.invoices (
      id, invoice_number, invoice_type, status, quotation_id,
      cliente_id, cliente_nombre, cliente_rtn, cliente_direccion,
      cliente_email, issue_date, due_date, subtotal, tax_rate,
      tax_amount, total, currency, exchange_rate, total_lps,
      notes, created_by, updated_by, created_at, updated_at,
      es_exonerado, isv_18_rate, isv_18_amount,
      importe_exento, importe_exonerado
    ) values (
      '50000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-PRO-ATLAS-001',
      'Proforma',
      'Enviada',
      '30000000-0000-4000-8000-000000000003'::uuid,
      v_atlas_client_id,
      'Atlas Forwarding Demo',
      'DEMO-NO-FISCAL',
      'Zona Industrial Demo, Boulevard Logistico',
      'atlas-demo@example.com',
      current_date - 4,
      current_date + 11,
      4950,
      15,
      742.50,
      5692.50,
      'USD',
      26.50,
      150851.25,
      'PROFORMA DEMOSTRATIVA - SIN VALIDEZ FISCAL.',
      v_actor_profile_id,
      v_actor_profile_id,
      v_now - interval '4 days',
      v_now,
      false,
      0,
      0,
      0,
      0
    );

    insert into public.invoice_items (
      id, invoice_id, description, quantity, unit_price,
      amount, sort_order, isv_rate, tax_amount
    ) values (
      '50100000-0000-4000-8000-000000000001'::uuid,
      '50000000-0000-4000-8000-000000000001'::uuid,
      'Servicio logistico FCL 40HC - DEMO',
      1,
      4950,
      4950,
      1,
      15,
      742.50
    );

    insert into public.provider_invoice_items (
      id, quotation_id, pricing_item_id, supplier,
      invoice_number, description, currency, quantity,
      unit_cost, total_cost, invoice_date, notes,
      created_by, is_taxable, tax_percentage_snapshot,
      tax_amount
    ) values (
      '51000000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid,
      '33000000-0000-4000-8000-000000000002'::uuid,
      'BlueWave Demo Logistics',
      'SUP-DEMO-001',
      'Costo agente FCL ficticio',
      'USD',
      1,
      3650,
      3650,
      current_date - 6,
      'Documento ficticio; no existe archivo asociado.',
      v_actor_profile_id,
      false,
      0,
      0
    );

    insert into public.cuentas_pagar (
      id, proveedor_id, quotation_id, booking_id, descripcion,
      numero_factura_proveedor, monto, moneda, fecha_factura,
      fecha_vencimiento, status, notas, created_by, tipo
    ) values (
      '51100000-0000-4000-8000-000000000001'::uuid,
      '21000000-0000-4000-8000-000000000001'::uuid,
      '30000000-0000-4000-8000-000000000003'::uuid,
      '42000000-0000-4000-8000-000000000001'::uuid,
      'Flete internacional FCL - DEMO',
      'SUP-DEMO-001',
      3650,
      'USD',
      current_date - 6,
      current_date + 24,
      'Pendiente',
      'Cuenta ficticia; no efectuar pago.',
      v_actor_profile_id,
      'AP'
    );

    insert into public.miami_manifests (
      id, manifest_number, status, notes, received_by,
      created_at, closed_at, carrier
    ) values (
      '60000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-MIA-ATLAS-001',
      'Cerrado',
      'Manifiesto ficticio del dataset Atlas.',
      v_actor_profile_id,
      v_now - interval '9 days',
      v_now - interval '8 days',
      'UPS'
    );

    insert into public.miami_packages (
      id, tracking_number, carrier, weight_lbs, weight_kg,
      length_in, width_in, height_in, ft3, cbm, description,
      status, warehouse_number, cliente_id, manifest_id,
      received_at, received_by, assigned_at, assigned_by,
      notes, cargo_status_updated_at, tipo_carga, cargo_status,
      rack_location, location_updated_at, location_updated_by
    ) values
    (
      '61000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-UPS-ATLAS-001',
      'UPS',
      18.50,
      8.39,
      24,
      18,
      16,
      4.00,
      0.113,
      'Muestras promocionales ficticias',
      'Asignado',
      'DEMO-WH-0001',
      v_atlas_client_id,
      '60000000-0000-4000-8000-000000000001'::uuid,
      v_now - interval '8 days',
      v_actor_profile_id,
      v_now - interval '8 days',
      v_actor_profile_id,
      'Paquete demostrativo.',
      v_now - interval '8 days',
      'Paquetería',
      'Recibido en Miami',
      'A-01-01',
      v_now - interval '8 days',
      v_actor_profile_id
    ),
    (
      '61000000-0000-4000-8000-000000000002'::uuid,
      'DEMO-FDX-ATLAS-002',
      'FedEx',
      55.00,
      24.95,
      36,
      24,
      22,
      11.00,
      0.311,
      'Repuestos automotrices ficticios',
      'Asignado',
      'DEMO-WH-0002',
      v_atlas_client_id,
      '60000000-0000-4000-8000-000000000001'::uuid,
      v_now - interval '7 days',
      v_actor_profile_id,
      v_now - interval '7 days',
      v_actor_profile_id,
      'Paquete en despacho demo.',
      v_now - interval '2 days',
      'Paquetería',
      'En Tránsito',
      'B-02-03',
      v_now - interval '7 days',
      v_actor_profile_id
    ),
    (
      '61000000-0000-4000-8000-000000000003'::uuid,
      'DEMO-DHL-ATLAS-003',
      'DHL',
      6.25,
      2.84,
      14,
      10,
      8,
      0.65,
      0.018,
      'Documentos comerciales ficticios',
      'Entregado',
      'DEMO-WH-0003',
      v_atlas_client_id,
      null,
      v_now - interval '20 days',
      v_actor_profile_id,
      v_now - interval '20 days',
      v_actor_profile_id,
      'Entrega historica demo.',
      v_now - interval '12 days',
      'Paquetería',
      'Entregado',
      null,
      null,
      null
    );

    insert into public.miami_pre_alerts (
      id, cliente_id, tracking_number, carrier, description,
      expected_date, status, matched_package_id, created_at
    ) values
    (
      '62000000-0000-4000-8000-000000000001'::uuid,
      v_atlas_client_id,
      'DEMO-USPS-ATLAS-004',
      'USPS',
      'Material POP ficticio pendiente de recibir',
      current_date + 3,
      'Pendiente',
      null,
      v_now - interval '1 day'
    ),
    (
      '62000000-0000-4000-8000-000000000002'::uuid,
      v_atlas_client_id,
      'DEMO-UPS-ATLAS-001',
      'UPS',
      'Muestras promocionales ficticias',
      current_date - 8,
      'Recibido',
      '61000000-0000-4000-8000-000000000001'::uuid,
      v_now - interval '10 days'
    );

    insert into public.miami_shipments (
      id, shipment_number, transport_mode, status, total_packages,
      total_weight_lbs, notes, dispatched_at, created_by
    ) values (
      '64000000-0000-4000-8000-000000000001'::uuid,
      'DEMO-MIA-SHP-001',
      'Aereo',
      'En Transito',
      1,
      55.00,
      'Despacho ficticio hacia Honduras.',
      v_now - interval '2 days',
      v_actor_profile_id
    );

    insert into public.miami_shipment_packages (
      id, shipment_id, package_id, added_by, added_at
    ) values (
      '64100000-0000-4000-8000-000000000001'::uuid,
      '64000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      v_actor_profile_id,
      v_now - interval '2 days'
    );

    insert into public.miami_package_events (
      id, package_id, shipment_id, event_type, old_status,
      new_status, notes, created_by, created_at, metadata
    ) values
    (
      '65000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000001'::uuid,
      null,
      'received',
      null,
      'Recibido en Miami',
      'Recepcion ficticia.',
      v_actor_profile_id,
      v_now - interval '8 days',
      jsonb_build_object('is_fictional', true)
    ),
    (
      '65000000-0000-4000-8000-000000000002'::uuid,
      '61000000-0000-4000-8000-000000000002'::uuid,
      '64000000-0000-4000-8000-000000000001'::uuid,
      'dispatched',
      'Recibido en Miami',
      'En transito a Honduras',
      'Despacho ficticio.',
      v_actor_profile_id,
      v_now - interval '2 days',
      jsonb_build_object('is_fictional', true)
    );

    insert into public.miami_incidencias (
      id, package_id, cliente_id, tipo, descripcion,
      status, created_at
    ) values (
      '63000000-0000-4000-8000-000000000001'::uuid,
      '61000000-0000-4000-8000-000000000001'::uuid,
      v_atlas_client_id,
      'Otro',
      'Incidencia ficticia: etiqueta exterior poco legible.',
      'Abierta',
      v_now - interval '1 day'
    );

    insert into public.client_pickup_requests (
      id, cliente_id, profile_id, pickup_address,
      contact_name, contact_phone, scheduled_date,
      description, status, notes, created_at
    ) values (
      '66000000-0000-4000-8000-000000000001'::uuid,
      v_atlas_client_id,
      null,
      'Zona Industrial Demo, San Pedro Sula',
      'Equipo Evaluador',
      '+504 0000-0000',
      current_date + 2,
      'Recolecta ficticia de dos pallets.',
      'Confirmado',
      'Solicitud demostrativa.',
      v_now - interval '1 day'
    );

    insert into public.client_notifications (
      profile_id, title, body, type, entity_type, entity_id, created_at
    )
    select
      p.id,
      'Bienvenido al dataset Atlas',
      'Todos los datos son ficticios y el sandbox es compartido.',
      'sistema',
      'cliente',
      v_atlas_client_id,
      v_now
    from public.profiles p
    where p.is_demo_user is true
      and p.rol = 'Cliente'
      and p.cliente_id = v_atlas_client_id;

    insert into public.user_tasks (
      user_id, title, notes, status, due_date, priority
    )
    select
      p.id,
      'Recorrer operacion Atlas Demo',
      'Validar cotizacion, booking, tracking y proforma ficticios.',
      'Pendiente',
      current_date + 1,
      'Media'
    from public.profiles p
    where p.is_demo_user is true
      and p.rol = 'Admin';

    insert into public.sales_activities (
      id, tipo_actividad, tipo_cliente, cliente_id,
      fecha_actividad, hora_inicio, hora_fin, etapa_captacion,
      comentarios, resultado, proxima_accion,
      fecha_proxima_accion, created_by
    ) values (
      '67000000-0000-4000-8000-000000000001'::uuid,
      'Reunión',
      'Mantenimiento',
      v_atlas_client_id,
      current_date - 1,
      '10:00',
      '10:45',
      'Cliente Activo',
      'Revision ficticia de operaciones y servicio.',
      'Cliente demo interesado en nuevo embarque.',
      'Preparar alternativa de tarifa FCL.',
      current_date + 3,
      v_actor_profile_id
    );

    insert into public.activity_logs (
      id, user_id, module, action, entity_type, entity_id,
      description, metadata, created_at
    ) values (
      '68000000-0000-4000-8000-000000000001'::uuid,
      v_actor_profile_id,
      'demo_dataset',
      'seeded',
      'cliente',
      v_atlas_client_id,
      'Dataset ficticio Atlas preparado para demostracion.',
      jsonb_build_object(
        'dataset_version', 'atlas-forwarding-demo-v1',
        'is_fictional', true
      ),
      v_now
    );

    if exists (
      select 1
      from public.company_settings cs
      where concat_ws(
        ' ',
        cs.legal_name,
        cs.trade_name,
        cs.email,
        cs.website,
        cs.invoice_footer_note,
        cs.condiciones_bl,
        cs.condiciones_awb,
        cs.condiciones_carta_porte,
        cs.plantilla_cotizacion
      ) ~* '(^|[^[:alnum:]_])sari([[:space:]]+express)?([^[:alnum:]_]|$)'
    ) or exists (
      select 1
      from public.email_templates et
      where concat_ws(
        ' ', et.template_key, et.nombre, et.descripcion, et.asunto, et.cuerpo
      ) ~* '(^|[^[:alnum:]_])sari([[:space:]]+express)?([^[:alnum:]_]|$)'
    ) then
      raise exception 'El dataset conserva branding Sari en configuracion o plantillas'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from storage.buckets b
      where b.id = any (array[
        'avatars',
        'booking-documents',
        'proveedor-docs',
        'miami-package-photos'
      ])
        and b.public is true
    ) then
      raise exception 'Uno o mas buckets conocidos siguen siendo publicos'
        using errcode = '23514';
    end if;

    -- Fuerza las constraint triggers diferidas dentro del bloque capturable.
    set constraints all immediate;

    select count(*)::bigint
    into v_storage_objects_preserved
    from storage.objects;

    update public.platform_environment
    set reset_enabled = false,
        reset_nonce = gen_random_uuid(),
        reset_armed_at = null,
        dataset_version = 'atlas-forwarding-demo-v1',
        dataset_seeded_at = v_now,
        dataset_client_id = v_atlas_client_id,
        updated_at = v_now
    where singleton is true
      and environment = 'demo'
      and project_ref = 'wlssekvxpfxhwedsjhpz'
      and reset_nonce = p_reset_nonce;

    if not found then
      raise exception 'El sentinel cambio durante el reset; se revierte la transaccion'
        using errcode = '40001';
    end if;

    return jsonb_build_object(
      'ok', true,
      'dataset_version', 'atlas-forwarding-demo-v1',
      'dataset_seeded_at', v_now,
      'dataset_client_id', v_atlas_client_id,
      'linked_client_profiles', v_linked_client_profiles,
      'storage_objects_preserved', v_storage_objects_preserved,
      'storage_buckets_forced_private', v_storage_buckets_forced_private,
      'counts', jsonb_build_object(
        'clientes', 1,
        'quotations', 4,
        'shipments', 1,
        'bookings', 1,
        'invoices', 1,
        'miami_packages', 3
      )
    );
  exception
    when others then
      get stacked diagnostics
        v_error_message = message_text,
        v_error_detail = pg_exception_detail,
        v_error_state = returned_sqlstate;

      update public.platform_environment
      set reset_enabled = false,
          reset_nonce = gen_random_uuid(),
          reset_armed_at = null,
          dataset_version = null,
          dataset_seeded_at = null,
          dataset_client_id = null,
          updated_at = clock_timestamp()
      where singleton is true
        and project_ref = 'wlssekvxpfxhwedsjhpz';

      return jsonb_strip_nulls(jsonb_build_object(
        'ok', false,
        'error_code', v_error_state,
        'error', v_error_message,
        'detail', v_error_detail
      ));
  end;
end;
$$;

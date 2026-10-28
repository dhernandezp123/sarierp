-- DEMO-PARITY-002: common business schema with sandbox-only boundaries.
do $$ begin
 if not exists(select 1 from public.platform_environment where singleton and environment='demo' and project_ref='wlssekvxpfxhwedsjhpz' and not reset_enabled) then raise exception 'Demo sentinel required';end if;
end $$;

-- The shared cutover assigns the original dataset a stable tenant id. Keep that
-- id and its references, but expose only the Demo hostname and fictitious brand.
update public.tenants set slug='demo',name='Atlas Forwarding Demo' where id='00000000-0000-4000-8000-000000000001';
update public.tenant_domains set hostname='demo.forwarders.app' where tenant_id='00000000-0000-4000-8000-000000000001' and hostname='sari.forwarders.app';
update public.company_settings set legal_name='ATLAS FORWARDING DEMO',trade_name='Atlas Forwarding Demo',rtn='DEMO-SIN-VALIDEZ',logo_url='/brand/lockup-h-color.png'
where tenant_id='00000000-0000-4000-8000-000000000001' and trade_name='Sari Express';
update public.company_settings set logo_url='/brand/lockup-h-color.png'
where tenant_id='00000000-0000-4000-8000-000000000001' and logo_url='/logo/sari-logo.png';

create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path=public as $$
 select p.tenant_id from public.profiles p where p.id=auth.uid()
 and p.status='Aprobado' and p.is_active and public.is_demo_access_active() limit 1;
$$;

-- Finance/Admin may configure this isolated fictitious tenant. Outbound email
-- templates and file uploads retain their separate server-side restrictions.
do $$ declare r record; op text; begin
 for r in select tablename from pg_tables where schemaname='public' and tablename<>'email_templates' loop
  foreach op in array array['insert','update','delete'] loop
   execute format('drop policy if exists %I on public.%I',r.tablename||'_demo_'||op||'_guard',r.tablename);
  end loop;
 end loop;
 -- New tables must also reject expired/non-demo users, independently of UI.
 for r in select tablename from pg_tables where schemaname='public'
 and tablename not in ('platform_environment','demo_environment_legacy','demo_terms_acceptances','demo_access_events','profiles','leads') loop
  execute format('drop policy if exists demo_access_active_guard on public.%I',r.tablename);
  execute format('create policy demo_access_active_guard on public.%I as restrictive for all to authenticated using(public.is_demo_access_active()) with check(public.is_demo_access_active())',r.tablename);
 end loop;
end $$;

drop index if exists public.invoices_one_active_demo_document_per_quotation_idx;
-- Standard Factura/Proforma conversion now uses the shared, tested constraints.
-- This sandbox's fiscal-looking numbers never represent authorized documents.
create policy demo_parity_storage_block on storage.objects as restrictive
for all to anon,authenticated using(false) with check(false);
update storage.buckets set public=false where public;

-- The old reset predates multi-tenant/accounting dependencies. Fail closed;
-- preserve this dataset instead of running an obsolete deletion/seed allowlist.
create or replace function public.arm_demo_reset(p_confirmation text) returns uuid
language plpgsql security definer set search_path=public as $$ begin
 raise exception 'El reset legacy está retirado; use un procedimiento compatible con el esquema multiempresa y contable. No se borró ningún dato.' using errcode='55000';
end $$;
create or replace function public.reset_and_seed_demo(p_confirmation text,p_reset_nonce uuid) returns jsonb
language plpgsql security definer set search_path=public as $$ begin
 raise exception 'El reset legacy está retirado; el dataset actual se conserva.' using errcode='55000';
end $$;
revoke all on function public.arm_demo_reset(text),public.reset_and_seed_demo(text,uuid) from public,anon,authenticated;
grant execute on function public.arm_demo_reset(text),public.reset_and_seed_demo(text,uuid) to service_role;
notify pgrst,'reload schema';

-- Restore canonical tenant-aware operations after the legacy Demo overlays.
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

create or replace function public.guard_linked_invoice_operations_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quotation_id is not null
     and new.invoice_type = 'Factura'
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

create or replace function public.allocate_internal_hbl_number(p_number_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if auth.uid() is null or v_tenant_id is null then
    raise exception 'No autorizado para generar HBL' using errcode = '42501';
  end if;
  return public.allocate_internal_hbl_number_for_tenant(v_tenant_id, p_number_date);
end;
$$;

create or replace function public.allocate_internal_hbl_number_for_tenant(
  p_tenant_id uuid,
  p_number_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_tenant uuid := public.current_tenant_id();
  v_date date := coalesce(
    p_number_date,
    timezone('America/Tegucigalpa', clock_timestamp())::date
  );
  v_prefix text := 'DEMO-HBL-' || to_char(v_date, 'YYYYMMDD') || '-';
  v_existing_max integer;
  v_next integer;
begin
  if p_tenant_id is null then
    raise exception 'Tenant obligatorio para generar HBL';
  end if;
  if auth.uid() is not null and (
    v_current_tenant is null or p_tenant_id is distinct from v_current_tenant
  ) then
    raise exception 'No se puede consumir un contador HBL de otra empresa'
      using errcode = '42501';
  end if;

  select coalesce(max(
    case
      when substring(bl.bl_number from char_length(v_prefix) + 1) ~ '^[0-9]+$'
        then substring(bl.bl_number from char_length(v_prefix) + 1)::integer
      else null
    end
  ), 0)
  into v_existing_max
  from public.bills_of_lading bl
  where bl.tenant_id = p_tenant_id
    and bl.bl_type = 'HBL'
    and bl.bl_number like v_prefix || '%';

  insert into public.hbl_number_counters as counter (
    tenant_id, number_date, last_value, updated_at
  ) values (
    p_tenant_id, v_date, v_existing_max + 1, clock_timestamp()
  )
  on conflict (tenant_id, number_date) do update
  set last_value = greatest(counter.last_value, excluded.last_value - 1) + 1,
      updated_at = clock_timestamp()
  returning last_value into v_next;

  return v_prefix || lpad(v_next::text, 3, '0');
end;
$$;


-- Keep the sandbox prefix with the canonical per-tenant allocator.
create or replace function public.generate_quotation_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, public.current_tenant_id());
  v_seller_initials text;
  v_sequence bigint;
begin
  select upper(
    left(coalesce(profile.nombre, 'X'), 1)
    || left(coalesce(profile.apellido, 'X'), 1)
  ) into v_seller_initials
  from public.profiles profile
  where profile.id = new.created_by
    and profile.tenant_id = v_tenant_id;

  v_seller_initials := coalesce(v_seller_initials, 'XX');

  if new.quotation_number is null then
    if v_tenant_id is null then
      raise exception 'No se pudo resolver la empresa para numerar la cotizacion';
    end if;
    v_sequence := public.allocate_tenant_document_sequence(v_tenant_id, 'QUOTATION', 1);
    new.quotation_number := 'DEMO-Q-'
      || to_char(now(), 'YYMM') || '-'
      || lpad(v_sequence::text, 4, '0') || '-'
      || v_seller_initials;
  end if;
  return new;
end;
$$;

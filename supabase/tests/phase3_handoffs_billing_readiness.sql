\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(command text, message text)
returns void language plpgsql as $$
declare
  failed boolean := false;
begin
  begin
    execute command;
  exception when others then
    failed := true;
  end;

  if not failed then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('63100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase3-finance@test.local', '{}'::jsonb),
  ('63100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase3-sales@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '63100000-0000-0000-0000-000000000001' then 'Finanzas'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true
where id::text like '63100000-%';

insert into public.clientes (id, nombre, rtn)
values
  ('63200000-0000-0000-0000-000000000001', 'Cliente Fiscal Fase 3', '08011999123456'),
  ('63200000-0000-0000-0000-000000000002', 'Cliente sin RTN Fase 3', null);

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  financial_validation_status
)
values
  (
    '63300000-0000-0000-0000-000000000001',
    '63200000-0000-0000-0000-000000000001',
    '63100000-0000-0000-0000-000000000002',
    'Ganada', 'Q-P3-OPS', 'Pendiente'
  ),
  (
    '63300000-0000-0000-0000-000000000002',
    '63200000-0000-0000-0000-000000000001',
    '63100000-0000-0000-0000-000000000002',
    'Ganada', 'Q-P3-COST', 'Pendiente'
  ),
  (
    '63300000-0000-0000-0000-000000000003',
    '63200000-0000-0000-0000-000000000002',
    '63100000-0000-0000-0000-000000000002',
    'Ganada', 'Q-P3-RTN', 'Pendiente'
  ),
  (
    '63300000-0000-0000-0000-000000000004',
    '63200000-0000-0000-0000-000000000001',
    '63100000-0000-0000-0000-000000000002',
    'Ganada', 'Q-P3-READY', 'Pendiente'
  );

insert into public.pricing_items (
  id, quotation_id, item_type, description, quantity, sale_amount,
  currency, taxable, tax_rate, created_by
)
select
  ('63400000-0000-0000-0000-' || right(quotation.id::text, 12))::uuid,
  quotation.id,
  'Freight',
  'Flete internacional',
  1,
  1000,
  'USD',
  true,
  15,
  '63100000-0000-0000-0000-000000000001'
from public.quotations quotation
where quotation.id::text like '63300000-%';

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  shipment_status, operational_status, updated_at
)
values
  (
    '63500000-0000-0000-0000-000000000001', 'RT-P3-OPS',
    '63300000-0000-0000-0000-000000000001',
    '63200000-0000-0000-0000-000000000001',
    '63100000-0000-0000-0000-000000000002',
    'Arribado', 'Arribado', clock_timestamp()
  ),
  (
    '63500000-0000-0000-0000-000000000002', 'RT-P3-COST',
    '63300000-0000-0000-0000-000000000002',
    '63200000-0000-0000-0000-000000000001',
    '63100000-0000-0000-0000-000000000002',
    'Finalizado', 'Finalizado', clock_timestamp()
  ),
  (
    '63500000-0000-0000-0000-000000000003', 'RT-P3-RTN',
    '63300000-0000-0000-0000-000000000003',
    '63200000-0000-0000-0000-000000000002',
    '63100000-0000-0000-0000-000000000002',
    'Finalizado', 'Finalizado', clock_timestamp()
  ),
  (
    '63500000-0000-0000-0000-000000000004', 'RT-P3-READY',
    '63300000-0000-0000-0000-000000000004',
    '63200000-0000-0000-0000-000000000001',
    '63100000-0000-0000-0000-000000000002',
    'Finalizado', 'Finalizado', clock_timestamp()
  );

insert into public.provider_invoice_items (
  quotation_id, pricing_item_id, supplier, invoice_number, description,
  currency, quantity, unit_cost, total_cost, tax_amount, created_by
)
select
  pricing.quotation_id,
  pricing.id,
  'Proveedor Fase 3',
  'PROV-P3-' || right(pricing.quotation_id::text, 4),
  pricing.description,
  pricing.currency,
  pricing.quantity,
  pricing.cost_amount,
  pricing.cost_amount * pricing.quantity,
  0,
  '63100000-0000-0000-0000-000000000001'
from public.pricing_items pricing
where pricing.quotation_id in (
  '63300000-0000-0000-0000-000000000003',
  '63300000-0000-0000-0000-000000000004'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"63100000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.expect_error(
  $$select public.validate_quotation_financial_costs(
    '63300000-0000-0000-0000-000000000001'
  )$$,
  'Finanzas no debe validar costos con la operacion abierta'
);

select pg_temp.expect_error(
  $$select public.validate_quotation_financial_costs(
    '63300000-0000-0000-0000-000000000002'
  )$$,
  'Finanzas no debe validar costos sin conciliacion estructural'
);

select public.validate_quotation_financial_costs(
  '63300000-0000-0000-0000-000000000003'
);
select public.validate_quotation_financial_costs(
  '63300000-0000-0000-0000-000000000004'
);

select pg_temp.assert_true(
  (
    select count(*) = 4
      and count(*) filter (where readiness_code = 'OPERATIONS_PENDING') = 1
      and count(*) filter (where readiness_code = 'COSTS_PENDING') = 1
      and count(*) filter (where readiness_code = 'CLIENT_DATA_MISSING') = 1
      and count(*) filter (where readiness_code = 'READY_TO_INVOICE') = 1
    from public.get_billing_work_queue()
    where quotation_id::text like '63300000-%'
  ),
  'La cola debe derivar cada bloqueo desde hechos operativos y financieros'
);

select pg_temp.assert_true(
  (
    select estimated_total = 1150 and currency = 'USD'
    from public.get_billing_work_queue()
    where quotation_id = '63300000-0000-0000-0000-000000000004'
  ),
  'La cola lista debe exponer moneda e importe comercial estimado'
);

reset role;
select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.get_billing_work_queue()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.validate_quotation_financial_costs(uuid)',
    'EXECUTE'
  ),
  'Anon no debe consultar la cola ni validar costos'
);

\o
\echo 'phase3_handoffs_billing_readiness: OK'
rollback;

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

create or replace function pg_temp.expect_denied(command text, message text)
returns void language plpgsql as $$
declare
  was_denied boolean := false;
begin
  begin
    execute command;
  exception when others then
    was_denied := true;
  end;
  if not was_denied then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 20
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
      and is_nullable = 'NO'
      and table_name in (
        'invoices', 'invoice_items', 'invoice_payments',
        'invoice_payment_splits', 'cost_validations', 'cuentas_pagar',
        'pagos_proveedor', 'proveedores', 'provider_invoice_items',
        'cai_ranges', 'document_sequences', 'hbl_number_counters',
        'client_rate_catalog', 'carrier_catalog', 'locations_catalog',
        'service_products', 'surcharge_rules', 'tax_rates',
        'email_templates', 'miami_carriers'
      )
  ) and (
    select count(*) = 20
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and trigger_row.tgname = 'tenant_guard'
      and not trigger_row.tgisinternal
      and table_row.relname in (
        'invoices', 'invoice_items', 'invoice_payments',
        'invoice_payment_splits', 'cost_validations', 'cuentas_pagar',
        'pagos_proveedor', 'proveedores', 'provider_invoice_items',
        'cai_ranges', 'document_sequences', 'hbl_number_counters',
        'client_rate_catalog', 'carrier_catalog', 'locations_catalog',
        'service_products', 'surcharge_rules', 'tax_rates',
        'email_templates', 'miami_carriers'
      )
  ) and (
    select count(*) = 20 and bool_and(permissive = 'RESTRICTIVE')
    from pg_policies
    where schemaname = 'public'
      and policyname = 'tenant_isolation_guard'
      and tablename in (
        'invoices', 'invoice_items', 'invoice_payments',
        'invoice_payment_splits', 'cost_validations', 'cuentas_pagar',
        'pagos_proveedor', 'proveedores', 'provider_invoice_items',
        'cai_ranges', 'document_sequences', 'hbl_number_counters',
        'client_rate_catalog', 'carrier_catalog', 'locations_catalog',
        'service_products', 'surcharge_rules', 'tax_rates',
        'email_templates', 'miami_carriers'
      )
  ),
  'Las 20 tablas de Fase 5 deben exigir tenant, guard y RLS restrictivo'
);

select pg_temp.assert_true(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.document_sequences'::regclass
      and conname = 'document_sequences_pkey'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (tenant_id, sequence_key)'
  ) and exists (
    select 1 from pg_constraint
    where conrelid = 'public.hbl_number_counters'::regclass
      and conname = 'hbl_number_counters_pkey'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (tenant_id, number_date)'
  ),
  'Los contadores deben tener clave primaria por tenant'
);

insert into public.tenants (id, slug, name, status)
values ('00000000-0000-4000-8000-000000000015', 'mya-phase5', 'MYA Phase 5', 'Activo');

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000951', 'authenticated', 'authenticated', 'sari-admin-p5@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000952', 'authenticated', 'authenticated', 'mya-admin-p5@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000953', 'authenticated', 'authenticated', 'platform-p5@test.local', '{}'::jsonb);

update public.profiles
set rol = 'Admin'::public.user_role,
    status = 'Aprobado',
    is_active = true,
    nombre = 'Ana',
    apellido = 'Admin',
    tenant_id = case id
      when '00000000-0000-0000-0000-000000000951' then '00000000-0000-4000-8000-000000000001'::uuid
      when '00000000-0000-0000-0000-000000000952' then '00000000-0000-4000-8000-000000000015'::uuid
      else null
    end,
    is_platform_admin = id = '00000000-0000-0000-0000-000000000953'
where id in (
  '00000000-0000-0000-0000-000000000951',
  '00000000-0000-0000-0000-000000000952',
  '00000000-0000-0000-0000-000000000953'
);

insert into public.clientes (
  id, tenant_id, codigo_cliente, nombre, rtn, vendedor_asignado
) values
  (
    '00000000-0000-4000-8000-000000000351',
    '00000000-0000-4000-8000-000000000001',
    'CLI-P5-SARI', 'Cliente Sari Fase 5', '08011999123456',
    '00000000-0000-0000-0000-000000000951'
  ),
  (
    '00000000-0000-4000-8000-000000000352',
    '00000000-0000-4000-8000-000000000015',
    'CLI-P5-MYA', 'Cliente MYA Fase 5', '08011999654321',
    '00000000-0000-0000-0000-000000000952'
  );

-- Ambos tenants parten del mismo valor para demostrar independencia real.
insert into public.document_sequences (tenant_id, sequence_key, next_value)
values
  ('00000000-0000-4000-8000-000000000001', 'QUOTATION', 9901),
  ('00000000-0000-4000-8000-000000000015', 'QUOTATION', 9901),
  ('00000000-0000-4000-8000-000000000001', 'PROFORMA-209901', 1),
  ('00000000-0000-4000-8000-000000000015', 'PROFORMA-209901', 1)
on conflict (tenant_id, sequence_key) do update
set next_value = excluded.next_value;

insert into public.quotations (
  id, tenant_id, cliente_id, created_by, status, service_product,
  origen, destino
) values
  (
    '00000000-0000-4000-8000-000000000451',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000351',
    '00000000-0000-0000-0000-000000000951',
    'Ganada', 'miami_lcl', 'Miami', 'San Pedro Sula'
  ),
  (
    '00000000-0000-4000-8000-000000000452',
    '00000000-0000-4000-8000-000000000015',
    '00000000-0000-4000-8000-000000000352',
    '00000000-0000-0000-0000-000000000952',
    'Ganada', 'miami_lcl', 'Miami', 'San Pedro Sula'
  );

insert into public.agents (id, tenant_id, name, type)
values
  (
    '00000000-0000-4000-8000-000000000751',
    '00000000-0000-4000-8000-000000000001',
    'Agente Sari P5', 'Agente'
  ),
  (
    '00000000-0000-4000-8000-000000000752',
    '00000000-0000-4000-8000-000000000015',
    'Agente MYA P5', 'Agente'
  );

insert into public.agent_quotes (
  id, tenant_id, quotation_id, agent_id, carrier, costo, moneda, is_selected
) values
  (
    '00000000-0000-4000-8000-000000000851',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000451',
    '00000000-0000-4000-8000-000000000751',
    'Carrier Sari P5', 80, 'USD', true
  ),
  (
    '00000000-0000-4000-8000-000000000852',
    '00000000-0000-4000-8000-000000000015',
    '00000000-0000-4000-8000-000000000452',
    '00000000-0000-4000-8000-000000000752',
    'Carrier MYA P5', 80, 'USD', true
  );

select pg_temp.assert_true(
  (select quotation_number from public.quotations where id = '00000000-0000-4000-8000-000000000451')
  =
  (select quotation_number from public.quotations where id = '00000000-0000-4000-8000-000000000452'),
  'La numeracion de cotizacion debe poder coincidir entre tenants'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000951","role":"authenticated"}',
  true
);

insert into public.service_products (
  value, label, applies_client_rates, active, sort_order
) values ('phase5_shared', 'Producto compartido', false, true, 999);
insert into public.surcharge_rules (
  code, label, service_product, calculation_type
) values ('phase5_shared_rule', 'Regla compartida', 'miami_lcl', 'fixed');
insert into public.email_templates (
  template_key, nombre, asunto, cuerpo, updated_by
) values (
  'phase5_shared', 'Plantilla compartida', 'Asunto', 'Cuerpo',
  '00000000-0000-0000-0000-000000000951'
);
insert into public.miami_carriers (name, created_by)
values ('Carrier compartido P5', '00000000-0000-0000-0000-000000000951');

select * from public.create_manual_invoice_with_items(
  jsonb_build_object(
    'invoice_type', 'Proforma',
    'cliente_id', '00000000-0000-4000-8000-000000000351',
    'issue_date', '2099-01-15',
    'due_date', '2099-02-15',
    'currency', 'USD',
    'exchange_rate', 25
  ),
  jsonb_build_array(jsonb_build_object(
    'description', 'Servicio Sari P5',
    'quantity', 1,
    'unit_price', 100,
    'isv_rate', 15,
    'sort_order', 0
  ))
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000952","role":"authenticated"}',
  true
);

insert into public.service_products (
  value, label, applies_client_rates, active, sort_order
) values
  ('phase5_shared', 'Producto compartido MYA', false, true, 999),
  ('miami_lcl', 'Miami LCL MYA', true, true, 1);
insert into public.surcharge_rules (
  code, label, service_product, calculation_type
) values ('phase5_shared_rule', 'Regla compartida MYA', 'miami_lcl', 'fixed')
on conflict (tenant_id, code) do update
set label = excluded.label;
insert into public.surcharge_rules (
  code, label, service_product, calculation_type
) values ('phase5_shared_rule', 'Regla MYA actualizada', 'miami_lcl', 'fixed')
on conflict (tenant_id, code) do update
set label = excluded.label;
insert into public.email_templates (
  template_key, nombre, asunto, cuerpo, updated_by
) values (
  'phase5_shared', 'Plantilla compartida MYA', 'Asunto', 'Cuerpo',
  '00000000-0000-0000-0000-000000000952'
);
insert into public.miami_carriers (name, created_by)
values ('Carrier compartido P5', '00000000-0000-0000-0000-000000000952');

select pg_temp.expect_denied(
  $$insert into public.service_products (value, label) values ('phase5_shared', 'Duplicado')$$,
  'Un codigo de producto no debe duplicarse dentro de MYA'
);

select * from public.create_manual_invoice_with_items(
  jsonb_build_object(
    'invoice_type', 'Proforma',
    'cliente_id', '00000000-0000-4000-8000-000000000352',
    'issue_date', '2099-01-15',
    'due_date', '2099-02-15',
    'currency', 'USD',
    'exchange_rate', 25
  ),
  jsonb_build_array(jsonb_build_object(
    'description', 'Servicio MYA P5',
    'quantity', 1,
    'unit_price', 100,
    'isv_rate', 15,
    'sort_order', 0
  ))
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.invoices)
  and (select count(*) = 1 from public.invoice_items)
  and (select invoice_number = 'SARI-PRO-209901-001' from public.invoices),
  'MYA debe leer solo su proforma y numerarla con su contador independiente'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.service_products where value = 'phase5_shared')
  and (select count(*) = 1 from public.email_templates where template_key = 'phase5_shared')
  and (select count(*) = 1 and bool_and(label = 'Regla MYA actualizada') from public.surcharge_rules where code = 'phase5_shared_rule')
  and (select count(*) = 1 from public.miami_carriers where name = 'Carrier compartido P5'),
  'MYA debe leer solo sus catalogos configurables'
);

select pg_temp.expect_denied(
  $$select * from public.create_invoice_from_quotation('{}'::jsonb, '00000000-0000-4000-8000-000000000451')$$,
  'La RPC de factura no debe aceptar una cotizacion Sari desde MYA'
);
select pg_temp.expect_denied(
  $$select public.allocate_tenant_document_sequence('00000000-0000-4000-8000-000000000015', 'NO-DIRECT', 1)$$,
  'Los usuarios autenticados no deben ejecutar el numerador interno directamente'
);
select pg_temp.expect_denied(
  $$select * from public.create_invoice_with_items_trusted('{}'::jsonb, '[]'::jsonb)$$,
  'Los usuarios autenticados no deben ejecutar el creador interno de facturas'
);
select pg_temp.assert_true(
  not public.can_access_invoice((
    select id from public.invoices
    where cliente_id = '00000000-0000-4000-8000-000000000351'
  )),
  'El helper de factura debe fallar cerrado para otro tenant'
);
select pg_temp.expect_denied(
  $$insert into public.cost_validations (quotation_id, quoted_cost, invoiced_cost, difference, status) values ('00000000-0000-4000-8000-000000000451', 100, 100, 0, 'Validado')$$,
  'MYA no debe validar costos de una cotizacion Sari'
);
select pg_temp.expect_denied(
  $$insert into public.provider_invoice_items (quotation_id, description, created_by) values ('00000000-0000-4000-8000-000000000451', 'Costo cruzado', '00000000-0000-0000-0000-000000000952')$$,
  'MYA no debe agregar costos de proveedor a Sari'
);

insert into public.proveedores (id, nombre, tipo, agente_id)
values (
  '00000000-0000-4000-8000-000000000552',
  'Proveedor MYA P5', 'Agente',
  '00000000-0000-4000-8000-000000000752'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);
insert into public.proveedores (id, tenant_id, nombre, tipo, agente_id)
values (
  '00000000-0000-4000-8000-000000000551',
  '00000000-0000-4000-8000-000000000001',
  'Proveedor Sari P5', 'Agente',
  '00000000-0000-4000-8000-000000000751'
);

select pg_temp.expect_denied(
  $$insert into public.cuentas_pagar (tenant_id, proveedor_id, descripcion, monto) values ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000551', 'Cuenta cruzada', 100)$$,
  'Una cuenta por pagar no debe referenciar proveedor de otro tenant'
);

-- Aprobar ambas proformas sin recalcular importes para probar pagos y cartera.
update public.invoices
set status = 'Aprobada'
where cliente_id in (
  '00000000-0000-4000-8000-000000000351',
  '00000000-0000-4000-8000-000000000352'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000952","role":"authenticated"}',
  true
);

select * from public.create_freight_account_payable(
  '00000000-0000-4000-8000-000000000452'
);
select * from public.create_freight_account_payable(
  '00000000-0000-4000-8000-000000000452'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(tenant_id = '00000000-0000-4000-8000-000000000015')
    from public.cuentas_pagar
  ),
  'La RPC de CxP debe ser idempotente y conservar el tenant MYA'
);
select pg_temp.expect_denied(
  $$select * from public.create_freight_account_payable('00000000-0000-4000-8000-000000000451')$$,
  'La RPC de CxP no debe operar una cotizacion Sari desde MYA'
);

select * from public.register_invoice_payment(
  (select id from public.invoices),
  15, 'USD', current_date, 'Transferencia', 'MYA-P5', null
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.invoice_payments)
  and (select bool_and(tenant_id = '00000000-0000-4000-8000-000000000015') from public.invoice_payments),
  'El pago de MYA debe heredar su tenant'
);

select pg_temp.expect_denied(
  $$select * from public.register_invoice_payment((select id from public.invoices where cliente_id = '00000000-0000-4000-8000-000000000351'), 10, 'USD', current_date, 'Transferencia', 'CROSS', null)$$,
  'La RPC de pagos no debe operar una factura Sari desde MYA'
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.invoice_receivables),
  'Las proformas no deben aparecer como cuentas por cobrar'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);

select pg_temp.expect_denied(
  format(
    'insert into public.invoice_payment_splits (tenant_id, payment_id, payment_method, amount) values (%L, %L, %L, 15)',
    '00000000-0000-4000-8000-000000000001',
    (select id::text from public.invoice_payments where tenant_id = '00000000-0000-4000-8000-000000000015'),
    'Transferencia'
  ),
  'Un desglose no debe asociarse a un pago de otro tenant'
);

-- Contadores iguales e independientes, incluida la fecha HBL.
delete from public.document_sequences
where sequence_key = 'PHASE5_ASSERT';
select pg_temp.assert_true(
  public.allocate_tenant_document_sequence(
    '00000000-0000-4000-8000-000000000001', 'PHASE5_ASSERT', 1
  ) = 1
  and public.allocate_tenant_document_sequence(
    '00000000-0000-4000-8000-000000000015', 'PHASE5_ASSERT', 1
  ) = 1
  and public.allocate_tenant_document_sequence(
    '00000000-0000-4000-8000-000000000001', 'PHASE5_ASSERT', 1
  ) = 2
  and public.allocate_tenant_document_sequence(
    '00000000-0000-4000-8000-000000000015', 'PHASE5_ASSERT', 1
  ) = 2,
  'Los numeradores deben avanzar de forma independiente por tenant'
);

select pg_temp.assert_true(
  public.allocate_internal_hbl_number_for_tenant(
    '00000000-0000-4000-8000-000000000001', '2099-01-15'
  ) = 'SARI-HBL-20990115-001'
  and public.allocate_internal_hbl_number_for_tenant(
    '00000000-0000-4000-8000-000000000015', '2099-01-15'
  ) = 'SARI-HBL-20990115-001',
  'El contador HBL debe ser independiente por tenant y fecha'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000951","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.invoices)
  and (select invoice_number = 'SARI-PRO-209901-001' from public.invoices)
  and (select count(*) = 0 from public.invoice_payments),
  'Sari debe ver solo su factura y no el pago de MYA'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.service_products where value = 'phase5_shared')
  and (select count(*) = 1 from public.email_templates where template_key = 'phase5_shared'),
  'Sari debe leer solo su propia configuracion'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000953","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.invoices)
  and (select count(*) = 0 from public.proveedores)
  and (select count(*) = 0 from public.service_products),
  'El administrador exclusivo de plataforma no debe asumir datos financieros'
);
select pg_temp.expect_denied(
  $$insert into public.proveedores (nombre, tipo) values ('Sin tenant', 'Agente')$$,
  'Un perfil sin tenant no debe crear proveedores'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_denied(
  $$select * from public.invoices$$,
  'anon no debe leer facturas'
);
select pg_temp.expect_denied(
  $$select * from public.service_products$$,
  'anon no debe leer catalogos'
);
select pg_temp.expect_denied(
  $$select * from public.document_sequences$$,
  'anon no debe leer contadores internos'
);

reset role;
rollback;

\echo 'phase5_finance_catalog_tenant_isolation.sql: OK'

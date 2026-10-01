\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create function pg_temp.expect_denied(command text)
returns void language plpgsql as $$
declare denied boolean := false;
begin
  begin execute command;
  exception when others then denied := true;
  end;
  if not denied then raise exception 'Expected denial: %', command; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values (
  '49700000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'air-pricing@test.local',
  '{}'
);

update public.profiles
set rol = 'Pricing',
    status = 'Aprobado',
    is_active = true
where id = '49700000-0000-0000-0000-000000000001';

insert into public.quotations (
  id, quotation_number, quote_type, tipo_transporte, status, created_by
) values (
  '49710000-0000-0000-0000-000000000001',
  'TEST-AIR-PRESERVE',
  'Consolidado',
  'Aéreo',
  'Pendiente de Fijar Precios',
  '49700000-0000-0000-0000-000000000001'
);

insert into public.agent_quotes (
  id, quotation_id, agente_nombre, ocean_freight, carrier,
  transit_time, valid_until, is_selected
) values
  (
    '49720000-0000-0000-0000-000000000001',
      '49710000-0000-0000-0000-000000000001',
    'Agente anterior', 100, 'OLD AIR', '5 días', current_date + 10, true
  ),
  (
    '49720000-0000-0000-0000-000000000002',
      '49710000-0000-0000-0000-000000000001',
    'Agente nuevo', 120, 'NEW AIR', '3 días', current_date + 20, false
  );

insert into public.pricing_items (
  id, quotation_id, item_type, description, cost_amount, sale_amount,
  quantity, taxable, tax_rate, tax_amount, total_amount, currency,
  supplier, notes, created_by
) values
  (
    '49730000-0000-0000-0000-000000000001',
    '49710000-0000-0000-0000-000000000001',
    'Flete', 'Air Freight Consolidado', 100, 175,
    1, false, 0, 0, 175, 'USD', 'Agente anterior', 'Venta negociada',
    '49700000-0000-0000-0000-000000000001'
  ),
  (
    '49730000-0000-0000-0000-000000000002',
    '49710000-0000-0000-0000-000000000001',
    'Destino', 'Entrega local', 20, 50,
    1, true, 15, 7.5, 57.5, 'USD', 'Proveedor local', 'Servicio confirmado',
    '49700000-0000-0000-0000-000000000001'
  ),
  (
    '49730000-0000-0000-0000-000000000003',
    '49710000-0000-0000-0000-000000000001',
    'Flete', 'Security fee', 5, 10,
    1, false, 0, 0, 10, 'USD', 'Proveedor local', 'Servicio adicional',
    '49700000-0000-0000-0000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49700000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select * from public.select_agent_quote_and_replace_pricing(
  '49710000-0000-0000-0000-000000000001',
  '49720000-0000-0000-0000-000000000002',
  '[{
    "item_type":"Flete",
    "description":"Air Freight Consolidado",
    "cost_amount":120,
    "sale_amount":120,
    "quantity":1,
    "taxable":false,
    "tax_rate":0,
    "tax_amount":0,
    "total_amount":120,
    "currency":"USD",
    "supplier":"Agente nuevo",
    "notes":"Peso cobrable 100.00 KG"
  }]'::jsonb,
  'Cambio de tarifa aérea'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
      and count(*) filter (where id = '49730000-0000-0000-0000-000000000001') = 1
      and count(*) filter (where id = '49730000-0000-0000-0000-000000000002') = 1
      and count(*) filter (where id = '49730000-0000-0000-0000-000000000003') = 1
    from public.pricing_items
    where quotation_id = '49710000-0000-0000-0000-000000000001'
      and deleted_at is null
  ),
  'El cambio de tarifa aérea debe conservar todas las líneas y sus IDs'
);

select pg_temp.assert_true(
  (
    select cost_amount = 120
      and sale_amount = 175
      and total_amount = 175
      and supplier = 'Agente nuevo'
      and notes = 'Venta negociada'
    from public.pricing_items
    where id = '49730000-0000-0000-0000-000000000001'
  ),
  'Solo el costo y proveedor del flete canónico deben actualizarse'
);

select pg_temp.assert_true(
  (
    select cost_amount = 20
      and sale_amount = 50
      and tax_amount = 7.5
      and total_amount = 57.5
      and notes = 'Servicio confirmado'
    from public.pricing_items
    where id = '49730000-0000-0000-0000-000000000002'
  ),
  'La línea de servicio debe quedar intacta'
);

select pg_temp.assert_true(
  (
    select cost_amount = 5
      and sale_amount = 10
      and notes = 'Servicio adicional'
    from public.pricing_items
    where id = '49730000-0000-0000-0000-000000000003'
  ),
  'Un servicio adicional clasificado como Flete también debe conservarse'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(id = '49720000-0000-0000-0000-000000000002')
    from public.agent_quotes
    where quotation_id = '49710000-0000-0000-0000-000000000001'
      and is_selected is true
  ),
  'Debe quedar seleccionada solamente la nueva tarifa aérea'
);

select pg_temp.assert_true(
  (
    select preferred_carrier = 'NEW AIR'
      and transit_time = '3 días'
    from public.quotations
    where id = '49710000-0000-0000-0000-000000000001'
  ),
  'La cabecera comercial debe sincronizarse con la nueva tarifa'
);

select pg_temp.assert_true(
  (
    select metadata->>'preserved_sales' = 'true'
    from public.activity_logs
    where entity_id = '49710000-0000-0000-0000-000000000001'
      and action = 'agent_quote_selected'
    order by created_at desc
    limit 1
  ),
  'La auditoría debe registrar que se conservaron las líneas de venta'
);

select pg_temp.expect_denied($q$
  select public.select_agent_quote_and_replace_pricing(
    '49710000-0000-0000-0000-000000000001',
    '49720000-0000-0000-0000-000000000001',
    '[{"item_type":"Flete","description":"Otro flete","cost_amount":90,"sale_amount":90,"quantity":1,"currency":"USD"}]'::jsonb,
    'Intento sin línea canónica'
  )
$q$);

select pg_temp.assert_true(
  (
    select is_selected is true
    from public.agent_quotes
    where id = '49720000-0000-0000-0000-000000000002'
  ),
  'Una coincidencia inválida no debe cambiar la tarifa seleccionada'
);

select pg_temp.assert_true(
  (
    select count(*) = 3 and sum(sale_amount) = 235
    from public.pricing_items
    where quotation_id = '49710000-0000-0000-0000-000000000001'
      and deleted_at is null
  ),
  'Una coincidencia inválida no debe alterar las líneas existentes'
);

reset role;
rollback;

\echo 'air_consolidated_agent_selection.sql: OK'

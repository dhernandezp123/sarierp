\set ON_ERROR_STOP on
-- Base aislada con el historial completo. Todos los fixtures terminan en ROLLBACK.
begin;

create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.expect_error(command text, expected_message text)
returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if position(expected_message in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Expected error containing: %', expected_message;
end;
$$;

insert into auth.users(id, aud, role, email, raw_user_meta_data) values
  ('fa040000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fcl-initial-pricing@test.local', '{}'),
  ('fa040000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fcl-initial-sales@test.local', '{}');
update public.profiles set
  rol = case when id = 'fa040000-0000-4000-8000-000000000001' then 'Pricing'::public.user_role else 'Ventas'::public.user_role end,
  status = 'Aprobado', is_active = true,
  tenant_id = '00000000-0000-4000-8000-000000000001'
where id::text like 'fa040000-%';
insert into public.quotations(id, quotation_number, quote_type, status, created_by, tenant_id)
select ('fa041000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'TEST-FCL-INITIAL-' || n, 'FCL', 'Pendiente de Fijar Precios',
  'fa040000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;
insert into public.agent_quotes(id, quotation_id, agente_nombre, ocean_freight, is_selected, tenant_id)
select ('fa042000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('fa041000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Agente inicial', 2000, false,
  '00000000-0000-4000-8000-000000000001'
from generate_series(1, 4) n;
insert into public.agent_quotes(id, quotation_id, agente_nombre, ocean_freight, is_selected, tenant_id)
values ('fa042000-0000-4000-8000-000000000005', 'fa041000-0000-4000-8000-000000000001', 'Otro agente', 2200, false,
  '00000000-0000-4000-8000-000000000001');

-- Caso reportado: DTHC y entrega local antes de elegir el primer agente.
insert into public.pricing_items(id, quotation_id, item_type, description, cost_amount, sale_amount,
  quantity, taxable, tax_rate, tax_amount, total_amount, currency, supplier, notes) values
  ('fa043000-0000-4000-8000-000000000001', 'fa041000-0000-4000-8000-000000000001', 'Destino', 'DTHC',
    715, 735, 2, false, 0, 0, 1470, 'USD', 'ONE-SEPOSA', 'Conservar cargo'),
  ('fa043000-0000-4000-8000-000000000002', 'fa041000-0000-4000-8000-000000000001', 'Destino', 'Entrega local',
    600, 625, 2, true, 15, 187.5, 1437.5, 'USD', 'Proveedor local', 'Conservar ISV'),
  ('fa043000-0000-4000-8000-000000000003', 'fa041000-0000-4000-8000-000000000002', 'Flete', 'Ocean Freight Contenedor 40HC',
    900, 1300, 2, true, 15, 390, 2990, 'USD', 'Anterior', 'Venta ya negociada'),
  ('fa043000-0000-4000-8000-000000000004', 'fa041000-0000-4000-8000-000000000003', 'Flete', 'Ocean Freight Contenedor 40HC',
    900, 1300, 3, false, 0, 0, 3900, 'USD', 'Anterior', 'Cantidad incompatible');
-- Un snapshot ofrecido sigue congelado aunque el flete de trabajo cambie.
insert into public.quotation_options(id, quotation_id, agent_quote_id, option_code, label, status,
  cost_total, sale_subtotal, grand_total, created_by)
values ('fa044000-0000-4000-8000-000000000001', 'fa041000-0000-4000-8000-000000000002',
  'fa042000-0000-4000-8000-000000000002', 'A', 'Oferta congelada', 'Ofrecida', 1800, 2600, 2990,
  'fa040000-0000-4000-8000-000000000001');
insert into public.quotation_option_items(quotation_option_id, source_pricing_item_id, item_type,
  description, cost_amount, sale_amount, quantity, total_amount)
values ('fa044000-0000-4000-8000-000000000001', 'fa043000-0000-4000-8000-000000000003',
  'Flete', 'Ocean Freight Contenedor 40HC', 900, 1300, 2, 2990);
create temp table before_initial as select * from public.pricing_items where id::text like 'fa043000-%';
grant select on before_initial to authenticated;

insert into public.tenants(id, slug, name)
values ('fa045000-0000-4000-8000-000000000001', 'fcl-initial-other', 'FCL otra empresa');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
values ('fa040000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'fcl-other-pricing@test.local', '{}');
update public.profiles set rol = 'Pricing', status = 'Aprobado', is_active = true,
  tenant_id = 'fa045000-0000-4000-8000-000000000001' where id = 'fa040000-0000-4000-8000-000000000003';
insert into public.quotations(id, quotation_number, quote_type, status, created_by, tenant_id)
values ('fa041000-0000-4000-8000-000000000005', 'TEST-FCL-OTHER', 'FCL', 'Pendiente de Fijar Precios',
  'fa040000-0000-4000-8000-000000000003', 'fa045000-0000-4000-8000-000000000001');
insert into public.agent_quotes(id, quotation_id, agente_nombre, is_selected, tenant_id)
values ('fa042000-0000-4000-8000-000000000006', 'fa041000-0000-4000-8000-000000000005',
  'Agente otra empresa', false, 'fa045000-0000-4000-8000-000000000001');

create function pg_temp.select_fcl(p_number integer, p_agent integer default null, p_lines jsonb default null)
returns void language plpgsql as $$
begin
  perform public.select_agent_quote_and_replace_pricing(
    ('fa041000-0000-4000-8000-' || lpad(p_number::text, 12, '0'))::uuid,
    ('fa042000-0000-4000-8000-' || lpad(coalesce(p_agent, p_number)::text, 12, '0'))::uuid,
    coalesce(p_lines, '[
      {"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","quantity":2,"cost_amount":1000,"sale_amount":1000,"total_amount":2000,"currency":"USD","supplier":"Agente inicial"},
      {"item_type":"Flete","description":"Ocean Freight Contenedor 20GP","quantity":1,"cost_amount":800,"sale_amount":800,"total_amount":800,"currency":"USD","supplier":"Agente inicial"},
      {"item_type":"Origen","description":"EXW","quantity":1,"cost_amount":100,"sale_amount":100,"total_amount":100,"currency":"USD","supplier":"Agente inicial"}
    ]'::jsonb), 'Regresión: primera selección FCL');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa040000-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- Antes del fix falla aquí con "Las líneas de flete cambiaron".
select pg_temp.select_fcl(1);
select pg_temp.assert_true((select count(*) = 5 from public.pricing_items
  where quotation_id = 'fa041000-0000-4000-8000-000000000001' and deleted_at is null),
  'Primera selección agrega dos fletes y EXW conservando los dos cargos de destino');
select pg_temp.assert_true((select count(*) = 2 from public.pricing_items pi join before_initial b on b.id = pi.id
  where b.item_type = 'Destino' and to_jsonb(pi) = to_jsonb(b)),
  'IDs, costos, venta, cantidades, moneda, proveedores, ISV y notas de destino intactos');
select pg_temp.assert_true((select count(*) = 3 and sum(total_amount) = 2900 from public.pricing_items
  where quotation_id = 'fa041000-0000-4000-8000-000000000001' and item_type <> 'Destino'),
  'Nuevas líneas mantienen los importes del payload');

-- Repetir y cambiar agente no duplica cargos ni altera ventas.
select pg_temp.select_fcl(1);
select pg_temp.select_fcl(1, 5, '[
  {"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","quantity":2,"cost_amount":1100,"sale_amount":1100,"currency":"USD","supplier":"Otro agente"},
  {"item_type":"Flete","description":"Ocean Freight Contenedor 20GP","quantity":1,"cost_amount":900,"sale_amount":900,"currency":"USD","supplier":"Otro agente"},
  {"item_type":"Origen","description":"EXW","quantity":1,"cost_amount":150,"sale_amount":150,"currency":"USD","supplier":"Otro agente"}
]');
select pg_temp.assert_true((select count(*) = 5 and sum(total_amount) = 5807.5 from public.pricing_items
  where quotation_id = 'fa041000-0000-4000-8000-000000000001'), 'Reintento y cambio conservan venta sin duplicar');
select pg_temp.assert_true((select cost_amount = 1100 and sale_amount = 1000 and supplier = 'Otro agente'
  from public.pricing_items where quotation_id = 'fa041000-0000-4000-8000-000000000001'
    and description = 'Ocean Freight Contenedor 40HC'), 'Cambio posterior solo actualiza costo y proveedor');
select pg_temp.assert_true((select count(*) = 1 and bool_and(id = 'fa042000-0000-4000-8000-000000000005')
  from public.agent_quotes where quotation_id = 'fa041000-0000-4000-8000-000000000001' and is_selected), 'Selección única');

-- Primera selección con parte del flete ya ingresado: reutilizarlo y agregar solo faltantes.
select pg_temp.select_fcl(2);
select pg_temp.assert_true((select pi.cost_amount = 1000 and pi.supplier = 'Agente inicial'
  and (to_jsonb(pi) - 'cost_amount' - 'supplier') = (to_jsonb(b) - 'cost_amount' - 'supplier')
  from public.pricing_items pi join before_initial b on pi.id = b.id
  where pi.id = 'fa043000-0000-4000-8000-000000000003'), 'Flete manual coincidente conserva su venta, ISV e ID');
select pg_temp.assert_true((select count(*) = 3 from public.pricing_items
  where quotation_id = 'fa041000-0000-4000-8000-000000000002'), 'Inserta solo el segundo tipo y EXW');
select pg_temp.assert_true((select cost_total = 1800 and sale_subtotal = 2600 and grand_total = 2990
  from public.quotation_options where id = 'fa044000-0000-4000-8000-000000000001'), 'Opción ofrecida intacta');
select pg_temp.assert_true((select cost_amount = 900 and sale_amount = 1300 and total_amount = 2990
  and source_pricing_item_id = 'fa043000-0000-4000-8000-000000000003'
  from public.quotation_option_items where quotation_option_id = 'fa044000-0000-4000-8000-000000000001'),
  'Snapshot y referencia al cargo permanecen intactos');

-- Cantidad/moneda/duplicados incompatibles deben abortar, nunca borrar ni duplicar ventas.
select pg_temp.expect_error('select pg_temp.select_fcl(3)', 'No coincide la línea');
select pg_temp.assert_true((select not is_selected from public.agent_quotes
  where id = 'fa042000-0000-4000-8000-000000000003'), 'Error no selecciona agente');
select pg_temp.assert_true((select count(*) = 1 and bool_and(to_jsonb(pi) = to_jsonb(b))
  from public.pricing_items pi join before_initial b on pi.id = b.id
  where pi.quotation_id = 'fa041000-0000-4000-8000-000000000003'), 'Error conserva datos originales');
select pg_temp.expect_error($q$select pg_temp.select_fcl(3, null,
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","quantity":3,"cost_amount":1,"sale_amount":1,"currency":"EUR"}]')$q$, 'No coincide la línea');
select pg_temp.expect_error($q$select pg_temp.select_fcl(3, null,
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","quantity":3,"cost_amount":1,"sale_amount":1},
    {"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","quantity":3,"cost_amount":1,"sale_amount":1}]')$q$, 'No se pueden identificar');
insert into public.pricing_items(quotation_id, item_type, description, quantity, cost_amount, sale_amount, total_amount)
values ('fa041000-0000-4000-8000-000000000003', 'Flete', 'Ocean Freight Contenedor 40HC', 2, 10, 20, 40);
select pg_temp.expect_error('select pg_temp.select_fcl(3)', 'No se pueden identificar');
-- El resguardo de composición sigue vigente cuando ya había agente seleccionado.
select pg_temp.expect_error($q$select pg_temp.select_fcl(1, 1,
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","quantity":2,"cost_amount":1,"sale_amount":1}]')$q$, 'Las líneas de flete cambiaron');
select pg_temp.assert_true((select is_selected from public.agent_quotes
  where id = 'fa042000-0000-4000-8000-000000000005'), 'Error conserva la selección anterior');

-- Sin líneas previas se mantiene la generación inicial habitual.
select pg_temp.select_fcl(4);
select pg_temp.assert_true((select count(*) = 3 from public.pricing_items
  where quotation_id = 'fa041000-0000-4000-8000-000000000004'), 'Primera selección sin cargos sigue funcionando');
select pg_temp.expect_error('select pg_temp.select_fcl(5, 6)', 'No se puede operar sobre otra empresa');
select set_config('request.jwt.claims', '{"sub":"fa040000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.expect_error('select pg_temp.select_fcl(1)', 'No tienes permiso');
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.profiles set is_active = false where id = 'fa040000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa040000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error('select pg_temp.select_fcl(1)', 'No tienes permiso');
reset role;
select pg_temp.assert_true((select not is_selected from public.agent_quotes
  where id = 'fa042000-0000-4000-8000-000000000006'), 'No se modificó el agente de otra empresa');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.select_agent_quote_and_replace_pricing(uuid,uuid,jsonb,text)', 'execute'), 'Anon no puede seleccionar');
rollback;

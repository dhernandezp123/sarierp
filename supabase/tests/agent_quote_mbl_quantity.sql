\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
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

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('49800000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mbl-pricing@test.local', '{}'),
  ('49800000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mbl-client@test.local', '{}');
update public.profiles set rol = 'Pricing', status = 'Aprobado', is_active = true
where id = '49800000-0000-0000-0000-000000000001';
update public.profiles set rol = 'Cliente', status = 'Aprobado', is_active = true
where id = '49800000-0000-0000-0000-000000000002';

insert into public.quotations (id, quotation_number, quote_type, status, created_by)
values ('49810000-0000-0000-0000-000000000001', 'TEST-MBL-3', 'FCL', 'Pendiente de Fijar Precios', '49800000-0000-0000-0000-000000000001');
insert into public.agent_quotes (id, quotation_id, agente_nombre, ocean_freight, mbl_fee, profit_per_container, is_selected)
values ('49820000-0000-0000-0000-000000000001', '49810000-0000-0000-0000-000000000001', 'Agente MBL', 85360, 50, 50, true);

select pg_temp.assert_true((select mbl_quantity = 1 from public.agent_quotes where id = '49820000-0000-0000-0000-000000000001'), 'Compatibilidad: default 1 MBL');
select pg_temp.expect_denied($q$update public.agent_quotes set mbl_quantity = 0 where id = '49820000-0000-0000-0000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.agent_quotes set mbl_quantity = -1 where id = '49820000-0000-0000-0000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.agent_quotes set mbl_quantity = null where id = '49820000-0000-0000-0000-000000000001'$q$);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"49800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.agent_quotes set mbl_quantity = 3 where id = '49820000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select mbl_quantity = 3 and ocean_freight + mbl_fee * mbl_quantity + profit_per_container * 10 = 86010
  from public.agent_quotes where id = '49820000-0000-0000-0000-000000000001'), 'Pricing autorizado guarda 3 MBL y total 86,010');

-- Primera selección conserva el comportamiento de crear venta inicial al costo.
select * from public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":8591,"sale_amount":8591,"quantity":10,"currency":"USD"}]', 'Selección inicial');
select pg_temp.assert_true((select count(*) = 1 and min(sale_amount) = 8591 from public.pricing_items
  where quotation_id = '49810000-0000-0000-0000-000000000001'), 'Sin venta previa: se generan las líneas');

update public.pricing_items set sale_amount = 9365, total_amount = 93650, notes = 'Venta acordada'
where quotation_id = '49810000-0000-0000-0000-000000000001';
insert into public.pricing_items (quotation_id, item_type, description, cost_amount, sale_amount, quantity, taxable, tax_rate, tax_amount, total_amount)
values ('49810000-0000-0000-0000-000000000001', 'Destino', 'Entrega local', 500, 550, 10, true, 15, 825, 6325);
reset role;
create temp table before_mbl as select * from public.pricing_items where quotation_id = '49810000-0000-0000-0000-000000000001';
grant select on before_mbl to authenticated;

insert into public.quotation_options (id, quotation_id, agent_quote_id, option_code, label, status, cost_total, sale_subtotal, grand_total, created_by)
values ('49830000-0000-0000-0000-000000000001', '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001', 'A', 'Oferta congelada', 'Ofrecida', 85910, 93650, 93650, '49800000-0000-0000-0000-000000000001');
insert into public.quotation_option_items (quotation_option_id, source_pricing_item_id, item_type, description, cost_amount, sale_amount, quantity, total_amount)
select '49830000-0000-0000-0000-000000000001', id, item_type, description, cost_amount, sale_amount, quantity, total_amount
from before_mbl where item_type = 'Flete';

set local role authenticated;
select * from public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":8601,"sale_amount":8601,"quantity":10,"currency":"USD","supplier":"Agente MBL"}]', 'Aplicar 3 MBL');
select pg_temp.assert_true((select count(*) = 2 from public.pricing_items pi join before_mbl b on b.id = pi.id
  where pi.sale_amount = b.sale_amount and pi.quantity = b.quantity
    and pi.tax_amount is not distinct from b.tax_amount and pi.total_amount = b.total_amount
    and pi.notes is not distinct from b.notes), 'Se conservan IDs, venta, notas, cantidades, impuestos y totales');
select pg_temp.assert_true((select cost_amount = 8601 and sale_amount = 9365 from public.pricing_items
  where quotation_id = '49810000-0000-0000-0000-000000000001' and item_type = 'Flete'), 'Solo se actualiza costo flete');
select pg_temp.assert_true((select cost_amount = 500 from public.pricing_items
  where quotation_id = '49810000-0000-0000-0000-000000000001' and item_type = 'Destino'), 'Otros cargos intactos');
select pg_temp.assert_true((select cost_total = 85910 and sale_subtotal = 93650 from public.quotation_options
  where id = '49830000-0000-0000-0000-000000000001'), 'Opción ofrecida conserva snapshot');
select pg_temp.assert_true((select cost_amount = 8591 and sale_amount = 9365 and source_pricing_item_id is not null
  from public.quotation_option_items where quotation_option_id = '49830000-0000-0000-0000-000000000001'), 'Ítems ofrecidos y referencias permanecen intactos');

-- Matching ambiguo, moneda distinta o cantidad cambiada: rollback completo.
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001', null, 'Sin líneas')$q$);
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":1,"sale_amount":1,"quantity":10},
    {"item_type":"Origen","description":"EXW","cost_amount":20,"sale_amount":20,"quantity":1}]', 'Nuevo EXW no mapeado')$q$);
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":1,"sale_amount":1,"quantity":10},
    {"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":2,"sale_amount":2,"quantity":10}]', 'Flete duplicado')$q$);
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":1,"sale_amount":1,"quantity":9,"currency":"USD"}]', 'Cantidad incorrecta')$q$);
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":1,"sale_amount":1,"quantity":10,"currency":"EUR"}]', 'Moneda incorrecta')$q$);
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Otro flete","cost_amount":1,"sale_amount":1,"quantity":10}]', 'Descripción distinta')$q$);

-- RLS y RPC rechazan al Cliente, sin exponer una ruta de escritura nueva.
select set_config('request.jwt.claims', '{"sub":"49800000-0000-0000-0000-000000000002","role":"authenticated"}', true);
with changed as (update public.agent_quotes set mbl_quantity = 7 where id = '49820000-0000-0000-0000-000000000001' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'RLS impide al Cliente cambiar cantidad de MBL');
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":1,"sale_amount":1,"quantity":10}]', 'Cliente no autorizado')$q$);
reset role;
select pg_temp.assert_true((select cost_amount = 8601 from public.pricing_items
  where quotation_id = '49810000-0000-0000-0000-000000000001' and item_type = 'Flete'), 'Rechazos no alteran costo');

update public.quotations set status = 'Enviada al Cliente' where id = '49810000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"49800000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_denied($q$select public.select_agent_quote_and_replace_pricing(
  '49810000-0000-0000-0000-000000000001', '49820000-0000-0000-0000-000000000001',
  '[{"item_type":"Flete","description":"Ocean Freight Contenedor 40HC","cost_amount":1,"sale_amount":1,"quantity":10}]', 'Cotización bloqueada')$q$);
reset role;
select pg_temp.assert_true(not has_function_privilege('anon', 'public.select_agent_quote_and_replace_pricing(uuid,uuid,jsonb,text)', 'execute'), 'Anon sin acceso RPC');
rollback;

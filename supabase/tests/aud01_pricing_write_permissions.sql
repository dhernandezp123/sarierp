\set ON_ERROR_STOP on
-- Ejecutar solo en una base aislada con el historial completo, incluida AUD-01.
-- Las comprobaciones de denegacion no aceptan errores de esquema/fixtures.
begin;

create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.expect_write_denied(command text, message text)
returns void language plpgsql as $$
declare changed integer;
begin
  begin
    execute command;
    get diagnostics changed = row_count;
  exception when insufficient_privilege then return;
  end;
  if changed <> 0 then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.as_user(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

insert into public.tenants(id, slug, name)
values ('ad010000-0000-4000-8000-000000000100', 'aud01-other', 'AUD-01 otra empresa');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('ad010000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'aud01-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 12) n;
update public.profiles set
  rol = case right(id::text, 3)
    when '001' then 'Admin'::public.user_role
    when '002' then 'Pricing'::public.user_role
    when '003' then 'Ventas'::public.user_role
    when '004' then 'Ventas'::public.user_role
    when '005' then 'Operaciones'::public.user_role
    when '006' then 'Contabilidad'::public.user_role
    when '007' then 'Finanzas'::public.user_role
    when '008' then 'Cliente'::public.user_role
    when '012' then 'Admin'::public.user_role
    else 'Pricing'::public.user_role end,
  status = case when right(id::text, 3) = '010' then 'Pendiente' else 'Aprobado' end,
  is_active = right(id::text, 3) <> '009',
  is_platform_admin = right(id::text, 3) = '012',
  tenant_id = case right(id::text, 3)
    when '011' then 'ad010000-0000-4000-8000-000000000100'::uuid
    when '012' then null
    else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ad010000-%' and id <> 'ad010000-0000-4000-8000-000000000100';

insert into public.clientes(id, nombre, tenant_id, vendedor_asignado) values
  ('ad011000-0000-4000-8000-000000000001', 'AUD-01 Sari', '00000000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000003'),
  ('ad011000-0000-4000-8000-000000000002', 'AUD-01 otro vendedor', '00000000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000004'),
  ('ad011000-0000-4000-8000-000000000003', 'AUD-01 otra empresa', 'ad010000-0000-4000-8000-000000000100', null);
insert into public.quotations(id, cliente_id, created_by, tenant_id, status, service_product, quote_type, commodity) values
  ('ad012000-0000-4000-8000-000000000001', 'ad011000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Pendiente de Fijar Precios', 'other_origin_fcl', 'FCL', 'AUD-01 FCL'),
  ('ad012000-0000-4000-8000-000000000002', 'ad011000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Pricing Aprobado', 'miami_lcl', 'LCL', 'AUD-01 Miami'),
  ('ad012000-0000-4000-8000-000000000003', 'ad011000-0000-4000-8000-000000000002', 'ad010000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Borrador', 'miami_air', 'Consolidado', 'AUD-01 otro vendedor'),
  ('ad012000-0000-4000-8000-000000000004', 'ad011000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Ganada', 'other_origin_fcl', 'FCL', 'AUD-01 cerrada'),
  ('ad012000-0000-4000-8000-000000000005', 'ad011000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Pricing Aprobado', 'other_origin_fcl', 'FCL', 'AUD-01 aprobada'),
  ('ad012000-0000-4000-8000-000000000006', 'ad011000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Enviada al Cliente', 'miami_lcl', 'LCL', 'AUD-01 Miami enviada'),
  ('ad012000-0000-4000-8000-000000000007', 'ad011000-0000-4000-8000-000000000003', 'ad010000-0000-4000-8000-000000000011', 'ad010000-0000-4000-8000-000000000100', 'Borrador', 'other_origin_fcl', 'FCL', 'AUD-01 otra empresa');
update public.quotations set tipo_transporte = case
  when service_product = 'miami_air' then 'Aéreo' else 'Marítimo' end
where id::text like 'ad012000-%';
insert into public.pricing_items(id, quotation_id, description, item_type, quantity, cost_amount, sale_amount, total_amount)
select ('ad013000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('ad012000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Ocean Freight', 'Flete', 1, 100, 150, 150 from generate_series(1, 7) n;
insert into public.agent_quotes(id, quotation_id, agente_nombre, ocean_freight, valid_until, is_selected, tenant_id) values
  ('ad014000-0000-4000-8000-000000000001', 'ad012000-0000-4000-8000-000000000001', 'AUD-01 agente', 100, current_date + 30, false, '00000000-0000-4000-8000-000000000001'),
  ('ad014000-0000-4000-8000-000000000004', 'ad012000-0000-4000-8000-000000000004', 'AUD-01 vencido', 100, current_date - 1, true, '00000000-0000-4000-8000-000000000001'),
  ('ad014000-0000-4000-8000-000000000005', 'ad012000-0000-4000-8000-000000000005', 'AUD-01 aprobado', 100, current_date + 30, false, '00000000-0000-4000-8000-000000000001');
insert into public.agent_quote_container_rates(id, agent_quote_id, container_type_name, quantity, ocean_freight)
values ('ad016000-0000-4000-8000-000000000001', 'ad014000-0000-4000-8000-000000000001', '40HC', 1, 100);
-- AUD-05 validates commercial completeness on approval, not only permission.
update public.agent_quotes set carrier = 'AUD-01 carrier' where id = 'ad014000-0000-4000-8000-000000000001';
insert into public.client_rates(id, cliente_id, rate_code, rate_label, category, currency, amount)
values ('ad015000-0000-4000-8000-000000000001', 'ad011000-0000-4000-8000-000000000001', 'AUD01', 'Tarifa prueba', 'Flete', 'USD', 10);
-- Operaciones tiene lectura real de la cotizacion y sus precios mediante SI.
select pg_temp.as_user('ad010000-0000-4000-8000-000000000001');
insert into public.shipping_instructions(id, quotation_id, client_id, created_by, tenant_id)
values ('ad017000-0000-4000-8000-000000000001', 'ad012000-0000-4000-8000-000000000001',
  'ad011000-0000-4000-8000-000000000001', 'ad010000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001');

set local role authenticated;
select pg_temp.as_user('ad010000-0000-4000-8000-000000000003');
select pg_temp.assert_true((select count(*) = 1 from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000001'), 'Ventas conserva lectura FCL');
-- Esta es la reproduccion antes del fix: la policy anterior modifica la fila.
select pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ad013000-0000-4000-8000-000000000001'$cmd$, 'Ventas no debe editar venta FCL por tener lectura');
select pg_temp.expect_write_denied($cmd$insert into public.pricing_items(quotation_id, item_type, description) values ('ad012000-0000-4000-8000-000000000001', 'Flete', 'No autorizado')$cmd$, 'Ventas no inserta pricing FCL');
select pg_temp.expect_write_denied($cmd$delete from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000001'$cmd$, 'Ventas no borra pricing FCL');
select pg_temp.expect_write_denied($cmd$update public.agent_quotes set ocean_freight = 999 where id = 'ad014000-0000-4000-8000-000000000001'$cmd$, 'Ventas no edita tarifas de agente');
select pg_temp.expect_write_denied($cmd$update public.agent_quote_container_rates set ocean_freight = 999 where id = 'ad016000-0000-4000-8000-000000000001'$cmd$, 'Ventas no edita costos por contenedor');
select pg_temp.expect_write_denied($cmd$select * from public.replace_quotation_child_lines('ad012000-0000-4000-8000-000000000001', false, '[]', false, '[]', true, '[]')$cmd$, 'La RPC no permite eludir el permiso de pricing');
select pg_temp.expect_write_denied($cmd$select * from public.create_quotation_with_child_lines('{"cliente_id":"ad011000-0000-4000-8000-000000000001","service_product":"other_origin_fcl","status":"Borrador"}', '[]', '[]', '[{"description":"Flete","quantity":1,"sale_amount":123}]')$cmd$, 'Ventas no inyecta pricing FCL durante creacion');
select pg_temp.expect_write_denied($cmd$select * from public.create_quotation_with_child_lines('{"cliente_id":"ad011000-0000-4000-8000-000000000001","service_product":"miami_lcl","status":"Ganada"}', '[]', '[]', '[{"description":"Flete","quantity":1,"sale_amount":123}]')$cmd$, 'Creacion Miami no elude el bloqueo de un estado cerrado');
select pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ad013000-0000-4000-8000-000000000003'$cmd$, 'Ventas no modifica Miami de otro vendedor');
select pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ad013000-0000-4000-8000-000000000004'$cmd$, 'Ventas no modifica una cotizacion ganada');
select pg_temp.expect_write_denied($cmd$select public.notify_expired_agent_quotes_for_current_tenant()$cmd$, 'Ventas no procesa avisos de pricing');

-- Miami propia y el editor INVOKER conservan reemplazo atomico y sus permisos.
select * from public.save_quotation_edit('ad012000-0000-4000-8000-000000000002', 'Pricing Aprobado',
  '{"commodity":"Miami editada","total_sale":175}', false, '[]', false, '[]', true,
  '[{"item_type":"Flete","description":"Miami editable","quantity":1,"cost_amount":100,"sale_amount":175,"total_amount":175}]', false);
select pg_temp.assert_true((select sale_amount = 175 from public.pricing_items where quotation_id = 'ad012000-0000-4000-8000-000000000002'), 'Editor Miami guarda sus cargos');
select * from public.save_quotation_edit('ad012000-0000-4000-8000-000000000006', 'Enviada al Cliente',
  '{"commodity":"Miami reenviada"}', false, '[]', false, '[]', true,
  '[{"item_type":"Flete","description":"Miami enviada","quantity":1,"cost_amount":100,"sale_amount":175,"total_amount":175}]', true, 0, 'AUD05 reenvio Miami');
select pg_temp.assert_true((select status = 'Pendiente de Fijar Precios' from public.quotations where id = 'ad012000-0000-4000-8000-000000000006'), 'Reenvio Miami conserva transaccion');
select * from public.create_quotation_with_child_lines(
  '{"id":"ad012000-0000-4000-8000-000000000008","cliente_id":"ad011000-0000-4000-8000-000000000001","service_product":"miami_air","status":"Borrador"}',
  '[]', '[]', '[{"item_type":"Flete","description":"Miami nueva","quantity":1,"cost_amount":10,"sale_amount":20,"total_amount":20}]');
select pg_temp.assert_true((select count(*) = 1 from public.pricing_items where quotation_id = 'ad012000-0000-4000-8000-000000000008'), 'Ventas crea Miami con cargos atomicos');
select * from public.create_quotation_with_child_lines(
  '{"id":"ad012000-0000-4000-8000-000000000009","cliente_id":"ad011000-0000-4000-8000-000000000001","service_product":"other_origin_fcl","status":"Borrador"}', '[]', '[]', '[]');
select * from public.create_quotation_with_child_lines(
  '{"id":"ad012000-0000-4000-8000-000000000010","cliente_id":"ad011000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}', '[]', '[]', '[]');
select pg_temp.assert_true((select status = 'Borrador' from public.quotations where id = 'ad012000-0000-4000-8000-000000000010'), 'Creacion sin estado no reintroduce Solicitud legacy');
select public.replace_client_rates('ad011000-0000-4000-8000-000000000001', 'SPS', '[]', '["AUD01"]',
  '[{"rate_code":"AUD01","rate_label":"Tarifa prueba","category":"Flete","amount":15}]');

-- Ningun rol de consulta, perfil no aprobado/inactivo o usuario cross-tenant
-- puede alterar filas ni invocar cores privados o RPC de reemplazo financiero.
do $$
declare n integer;
begin
  foreach n in array array[5,6,7,8,9,10,11,12] loop
    perform pg_temp.as_user(('ad010000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid);
    if n = 5 then
      perform pg_temp.assert_true((select count(*) = 1 from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000001'), 'Operaciones conserva lectura con SI');
    end if;
    perform pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ad013000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no actualiza pricing');
    perform pg_temp.expect_write_denied($cmd$delete from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no borra pricing');
    perform pg_temp.expect_write_denied($cmd$insert into public.pricing_items(quotation_id,item_type,description) values('ad012000-0000-4000-8000-000000000001','Flete','Denegado')$cmd$, 'Rol de consulta no inserta pricing');
    perform pg_temp.expect_write_denied($cmd$update public.agent_quotes set ocean_freight = 999 where id = 'ad014000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no actualiza agente');
    perform pg_temp.expect_write_denied($cmd$insert into public.agent_quotes(quotation_id,agente_nombre) values('ad012000-0000-4000-8000-000000000001','Denegado')$cmd$, 'Rol de consulta no inserta agente');
    perform pg_temp.expect_write_denied($cmd$delete from public.agent_quotes where id = 'ad014000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no borra agente');
    perform pg_temp.expect_write_denied($cmd$update public.agent_quote_container_rates set ocean_freight = 999 where id = 'ad016000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no actualiza contenedores');
    perform pg_temp.expect_write_denied($cmd$insert into public.agent_quote_container_rates(agent_quote_id,container_type_name) values('ad014000-0000-4000-8000-000000000001','40HC')$cmd$, 'Rol de consulta no inserta contenedores');
    perform pg_temp.expect_write_denied($cmd$delete from public.agent_quote_container_rates where id = 'ad016000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no borra contenedores');
    perform pg_temp.expect_write_denied($cmd$update public.client_rates set amount = 999 where cliente_id = 'ad011000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no actualiza tarifas de cliente');
    perform pg_temp.expect_write_denied($cmd$delete from public.client_rates where cliente_id = 'ad011000-0000-4000-8000-000000000001'$cmd$, 'Rol de consulta no borra tarifas de cliente');
    perform pg_temp.expect_write_denied($cmd$insert into public.client_rates(cliente_id,rate_code,rate_label,category) values('ad011000-0000-4000-8000-000000000001','BAD','Denegado','Flete')$cmd$, 'Rol de consulta no inserta tarifas de cliente');
    perform pg_temp.expect_write_denied($cmd$select public.replace_client_rates('ad011000-0000-4000-8000-000000000001','SPS','[]','[]','[]')$cmd$, 'RPC tarifas no amplifica lectura');
    perform pg_temp.expect_write_denied($cmd$select * from public.replace_quotation_child_lines('ad012000-0000-4000-8000-000000000001',false,'[]',false,'[]',true,'[]')$cmd$, 'RPC pricing no amplifica lectura');
    perform pg_temp.expect_write_denied($cmd$select * from public.replace_quotation_child_lines_aud01_internal('ad012000-0000-4000-8000-000000000001',false,'[]',false,'[]',true,'[]')$cmd$, 'Core pricing no expuesto');
    perform pg_temp.expect_write_denied($cmd$select public.replace_client_rates_aud01_internal('ad011000-0000-4000-8000-000000000001','SPS','[]','[]','[]')$cmd$, 'Core tarifas no expuesto');
    perform pg_temp.expect_write_denied($cmd$select * from public.create_quotation_with_child_lines_aud01_internal('{}','[]','[]','[]')$cmd$, 'Core creacion no expuesto');
  end loop;
end;
$$;

-- Pricing y Admin conservan escritura. El flag seleccionado solo cambia en
-- la RPC canonica, que conserva los precios FCL y el snapshot comercial.
select pg_temp.as_user('ad010000-0000-4000-8000-000000000002');
update public.pricing_items set sale_amount = 155, total_amount = 155 where id = 'ad013000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select sale_amount = 155 from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000001'), 'Pricing modifica cargos editables');
update public.agent_quotes set ocean_freight = 110 where id = 'ad014000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select ocean_freight = 110 from public.agent_quotes where id = 'ad014000-0000-4000-8000-000000000001'), 'Pricing modifica tarifa pendiente');
update public.agent_quote_container_rates set ocean_freight = 110 where id = 'ad016000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select ocean_freight = 110 from public.agent_quote_container_rates where id = 'ad016000-0000-4000-8000-000000000001'), 'Pricing modifica costo por contenedor');
insert into public.agent_quotes(id,quotation_id,agente_nombre,is_selected)
values ('ad014000-0000-4000-8000-000000000010','ad012000-0000-4000-8000-000000000001','Nueva tarifa',false);
insert into public.agent_quote_container_rates(agent_quote_id,container_type_name)
values ('ad014000-0000-4000-8000-000000000010','40HC');
select pg_temp.assert_true((select count(*) = 1 from public.agent_quote_container_rates where agent_quote_id = 'ad014000-0000-4000-8000-000000000010'), 'Pricing agrega tarifas y costos de contenedor');
select pg_temp.expect_write_denied($cmd$insert into public.agent_quotes(quotation_id,agente_nombre,is_selected) values('ad012000-0000-4000-8000-000000000001','Seleccion directa',true)$cmd$, 'No se inserta tarifa seleccionada por fuera de la RPC');
select pg_temp.expect_write_denied($cmd$update public.agent_quotes set is_selected = true where id = 'ad014000-0000-4000-8000-000000000001'$cmd$, 'La seleccion directa no propaga pricing');
select pg_temp.expect_write_denied($cmd$update public.agent_quotes set ocean_freight = 999 where id = 'ad014000-0000-4000-8000-000000000005'$cmd$, 'No edita tarifa fuera de Pendiente de Fijar Precios');
select pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ad013000-0000-4000-8000-000000000004'$cmd$, 'Pricing no modifica precio ganado directamente');
select pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ad013000-0000-4000-8000-000000000007'$cmd$, 'Pricing no modifica otro tenant');
select * from public.select_agent_quote_and_replace_pricing('ad012000-0000-4000-8000-000000000001',
  'ad014000-0000-4000-8000-000000000001', '[{"item_type":"Flete","description":"Ocean Freight","quantity":1,"cost_amount":110,"sale_amount":155,"total_amount":155}]', 'AUD-01 seleccion canonica');
select pg_temp.assert_true((select is_selected from public.agent_quotes where id = 'ad014000-0000-4000-8000-000000000001'), 'Seleccion atomica conserva permiso');
select * from public.save_current_pricing_as_option_v2('ad012000-0000-4000-8000-000000000001', 'AUD-01 ofrecida', false, null, 'Nota comercial congelada');
select public.transition_quotation('ad012000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',0,'Pricing Aprobado');
select public.transition_quotation('ad012000-0000-4000-8000-000000000001','Pricing Aprobado',1,'Enviada al Cliente');
select pg_temp.as_user('ad010000-0000-4000-8000-000000000003');
select * from public.finalize_quotation_option_selection((select id from public.quotation_options where quotation_id = 'ad012000-0000-4000-8000-000000000001'), false, 'Enviada al Cliente', 2);
select pg_temp.assert_true((select status = 'Ganada' from public.quotations where id = 'ad012000-0000-4000-8000-000000000001'), 'Ventas acepta opcion por la RPC existente');
select pg_temp.assert_true((select sale_amount = 155 and source_option_item_id is not null from public.pricing_items where quotation_id = 'ad012000-0000-4000-8000-000000000001'), 'Aceptacion copia snapshot comercial sin escritura libre');

select pg_temp.as_user('ad010000-0000-4000-8000-000000000001');
update public.pricing_items set sale_amount = 160 where id = 'ad013000-0000-4000-8000-000000000005';
select pg_temp.assert_true((select sale_amount = 160 from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000005'), 'Admin conserva pricing editable');
select pg_temp.assert_true(public.notify_expired_agent_quotes_for_current_tenant() = 1, 'Aviso de tarifa ganada vencida no requiere escritura libre');
select pg_temp.assert_true(public.notify_expired_agent_quotes_for_current_tenant() = 0, 'Avisos idempotentes');
select pg_temp.as_user('ad010000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*) = 1 from public.notifications where user_id = auth.uid() and title = 'Tarifa vencida en cotización activa'), 'Pricing recibe un aviso');

reset role;
select set_config('request.jwt.claims', '{}', true);
-- Un fallo de notificacion revierte tambien el marcador, permitiendo reintento.
update public.agent_quotes set expiry_notified_at = null where id = 'ad014000-0000-4000-8000-000000000004';
delete from public.notifications where user_id = 'ad010000-0000-4000-8000-000000000002';
create function pg_temp.reject_test_notification() returns trigger language plpgsql as $$
begin raise exception 'Fallo simulado de notificacion' using errcode = '23514'; end;
$$;
create trigger aud01_reject_test_notification before insert on public.notifications
for each row execute function pg_temp.reject_test_notification();
set local role authenticated;
select pg_temp.as_user('ad010000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.notify_expired_agent_quotes_for_current_tenant();
    raise exception 'ASSERTION FAILED: el fallo simulado debe propagarse';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claims', '{}', true);
drop trigger aud01_reject_test_notification on public.notifications;
select pg_temp.assert_true((select expiry_notified_at is null from public.agent_quotes where id = 'ad014000-0000-4000-8000-000000000004'), 'Fallo del aviso no consume marcador');
select pg_temp.assert_true((select count(*) = 0 from public.notifications where user_id = 'ad010000-0000-4000-8000-000000000002'), 'Fallo del aviso no deja registros parciales');
select pg_temp.assert_true((select amount = 15 from public.client_rates where cliente_id = 'ad011000-0000-4000-8000-000000000001' and rate_code = 'AUD01'), 'Denegaciones no alteran tarifa del cliente');
select pg_temp.assert_true((select sale_amount = 150 from public.pricing_items where id = 'ad013000-0000-4000-8000-000000000004'), 'Precio ganado no cambio');
select pg_temp.assert_true((select count(*) = 0 from public.notifications where tenant_id = 'ad010000-0000-4000-8000-000000000100'), 'Avisos no cruzan tenant');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.can_write_quotation_pricing(uuid)', 'execute'), 'Helper no expuesto a anon');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.replace_client_rates_aud01_internal(uuid,text,jsonb,jsonb,jsonb)', 'execute'), 'Core privado sin grant');
rollback;
\echo 'aud01_pricing_write_permissions.sql: OK'

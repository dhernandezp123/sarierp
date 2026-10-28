\set ON_ERROR_STOP on
-- Solo base desechable con el historial completo. Todos los fixtures revierten.
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
create function pg_temp.as_user(n integer)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'ac260000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text, true);
end;
$$;

insert into public.tenants(id, slug, name) values
  ('ac260000-0000-4000-8000-000000000100', 'accounting26-a', 'Contabilidad A'),
  ('ac260000-0000-4000-8000-000000000200', 'accounting26-b', 'Contabilidad B');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('ac260000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'accounting26-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 7) n;
update public.profiles set
  rol = case right(id::text, 3)
    when '005' then 'Ventas'::public.user_role
    when '006' then 'Finanzas'::public.user_role
    when '007' then 'Cliente'::public.user_role
    else 'Contabilidad'::public.user_role end,
  status = case when right(id::text, 3) = '003' then 'Pendiente' else 'Aprobado' end,
  is_active = right(id::text, 3) <> '004', is_platform_admin = false,
  tenant_id = case when right(id::text, 3) = '002'
    then 'ac260000-0000-4000-8000-000000000200'::uuid
    else 'ac260000-0000-4000-8000-000000000100'::uuid end
where id::text like 'ac260000-%';

insert into public.clientes(id, nombre, tenant_id, deleted_at) values
  ('ac261000-0000-4000-8000-000000000001', 'Cliente con cotizaciones', 'ac260000-0000-4000-8000-000000000100', null),
  ('ac261000-0000-4000-8000-000000000002', 'Cliente sin cotizaciones', 'ac260000-0000-4000-8000-000000000100', null),
  ('ac261000-0000-4000-8000-000000000003', 'Cliente otra empresa', 'ac260000-0000-4000-8000-000000000200', null),
  ('ac261000-0000-4000-8000-000000000004', 'Cliente archivado', 'ac260000-0000-4000-8000-000000000100', now());
insert into public.quotations(id, cliente_id, created_by, tenant_id, status, service_product, quote_type, tipo_transporte)
select ('ac262000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'ac261000-0000-4000-8000-000000000001', 'ac260000-0000-4000-8000-000000000005',
  'ac260000-0000-4000-8000-000000000100',
  (array['Borrador', 'Pendiente de Fijar Precios', 'Pricing Aprobado', 'Enviada al Cliente', 'Ganada', 'Perdida'])[n],
  'other_origin_fcl', 'FCL', 'Marítimo'
from generate_series(1, 6) n;
insert into public.quotations(id, cliente_id, created_by, tenant_id, status, deleted_at) values
  ('ac262000-0000-4000-8000-000000000007', 'ac261000-0000-4000-8000-000000000003', 'ac260000-0000-4000-8000-000000000002', 'ac260000-0000-4000-8000-000000000200', 'Borrador', null),
  ('ac262000-0000-4000-8000-000000000008', 'ac261000-0000-4000-8000-000000000001', 'ac260000-0000-4000-8000-000000000005', 'ac260000-0000-4000-8000-000000000100', 'Borrador', now());
insert into public.pricing_items(id, quotation_id, description, item_type, quantity, cost_amount, sale_amount, total_amount)
select ('ac263000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('ac262000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Ocean Freight', 'Flete', 1, 100, 150, 150 from generate_series(1, 7) n;
insert into public.company_settings(tenant_id, legal_name)
values ('ac260000-0000-4000-8000-000000000200', 'Empresa B');
insert into public.service_products(tenant_id, value, label)
values ('ac260000-0000-4000-8000-000000000100', 'miami_lcl', 'Miami LCL');

set local role authenticated;
select pg_temp.as_user(1);
select pg_temp.assert_true((select count(*) = 2 from public.clientes where id::text like 'ac261000-%'), 'Contabilidad ve todos los clientes activos del tenant, incluso sin cotizaciones');
select pg_temp.assert_true((select count(*) = 6 from public.quotations where id::text like 'ac262000-%'), 'Contabilidad ve los seis estados sin registros archivados ni otra empresa');
select pg_temp.assert_true((select count(*) = 6 and sum(sale_amount - cost_amount) = 300 from public.pricing_items where id::text like 'ac263000-%'), 'Contabilidad consulta costos y utilidad en todos los estados');
select pg_temp.assert_true(not public.can_select_quotation('ac262000-0000-4000-8000-000000000007') and not public.can_select_cliente('ac261000-0000-4000-8000-000000000003'), 'Helpers rechazan IDs de otra empresa');

update public.clientes set nombre = 'Cliente editado por Contabilidad' where id = 'ac261000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select nombre = 'Cliente editado por Contabilidad' from public.clientes where id = 'ac261000-0000-4000-8000-000000000002'), 'Edición de cliente sin cotizaciones persiste');
insert into public.cliente_history(cliente_id, changed_by, action, notes)
values ('ac261000-0000-4000-8000-000000000002', auth.uid(), 'Cliente actualizado', 'Prueba aislada');
select pg_temp.assert_true((select count(*) = 1 from public.cliente_history where cliente_id = 'ac261000-0000-4000-8000-000000000002'), 'Contabilidad registra y consulta historial');
select pg_temp.expect_write_denied($cmd$insert into public.clientes(nombre) values ('No crear')$cmd$, 'No concede crear clientes');
select pg_temp.expect_write_denied($cmd$update public.clientes set deleted_at = now() where id = 'ac261000-0000-4000-8000-000000000002'$cmd$, 'No concede archivar clientes');
select pg_temp.expect_write_denied($cmd$delete from public.clientes where id = 'ac261000-0000-4000-8000-000000000002'$cmd$, 'No concede borrar clientes');
select pg_temp.expect_write_denied($cmd$update public.clientes set nombre = 'Ajeno' where id = 'ac261000-0000-4000-8000-000000000003'$cmd$, 'No edita otra empresa');
select pg_temp.expect_write_denied($cmd$update public.clientes set tenant_id = 'ac260000-0000-4000-8000-000000000200' where id = 'ac261000-0000-4000-8000-000000000002'$cmd$, 'No mueve clientes entre empresas');
select pg_temp.expect_write_denied($cmd$insert into public.quotations(cliente_id, created_by, status) values ('ac261000-0000-4000-8000-000000000001', auth.uid(), 'Borrador')$cmd$, 'No concede crear cotizaciones');
select pg_temp.expect_write_denied($cmd$update public.pricing_items set sale_amount = 999 where id = 'ac263000-0000-4000-8000-000000000001'$cmd$, 'Lectura no autoriza modificar precios');
select pg_temp.expect_write_denied($cmd$insert into public.client_rates(cliente_id, rate_code, rate_label, category, currency, amount) values ('ac261000-0000-4000-8000-000000000001', 'NO', 'No', 'Flete', 'USD', 99)$cmd$, 'No concede tarifas del cliente');

insert into public.company_settings(tenant_id, legal_name, default_tax_rate)
values ('ac260000-0000-4000-8000-000000000100', 'Empresa A', 0);
update public.company_settings set invoice_footer_note = 'Condiciones de facturación', lugar_emision_defecto = 'Tegucigalpa'
where tenant_id = 'ac260000-0000-4000-8000-000000000100';
select pg_temp.assert_true((select legal_name = 'Empresa A' and default_tax_rate = 0 and invoice_footer_note = 'Condiciones de facturación' from public.company_settings), 'Crea/reabre/edita empresa y facturación');
select pg_temp.expect_write_denied($cmd$update public.company_settings set legal_name = 'Ajena' where tenant_id = 'ac260000-0000-4000-8000-000000000200'$cmd$, 'No edita configuración ajena');
select pg_temp.expect_write_denied($cmd$delete from public.company_settings where tenant_id = 'ac260000-0000-4000-8000-000000000100'$cmd$, 'No elimina configuración');

insert into public.surcharge_rules(code, label, service_product, calculation_type, rate_per_lbs, currency)
values ('bunker_emergency_surcharge', 'Bunker Emergency Surcharge', 'miami_lcl', 'max_formula', 0.1, 'USD');
insert into public.surcharge_rules(code, label, service_product, calculation_type, rate_per_lbs, currency)
values ('bunker_emergency_surcharge', 'Bunker Emergency Surcharge', 'miami_lcl', 'max_formula', 0.2, 'USD')
on conflict (tenant_id, code) do update set rate_per_lbs = excluded.rate_per_lbs;
select pg_temp.assert_true((select rate_per_lbs = 0.2 from public.surcharge_rules where code = 'bunker_emergency_surcharge'), 'Guardado corporativo puede insertar y actualizar Bunker');
select pg_temp.expect_write_denied($cmd$insert into public.surcharge_rules(code, label, service_product, calculation_type, currency) values ('otra_regla', 'No', 'miami_lcl', 'max_formula', 'USD')$cmd$, 'No amplía otros cargos');
select pg_temp.expect_write_denied($cmd$update public.surcharge_rules set code = 'otra_regla' where code = 'bunker_emergency_surcharge'$cmd$, 'No puede renombrar Bunker para escapar la restricción');

insert into public.cai_ranges(id, cai, document_type, rango_desde, rango_hasta, fecha_limite_emision, is_active)
values ('ac264000-0000-4000-8000-000000000001', 'CAI-CONTABILIDAD', 'Factura', '000-001-01-00000001', '000-001-01-00000100', current_date + 30, false);
select public.activate_cai_range('ac264000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select is_active from public.cai_ranges where id = 'ac264000-0000-4000-8000-000000000001'), 'Registra y activa CAI con RPC canónica');
select pg_temp.expect_write_denied($cmd$delete from public.cai_ranges where id = 'ac264000-0000-4000-8000-000000000001'$cmd$, 'No concede eliminar CAI');

select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*) = 1 from public.clientes where id::text like 'ac261000-%') and (select count(*) = 1 from public.quotations where id::text like 'ac262000-%'), 'Otra Contabilidad solo ve su empresa');
select pg_temp.assert_true((select count(*) = 0 from public.cai_ranges where id::text like 'ac264000-%'), 'CAI aislado entre empresas');
select pg_temp.expect_write_denied($cmd$update public.company_settings set legal_name = 'Ajena' where tenant_id = 'ac260000-0000-4000-8000-000000000100'$cmd$, 'Contabilidad B no edita empresa A');

-- Las otras identidades no reciben autorización corporativa por este cambio.
do $$
declare n integer;
begin
  foreach n in array array[3,4,5,6,7] loop
    perform pg_temp.as_user(n);
    perform pg_temp.expect_write_denied($cmd$update public.company_settings set legal_name = 'No autorizado' where tenant_id = 'ac260000-0000-4000-8000-000000000100'$cmd$, 'Solo Contabilidad aprobada/activa o Admin edita empresa');
    if n in (3,4,7) then
      perform pg_temp.assert_true((select count(*) = 0 from public.quotations where id::text like 'ac262000-%'), 'Inactivo/pendiente/Cliente no recibe lectura interna');
      perform pg_temp.assert_true(not coalesce(public.can_update_cliente('ac261000-0000-4000-8000-000000000002'), false), 'Inactivo/pendiente/Cliente no edita clientes');
    end if;
  end loop;
end;
$$;
rollback;

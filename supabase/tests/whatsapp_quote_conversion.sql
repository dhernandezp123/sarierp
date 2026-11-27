\set ON_ERROR_STOP on
-- WA-04. Conversion de solicitudes de WhatsApp en cotizaciones. Solo base desechable; todo revierte.
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;
create function pg_temp.expect_error(command text, fragment text, message text)
returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if position(fragment in sqlerrm) > 0 then return; end if;
    raise exception 'ASSERTION FAILED: % (error inesperado: %)', message, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (no fallo)', message;
end;
$$;
create function pg_temp.as_user(n integer)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'e5a40000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text, true);
end;
$$;

-- 1 Admin A, 2 Pricing A, 3 Ventas A (solicitante), 4 Ventas A (otro), 5 Pricing B, 6 Operaciones A, 7 Pricing A solicitante
insert into public.tenants(id, slug, name) values
  ('e5a40000-0000-4000-8000-000000000100', 'wa04-a', 'Conversion A'),
  ('e5a40000-0000-4000-8000-000000000200', 'wa04-b', 'Conversion B');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('e5a40000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated', 'wa04-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 7) n;
update public.profiles set
  rol = (case right(id::text, 3) when '001' then 'Admin' when '002' then 'Pricing' when '005' then 'Pricing' when '006' then 'Operaciones' when '007' then 'Pricing' else 'Ventas' end)::public.user_role,
  nombre = case right(id::text, 3) when '003' then 'Valeria' else 'Usuario' end,
  apellido = case right(id::text, 3) when '003' then 'Soto' else right(id::text, 1) end,
  status = 'Aprobado', is_active = true, is_platform_admin = false,
  tenant_id = case when right(id::text, 3) = '005' then 'e5a40000-0000-4000-8000-000000000200'::uuid else 'e5a40000-0000-4000-8000-000000000100'::uuid end
where id::text like 'e5a40000-%';
insert into public.clientes(id, tenant_id, nombre, vendedor_asignado) values
  ('e5a41000-0000-4000-8000-000000000001', 'e5a40000-0000-4000-8000-000000000100', 'Distribuidora ABC', 'e5a40000-0000-4000-8000-000000000004'),
  ('e5a41000-0000-4000-8000-000000000002', 'e5a40000-0000-4000-8000-000000000200', 'Cliente de B', 'e5a40000-0000-4000-8000-000000000005'),
  ('e5a41000-0000-4000-8000-000000000003', 'e5a40000-0000-4000-8000-000000000100', 'Cliente sin vendedor', 'e5a40000-0000-4000-8000-000000000002');

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

set local role authenticated;
select pg_temp.as_user(1);
select public.whatsapp_save_sender(null, 'e5a40000-0000-4000-8000-000000000003', '50488880003', true);
select public.whatsapp_save_sender(null, 'e5a40000-0000-4000-8000-000000000007', '50488880007', true);
reset role;
set local role service_role;
insert into ids select 'r1', id from public.whatsapp_create_quote_request('e5a40000-0000-4000-8000-000000000100', 'e5a40000-0000-4000-8000-000000000003', 'wamid.C1',
  '{"cliente":"Distribuidora ABC","modalidad":"FCL","origen":"Ningbo","destino":"Puerto Cortes","mercancia":"Ceramica"}', 'COTIZACION');
insert into ids select 'r2', id from public.whatsapp_create_quote_request('e5a40000-0000-4000-8000-000000000100', 'e5a40000-0000-4000-8000-000000000003', 'wamid.C2',
  '{"cliente":"Importadora Nueva","modalidad":"LCL","origen":"Shenzhen","destino":"San Pedro Sula","mercancia":"Repuestos"}', 'COTIZACION');
insert into ids select 'r3', id from public.whatsapp_create_quote_request('e5a40000-0000-4000-8000-000000000100', 'e5a40000-0000-4000-8000-000000000007', 'wamid.C3',
  '{"cliente":"Distribuidora ABC","modalidad":"FCL","origen":"A","destino":"B","mercancia":"C"}', 'COTIZACION');
insert into ids select 'r4', id from public.whatsapp_create_quote_request('e5a40000-0000-4000-8000-000000000100', 'e5a40000-0000-4000-8000-000000000007', 'wamid.C4',
  '{"cliente":"Cliente sin vendedor","modalidad":"LCL","origen":"A","destino":"B","mercancia":"D"}', 'COTIZACION');
insert into ids select 'r5', id from public.whatsapp_create_quote_request('e5a40000-0000-4000-8000-000000000100', 'e5a40000-0000-4000-8000-000000000007', 'wamid.C5',
  '{"cliente":"Empresa Nueva Pricing","modalidad":"LCL","origen":"A","destino":"B","mercancia":"E"}', 'COTIZACION');
reset role;
set local role authenticated;

-- Permisos: solo Admin y Pricing del tenant.
select pg_temp.as_user(3);
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}')$$, (select id from ids where name = 'r1')), 'No autorizado', 'Ventas no convierte ni su propia solicitud');
select pg_temp.as_user(6);
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}')$$, (select id from ids where name = 'r1')), 'No autorizado', 'Operaciones no convierte');
select pg_temp.as_user(5);
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000002","service_product":"other_origin_fcl"}')$$, (select id from ids where name = 'r1')), 'no disponible', 'Pricing de otro tenant no convierte');

-- Fuera de la conversion, Pricing sigue sin crear cotizaciones ni clientes.
select pg_temp.as_user(2);
select pg_temp.expect_error($$select * from public.create_quotation_with_child_lines('{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}', '[]', '[]', '[]')$$, 'permiso', 'Pricing no crea cotizaciones en general');
select pg_temp.expect_error($$insert into public.clientes(tenant_id, nombre) values('e5a40000-0000-4000-8000-000000000100', 'Directo')$$, 'row-level security', 'Pricing no crea clientes en general');

-- Validaciones de la solicitud y del cliente.
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"service_product":"other_origin_fcl"}')$$, (select id from ids where name = 'r1')), 'Elige un cliente', 'requiere cliente');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}', '[]', '[]', '[]', '{"nombre":"X"}')$$, (select id from ids where name = 'r1')), 'Elige un cliente', 'no mezcla cliente existente y nuevo');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000002","service_product":"other_origin_fcl"}')$$, (select id from ids where name = 'r1')), 'Cliente no disponible', 'no usa clientes de otro tenant');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"service_product":"other_origin_fcl"}', '[]', '[]', '[]', '{"nombre":"  "}')$$, (select id from ids where name = 'r2')), 'nombre del cliente', 'cliente nuevo con nombre');

-- Pricing convierte con cliente existente: cotizacion a nombre del vendedor y solicitud vinculada.
insert into ids select 'q1', quotation_id from public.whatsapp_convert_quote_request((select id from ids where name = 'r1'),
  '{"id":"e5a42000-0000-4000-8000-000000000001","cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl","quote_type":"FCL","tipo_transporte":"Marítima","origen":"Ningbo","destino":"Puerto Cortes","status":"Borrador"}');
select pg_temp.assert_true(auth.uid() = 'e5a40000-0000-4000-8000-000000000002', 'la sesion de Pricing se restaura');
select pg_temp.assert_true((select q.created_by = 'e5a40000-0000-4000-8000-000000000003' and q.cliente_id = 'e5a41000-0000-4000-8000-000000000001'
  and q.quotation_number like '%-VS' and q.tenant_id = 'e5a40000-0000-4000-8000-000000000100'
  from public.quotations q where q.id = (select id from ids where name = 'q1')), 'cotizacion a nombre del vendedor (iniciales VS)');
select pg_temp.assert_true((select quotation_id = (select id from ids where name = 'q1') and estado = 'Cotizada' and convertido_por = 'e5a40000-0000-4000-8000-000000000002'
  from public.solicitudes_cotizacion where id = (select id from ids where name = 'r1')), 'solicitud vinculada y cotizada');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}')$$, (select id from ids where name = 'r1')), 'ya fue convertida', 'no se convierte dos veces');
select pg_temp.expect_error(format($$select public.whatsapp_set_quote_request_status(%L, 'Pendiente')$$, (select id from ids where name = 'r1')), 'ya fue convertida', 'estado fijo tras convertir');

-- Pricing convierte creando cliente nuevo: queda asignado al vendedor de la solicitud.
insert into ids select 'c2', cliente_id from public.whatsapp_convert_quote_request((select id from ids where name = 'r2'),
  '{"id":"e5a42000-0000-4000-8000-000000000002","service_product":"other_origin_lcl","quote_type":"LCL","tipo_transporte":"Marítima","status":"Borrador"}',
  '[]', '[]', '[]', '{"nombre":"Importadora Nueva","telefono":"50499990000","vendedor_asignado":"e5a40000-0000-4000-8000-000000000002"}');
select pg_temp.assert_true(auth.uid() = 'e5a40000-0000-4000-8000-000000000002', 'sesion restaurada tras cliente nuevo');
select pg_temp.assert_true((select vendedor_asignado = 'e5a40000-0000-4000-8000-000000000003' and codigo_cliente is not null and tenant_id = 'e5a40000-0000-4000-8000-000000000100'
  from public.clientes where id = (select id from ids where name = 'c2')), 'cliente nuevo a nombre del vendedor, no del vendedor enviado en el payload');
-- cliente_history no es legible para Pricing por RLS; se verifica como postgres.
reset role;
select pg_temp.assert_true((select count(*) = 1 from public.cliente_history where cliente_id = (select id from ids where name = 'c2') and changed_by = 'e5a40000-0000-4000-8000-000000000002'), 'historial del cliente registra a Pricing');
set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.assert_true((select created_by = 'e5a40000-0000-4000-8000-000000000003' from public.quotations where id = 'e5a42000-0000-4000-8000-000000000002'), 'segunda cotizacion a nombre del vendedor');

-- Solicitud hecha por Pricing: queda a nombre del vendedor del cliente o del vendedor elegido.
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}', '[]', '[]', '[]', null, 'e5a40000-0000-4000-8000-000000000001')$$, (select id from ids where name = 'r3')), 'otro vendedor', 'no elige un vendedor distinto al del cliente');
insert into ids select 'q3', quotation_id from public.whatsapp_convert_quote_request((select id from ids where name = 'r3'),
  '{"id":"e5a42000-0000-4000-8000-000000000003","cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl","quote_type":"FCL","tipo_transporte":"Marítima","status":"Borrador"}');
select pg_temp.assert_true((select created_by = 'e5a40000-0000-4000-8000-000000000004' from public.quotations where id = 'e5a42000-0000-4000-8000-000000000003'), 'solicitud de Pricing queda a nombre del vendedor del cliente');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000003","service_product":"other_origin_lcl"}')$$, (select id from ids where name = 'r4')), 'Elige el vendedor', 'cliente sin vendedor valido exige elegir');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000003","service_product":"other_origin_lcl"}', '[]', '[]', '[]', null, 'e5a40000-0000-4000-8000-000000000002')$$, (select id from ids where name = 'r4')), 'Elige el vendedor', 'no elige a un usuario de Pricing como vendedor');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000003","service_product":"other_origin_lcl"}', '[]', '[]', '[]', null, 'e5a40000-0000-4000-8000-000000000005')$$, (select id from ids where name = 'r4')), 'Elige el vendedor', 'no elige a un vendedor de otro tenant');
select pg_temp.assert_true((select seller_id = 'e5a40000-0000-4000-8000-000000000001' from public.whatsapp_convert_quote_request((select id from ids where name = 'r4'),
  '{"id":"e5a42000-0000-4000-8000-000000000004","cliente_id":"e5a41000-0000-4000-8000-000000000003","service_product":"other_origin_lcl","quote_type":"LCL","tipo_transporte":"Marítima","status":"Borrador"}',
  '[]', '[]', '[]', null, 'e5a40000-0000-4000-8000-000000000001')), 'vendedor elegido por quien convierte');
select pg_temp.assert_true((select created_by = 'e5a40000-0000-4000-8000-000000000001' from public.quotations where id = 'e5a42000-0000-4000-8000-000000000004'), 'cotizacion a nombre del vendedor elegido');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"service_product":"other_origin_lcl"}', '[]', '[]', '[]', '{"nombre":"Empresa Nueva Pricing"}')$$, (select id from ids where name = 'r5')), 'Elige el vendedor', 'cliente nuevo de solicitud Pricing exige vendedor');
insert into ids select 'c5', cliente_id from public.whatsapp_convert_quote_request((select id from ids where name = 'r5'),
  '{"id":"e5a42000-0000-4000-8000-000000000005","service_product":"other_origin_lcl","quote_type":"LCL","tipo_transporte":"Marítima","status":"Borrador"}',
  '[]', '[]', '[]', '{"nombre":"Empresa Nueva Pricing"}', 'e5a40000-0000-4000-8000-000000000004');
select pg_temp.assert_true((select vendedor_asignado = 'e5a40000-0000-4000-8000-000000000004' from public.clientes where id = (select id from ids where name = 'c5')), 'cliente nuevo de solicitud Pricing asignado al vendedor elegido');
select pg_temp.assert_true(auth.uid() = 'e5a40000-0000-4000-8000-000000000002', 'sesion restaurada en conversiones de Pricing');
select pg_temp.expect_error(format($$select * from public.whatsapp_convert_quote_request(%L, '{"cliente_id":"e5a41000-0000-4000-8000-000000000001","service_product":"other_origin_fcl"}', '[]', '[]', '[]', null, 'e5a40000-0000-4000-8000-000000000001')$$, (select id from ids where name = 'r1')), 'ya fue convertida', 'doble conversion sigue bloqueada con vendedor');

-- Visibilidad: el vendedor ve su cotizacion y la solicitud con el vinculo; otro vendedor y otro tenant no.
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*) = 1 from public.quotations where id = 'e5a42000-0000-4000-8000-000000000001'), 'vendedor ve la cotizacion creada a su nombre');
select pg_temp.assert_true((select quotation_id is not null from public.solicitudes_cotizacion where id = (select id from ids where name = 'r1')), 'vendedor ve el vinculo');
select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*) = 2 from public.quotations where id in ('e5a42000-0000-4000-8000-000000000001', 'e5a42000-0000-4000-8000-000000000002')), 'Pricing lee las cotizaciones creadas (link de la bandeja)');
select pg_temp.as_user(5);
select pg_temp.assert_true((select count(*) = 0 from public.solicitudes_cotizacion), 'otro tenant no ve solicitudes');
select pg_temp.as_user(3);
select pg_temp.expect_error(format($$update public.solicitudes_cotizacion set quotation_id = null where id = %L$$, (select id from ids where name = 'r1')), 'permission denied', 'sin update directo del vinculo');

reset role;
select pg_temp.assert_true((select count(*) = 0 from public.solicitudes_cotizacion where quotation_id is not null and estado <> 'Cotizada'), 'vinculo implica Cotizada');
rollback;

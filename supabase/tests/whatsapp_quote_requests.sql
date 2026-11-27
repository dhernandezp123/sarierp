\set ON_ERROR_STOP on
-- WA-01. Solo base desechable con el historial completo. Todos los fixtures revierten.
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
    'sub', 'e5a10000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'role', 'authenticated')::text, true);
end;
$$;

-- 1 Admin A, 2 Pricing A, 3 Ventas A, 4 Ventas A (otro vendedor), 5 Admin B, 6 Cliente A, 7 Ventas B
insert into public.tenants(id, slug, name) values
  ('e5a10000-0000-4000-8000-000000000100', 'wa01-a', 'WhatsApp A'),
  ('e5a10000-0000-4000-8000-000000000200', 'wa01-b', 'WhatsApp B');
insert into auth.users(id, aud, role, email, raw_user_meta_data)
select ('e5a10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated', 'wa01-' || n || '@test.local', '{}'::jsonb
from generate_series(1, 7) n;
update public.profiles set
  rol = (case right(id::text, 3) when '001' then 'Admin' when '002' then 'Pricing' when '005' then 'Admin' when '006' then 'Cliente' else 'Ventas' end)::public.user_role,
  nombre = 'Usuario ' || right(id::text, 1), status = 'Aprobado', is_active = true, is_platform_admin = false,
  tenant_id = case when right(id::text, 3) in ('005', '007') then 'e5a10000-0000-4000-8000-000000000200'::uuid else 'e5a10000-0000-4000-8000-000000000100'::uuid end
where id::text like 'e5a10000-%';

create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, service_role;

set local role authenticated;

-- Numeros autorizados: solo Admin del tenant, con usuario elegible y numero normalizado.
select pg_temp.as_user(3);
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000003', '50499990003', true)$$, 'No autorizado', 'Ventas no registra numeros');
select pg_temp.as_user(2);
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000002', '50499990002', true)$$, 'No autorizado', 'Pricing no registra numeros');
select pg_temp.as_user(1);
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000006', '50499990006', true)$$, 'Usuario no disponible', 'no registra clientes');
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000007', '50499990007', true)$$, 'Usuario no disponible', 'no registra usuarios de otro tenant');
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000003', '9999', true)$$, 'Numero invalido', 'numero demasiado corto');
insert into ids select 's3', public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000003', '+504 9999-0003', true);
insert into ids select 's4', public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000004', '50499990004', true);
select pg_temp.assert_true((select phone = '50499990003' from public.whatsapp_quote_senders where id = (select id from ids where name = 's3')), 'telefono normalizado a digitos');
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000002', '504 9999 0003', true)$$, 'ya esta registrado', 'numero duplicado');
select pg_temp.expect_error($$select public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000003', '50499990033', true)$$, 'ya tiene un numero', 'usuario con dos numeros');
select pg_temp.assert_true((select count(*) = 2 from public.whatsapp_quote_senders), 'Admin A ve sus numeros');
select pg_temp.expect_error($$insert into public.whatsapp_quote_senders(tenant_id, profile_id, phone) values('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000002', '50499990002')$$, 'permission denied', 'sin escritura directa de numeros');

select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*) = 0 from public.whatsapp_quote_senders), 'Pricing no lee numeros');
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*) = 0 from public.whatsapp_quote_senders), 'Ventas no lee numeros');
select pg_temp.as_user(5);
select pg_temp.assert_true((select count(*) = 0 from public.whatsapp_quote_senders), 'Admin B no lee numeros de A');
select pg_temp.expect_error(format($$select public.whatsapp_delete_sender(%L)$$, (select id from ids where name = 's4')), 'no disponible', 'Admin B no elimina numeros de A');
select pg_temp.expect_error(format($$select public.whatsapp_save_sender(%L, 'e5a10000-0000-4000-8000-000000000007', '50499990007', true)$$, (select id from ids where name = 's4')), 'no disponible', 'Admin B no edita numeros de A');

-- El webhook solo existe para service_role.
select pg_temp.as_user(1);
select pg_temp.expect_error($$select * from public.whatsapp_find_sender('e5a10000-0000-4000-8000-000000000100', '50499990003')$$, 'permission denied', 'authenticated no consulta remitentes');
select pg_temp.expect_error($$select * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.X', '{"cliente":"X","modalidad":"LCL","origen":"A","destino":"B","mercancia":"C"}', 'x')$$, 'permission denied', 'authenticated no crea solicitudes');

reset role;
set local role service_role;
select pg_temp.assert_true((select profile_id = 'e5a10000-0000-4000-8000-000000000003' from public.whatsapp_find_sender('e5a10000-0000-4000-8000-000000000100', '50499990003')), 'remitente encontrado en su tenant');
select pg_temp.assert_true((select count(*) = 0 from public.whatsapp_find_sender('e5a10000-0000-4000-8000-000000000200', '50499990003')), 'remitente de A no existe en B');
insert into ids select 'r3', id from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.R3',
  '{"cliente":"Distribuidora ABC","modalidad":"LCL","origen":"Shenzhen","destino":"San Pedro Sula","mercancia":"Repuestos","peso":"1200 kg"}', 'COTIZACION ...');
insert into ids select 'r4', id from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000004', 'wamid.R4',
  '{"cliente":"Cliente Dos","modalidad":"FCL","origen":"Ningbo","destino":"Puerto Cortes","mercancia":"Ceramica"}', 'COTIZACION ...');
select pg_temp.assert_true((select codigo = 'SQ-0001' and not created and id = (select id from ids where name = 'r3')
  from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.R3',
  '{"cliente":"Distribuidora ABC","modalidad":"LCL","origen":"Shenzhen","destino":"San Pedro Sula","mercancia":"Repuestos"}', 'COTIZACION ...')), 'reintento idempotente');
select pg_temp.assert_true((select codigo = 'SQ-0002' from public.solicitudes_cotizacion where id = (select id from ids where name = 'r4')), 'codigo correlativo por tenant');
select pg_temp.expect_error($$select * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000200', 'e5a10000-0000-4000-8000-000000000003', 'wamid.X1', '{"cliente":"X","modalidad":"LCL","origen":"A","destino":"B","mercancia":"C"}', 'x')$$, 'no autorizado', 'remitente de A no crea en B');
select pg_temp.expect_error($$select * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000002', 'wamid.X2', '{"cliente":"X","modalidad":"LCL","origen":"A","destino":"B","mercancia":"C"}', 'x')$$, 'no autorizado', 'usuario sin numero registrado no crea');
select pg_temp.expect_error($$select * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.X3', '{"cliente":"X","modalidad":"LCL"}', 'x')$$, 'Faltan datos', 'datos obligatorios');

reset role;
set local role authenticated;

-- Desactivar el numero bloquea nuevas solicitudes sin borrar las existentes.
select pg_temp.as_user(1);
select public.whatsapp_save_sender((select id from ids where name = 's4'), 'e5a10000-0000-4000-8000-000000000004', '50499990004', false);
reset role;
set local role service_role;
select pg_temp.assert_true((select count(*) = 0 from public.whatsapp_find_sender('e5a10000-0000-4000-8000-000000000100', '50499990004')), 'numero desactivado no autoriza');
reset role;
set local role authenticated;

-- Lecturas de la bandeja.
select pg_temp.as_user(1);
select pg_temp.assert_true((select count(*) = 2 from public.solicitudes_cotizacion), 'Admin ve todas las solicitudes del tenant');
select pg_temp.as_user(2);
select pg_temp.assert_true((select count(*) = 2 from public.solicitudes_cotizacion), 'Pricing ve todas las solicitudes del tenant');
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*) = 1 and bool_and(solicitado_por_id = auth.uid()) from public.solicitudes_cotizacion), 'Ventas ve solo las propias');
select pg_temp.assert_true((select count(*) = 0 from public.solicitudes_cotizacion where id = (select id from ids where name = 'r4')), 'Ventas no ve las ajenas');
select pg_temp.as_user(4);
select pg_temp.assert_true((select count(*) = 1 and bool_and(id = (select id from ids where name = 'r4')) from public.solicitudes_cotizacion), 'otro vendedor ve solo la suya');
select pg_temp.as_user(5);
select pg_temp.assert_true((select count(*) = 0 from public.solicitudes_cotizacion), 'Admin B no ve solicitudes de A');
select pg_temp.as_user(7);
select pg_temp.assert_true((select count(*) = 0 from public.solicitudes_cotizacion), 'Ventas B no ve solicitudes de A');
select pg_temp.as_user(6);
select pg_temp.assert_true((select count(*) = 0 from public.solicitudes_cotizacion), 'Cliente no ve solicitudes');

-- Cambio de estado: solo Admin y Pricing del tenant.
select pg_temp.as_user(3);
select pg_temp.expect_error(format($$select public.whatsapp_set_quote_request_status(%L, 'En proceso')$$, (select id from ids where name = 'r3')), 'No autorizado', 'Ventas no cambia estado de la propia');
select pg_temp.expect_error(format($$update public.solicitudes_cotizacion set estado = 'Cotizada' where id = %L$$, (select id from ids where name = 'r3')), 'permission denied', 'sin update directo');
select pg_temp.as_user(5);
select pg_temp.expect_error(format($$select public.whatsapp_set_quote_request_status(%L, 'En proceso')$$, (select id from ids where name = 'r3')), 'no disponible', 'Admin B no cambia estado en A');
select pg_temp.as_user(2);
select pg_temp.expect_error(format($$select public.whatsapp_set_quote_request_status(%L, 'Descartada')$$, (select id from ids where name = 'r3')), 'Estado invalido', 'estado invalido');
select public.whatsapp_set_quote_request_status((select id from ids where name = 'r3'), 'En proceso');
select pg_temp.as_user(1);
select public.whatsapp_set_quote_request_status((select id from ids where name = 'r4'), 'Cotizada');
select pg_temp.assert_true((select estado = 'En proceso' and estado_actualizado_por = 'e5a10000-0000-4000-8000-000000000002' from public.solicitudes_cotizacion where id = (select id from ids where name = 'r3')), 'Pricing cambio estado');
select pg_temp.assert_true((select estado = 'Cotizada' from public.solicitudes_cotizacion where id = (select id from ids where name = 'r4')), 'Admin cambio estado');

-- Eliminar numero conserva el historial.
select public.whatsapp_delete_sender((select id from ids where name = 's3'));
select pg_temp.assert_true((select count(*) = 1 from public.whatsapp_quote_senders), 'numero eliminado');
select pg_temp.assert_true((select count(*) = 2 from public.solicitudes_cotizacion), 'solicitudes se conservan');

-- WA-03. Duplicados por contenido: mismo vendedor, mismos datos, ultimas 24 horas.
select pg_temp.as_user(1);
insert into ids select 's3b', public.whatsapp_save_sender(null, 'e5a10000-0000-4000-8000-000000000003', '50499990003', true);
select public.whatsapp_save_sender((select id from ids where name = 's4'), 'e5a10000-0000-4000-8000-000000000004', '50499990004', true);
reset role;
set local role service_role;
create temp table dup on commit drop as
select 1 n, * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.D1',
  '{"cliente":"  distribuidora   abc ","modalidad":"lcl","origen":"SHENZHEN","destino":"San  Pedro Sula","mercancia":"repuestos","peso":"1200   KG","incoterm":"FOB","notas":"otra nota"}', 'COTIZACION ...');
select pg_temp.assert_true((select duplicate and not created and codigo = 'SQ-0001' from dup where n = 1), 'mismos datos sin mayusculas ni espacios extra: duplicado de SQ-0001');
select pg_temp.assert_true((select count(*) = 2 from public.solicitudes_cotizacion), 'el duplicado no se registra');
select pg_temp.assert_true((select not duplicate and not created and codigo = 'SQ-0001' from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.R3',
  '{"cliente":"Otro","modalidad":"LCL","origen":"A","destino":"B","mercancia":"C"}', 'x', false)), 'mismo mensaje sigue siendo reintento, no duplicado');
insert into dup select 2, * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.D2',
  '{"cliente":"Distribuidora ABC","modalidad":"LCL","origen":"Shenzhen","destino":"San Pedro Sula","mercancia":"Repuestos","peso":"1200 kg"}', 'COTIZACION NUEVA ...', true);
select pg_temp.assert_true((select created and not duplicate and codigo = 'SQ-0003' from dup where n = 2), 'COTIZACION NUEVA registra aunque coincida');
insert into dup select 3, * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000004', 'wamid.D3',
  '{"cliente":"Distribuidora ABC","modalidad":"LCL","origen":"Shenzhen","destino":"San Pedro Sula","mercancia":"Repuestos","peso":"1200 kg"}', 'x');
select pg_temp.assert_true((select created and not duplicate from dup where n = 3), 'otro vendedor con los mismos datos registra');
insert into dup select 4, * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.D4',
  '{"cliente":"Distribuidora ABC","modalidad":"LCL","origen":"Shenzhen","destino":"San Pedro Sula","mercancia":"Repuestos","peso":"1500 kg"}', 'x');
select pg_temp.assert_true((select created and not duplicate from dup where n = 4), 'peso distinto registra');
insert into dup select 5, * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000004', 'wamid.D5',
  '{"cliente":"cliente dos","modalidad":"fcl","origen":"Ningbo","destino":"Puerto Cortes","mercancia":"Ceramica","peso":"  "}', 'x');
select pg_temp.assert_true((select duplicate and codigo = 'SQ-0002' from dup where n = 5), 'campo opcional vacio equivale a ausente');
reset role;
update public.solicitudes_cotizacion set creado_en = now() - interval '25 hours' where id = (select id from ids where name = 'r4');
set local role service_role;
insert into dup select 6, * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000004', 'wamid.D6',
  '{"cliente":"Cliente Dos","modalidad":"FCL","origen":"Ningbo","destino":"Puerto Cortes","mercancia":"Ceramica"}', 'x');
select pg_temp.assert_true((select created and not duplicate from dup where n = 6), 'fuera de 24 horas registra');
select pg_temp.assert_true((select count(*) = 6 from public.solicitudes_cotizacion), 'solo se registraron las no duplicadas');
reset role;
set local role authenticated;
select pg_temp.as_user(1);
select pg_temp.expect_error($$select * from public.whatsapp_create_quote_request('e5a10000-0000-4000-8000-000000000100', 'e5a10000-0000-4000-8000-000000000003', 'wamid.X9', '{"cliente":"X","modalidad":"LCL","origen":"A","destino":"B","mercancia":"C"}', 'x', true)$$, 'permission denied', 'authenticated no usa la alta con p_force');

rollback;

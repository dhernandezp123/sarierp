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
declare was_denied boolean := false;
begin
  begin execute command;
  exception when others then was_denied := true;
  end;
  if not was_denied then raise exception 'ASSERTION FAILED: %', message; end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('49000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-portal-ship@test.local', '{}'::jsonb),
  ('49000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'client-a-ship@test.local', '{}'::jsonb),
  ('49000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'client-b-ship@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '49000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    else 'Cliente'::public.user_role
  end,
  status = 'Aprobado', is_active = true;

insert into public.clientes (id, nombre, rtn)
values
  ('49100000-0000-0000-0000-000000000001', 'Cliente Portal A', '08011999111111'),
  ('49100000-0000-0000-0000-000000000002', 'Cliente Portal B', '08011999222222');

update public.profiles
set cliente_id = case id
    when '49000000-0000-0000-0000-000000000002' then '49100000-0000-0000-0000-000000000001'::uuid
    else '49100000-0000-0000-0000-000000000002'::uuid
  end
where id in (
  '49000000-0000-0000-0000-000000000002',
  '49000000-0000-0000-0000-000000000003'
);

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number, service_product,
  origen, destino, commodity, pricing_notes, total_cost
)
values
  ('49200000-0000-0000-0000-000000000001', '49100000-0000-0000-0000-000000000001',
   '49000000-0000-0000-0000-000000000001', 'Ganada', 'Q-PORTAL-A', 'other_origin_fcl',
   'Shanghai', 'Puerto Cortés', 'Repuestos', 'NOTA INTERNA A', 9999),
  ('49200000-0000-0000-0000-000000000002', '49100000-0000-0000-0000-000000000002',
   '49000000-0000-0000-0000-000000000001', 'Ganada', 'Q-PORTAL-B', 'miami_air',
   'Miami', 'Tegucigalpa', 'Muestras', 'NOTA INTERNA B', 8888);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by, status,
  shipment_status, carrier, agent_email, operational_comments
)
values
  ('49300000-0000-0000-0000-000000000001', 'RT-PORTAL-A',
   '49200000-0000-0000-0000-000000000001', '49100000-0000-0000-0000-000000000001',
   '49000000-0000-0000-0000-000000000001', 'Borrador', 'En Tránsito',
   'TEST CARRIER A', 'agent-a@internal.test', 'COMENTARIO INTERNO A'),
  ('49300000-0000-0000-0000-000000000002', 'RT-PORTAL-B',
   '49200000-0000-0000-0000-000000000002', '49100000-0000-0000-0000-000000000002',
   '49000000-0000-0000-0000-000000000001', 'Borrador', 'Booking Confirmado',
   'TEST CARRIER B', 'agent-b@internal.test', 'COMENTARIO INTERNO B');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (select count(*) = 1 and max(routing_number) = 'RT-PORTAL-A'
   from public.get_client_shipments(null, false)),
  'El cliente debe recibir únicamente sus propios envíos'
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.get_client_shipments(
    '49300000-0000-0000-0000-000000000002', true)),
  'Un cliente no debe consultar un envío de otro cliente por ID'
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.quotations),
  'El portal no debe abrir acceso directo a quotations'
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.shipping_instructions),
  'El portal no debe abrir acceso directo a shipping_instructions'
);

select pg_temp.assert_true(
  position('agent_email' in pg_get_function_result(
    'public.get_client_shipments(uuid,boolean)'::regprocedure
  )) = 0,
  'El RPC no debe exponer contactos internos de agentes'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select * from public.get_client_shipments(null, false)$$,
  'Los usuarios internos no deben usar el RPC del portal Cliente'
);

reset role;
rollback;

\echo 'phase5_portal_shipments.sql: OK'

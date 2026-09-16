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
  ('52100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'si-admin@test.local', '{}'::jsonb),
  ('52100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'si-ops-one@test.local', '{}'::jsonb),
  ('52100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'si-ops-two@test.local', '{}'::jsonb),
  ('52100000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'si-sales-owner@test.local', '{}'::jsonb),
  ('52100000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'si-sales-other@test.local', '{}'::jsonb),
  ('52100000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'si-ops-inactive@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '52100000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    when '52100000-0000-0000-0000-000000000002' then 'Operaciones'::public.user_role
    when '52100000-0000-0000-0000-000000000003' then 'Operaciones'::public.user_role
    when '52100000-0000-0000-0000-000000000006' then 'Operaciones'::public.user_role
    else 'Ventas'::public.user_role
  end,
  nombre = case id
    when '52100000-0000-0000-0000-000000000002' then 'Operativo Uno'
    when '52100000-0000-0000-0000-000000000003' then 'Operativo Dos'
    else nombre
  end,
  status = 'Aprobado',
  is_active = id <> '52100000-0000-0000-0000-000000000006';

insert into public.clientes (id, nombre)
values
  ('52200000-0000-0000-0000-000000000001', 'Cliente % Especial'),
  ('52200000-0000-0000-0000-000000000002', 'Cliente Paginacion SI');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number
)
values
  (
    '52300000-0000-0000-0000-000000000001',
    '52200000-0000-0000-0000-000000000001',
    '52100000-0000-0000-0000-000000000004',
    'Ganada',
    'Q-SI-SEARCH-001'
  ),
  (
    '52300000-0000-0000-0000-000000000002',
    '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000004',
    'Ganada',
    'Q-SI-PARTIAL-001'
  ),
  (
    '52300000-0000-0000-0000-000000000003',
    '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000005',
    'Ganada',
    'Q-SI-SALES-OTHER-001'
  );

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  supplier_name, supplier_contact, supplier_email, supplier_address,
  shipment_status, operational_status, operations_assigned_to,
  updated_at
)
values
  (
    '52400000-0000-0000-0000-000000000001', 'RT-WORKFLOW-001',
    '52300000-0000-0000-0000-000000000001',
    '52200000-0000-0000-0000-000000000001',
    '52100000-0000-0000-0000-000000000004',
    'Proveedor inicial', 'Contacto inicial', 'inicial@test.local', 'Direccion inicial',
    'Pendiente Validación', 'Pendiente Validación', null,
    '2026-09-16 10:00:00+00'
  ),
  (
    '52400000-0000-0000-0000-000000000002', 'RT-CANCEL-EMPTY-001',
    null, '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000004',
    'Proveedor B', 'Contacto B', 'b@test.local', 'Direccion B',
    'Pendiente Validación', 'Pendiente Validación', null,
    '2026-09-16 10:00:00+00'
  ),
  (
    '52400000-0000-0000-0000-000000000003', 'RT-CANCEL-BOOKED-001',
    null, '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000004',
    'Proveedor C', 'Contacto C', 'c@test.local', 'Direccion C',
    'Validada', 'Listo para Booking', null,
    '2026-09-16 10:00:00+00'
  ),
  (
    '52400000-0000-0000-0000-000000000004', 'RT-PARTIAL-001',
    '52300000-0000-0000-0000-000000000002',
    '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000004',
    'Proveedor D', 'Contacto D', 'd@test.local', 'Direccion D',
    'Booking Solicitado', 'En Booking', null,
    '2026-09-16 10:00:00+00'
  ),
  (
    '52400000-0000-0000-0000-000000000005', 'RT-ASSIGNED-001',
    '52300000-0000-0000-0000-000000000003',
    '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000005',
    'Proveedor E', 'Contacto E', 'e@test.local', 'Direccion E',
    'Pendiente Validación', 'Asignado',
    '52100000-0000-0000-0000-000000000002',
    '2026-09-16 10:00:00+00'
  ),
  (
    '52400000-0000-0000-0000-000000000006', 'RT-DELETED-001',
    null, '52200000-0000-0000-0000-000000000002',
    '52100000-0000-0000-0000-000000000004',
    'Proveedor F', 'Contacto F', 'f@test.local', 'Direccion F',
    'Pendiente Validación', 'Pendiente Validación', null,
    '2026-09-16 10:00:00+00'
  );

update public.shipping_instructions
set deleted_at = clock_timestamp(),
    deleted_by = '52100000-0000-0000-0000-000000000001'
where id = '52400000-0000-0000-0000-000000000006';

insert into public.shipping_instructions (
  routing_number, client_id, created_by, shipment_status, operational_status
)
select
  'RT-PAGE-' || lpad(series::text, 3, '0'),
  '52200000-0000-0000-0000-000000000002',
  '52100000-0000-0000-0000-000000000004',
  'Pendiente Validación',
  'Pendiente Validación'
from generate_series(1, 30) series;

insert into public.bookings (
  id, shipping_instruction_id, shipment_status, created_by
)
values
  (
    '52500000-0000-0000-0000-000000000001',
    '52400000-0000-0000-0000-000000000003',
    'Booking Solicitado',
    '52100000-0000-0000-0000-000000000002'
  ),
  (
    '52500000-0000-0000-0000-000000000002',
    '52400000-0000-0000-0000-000000000004',
    'Booking Solicitado',
    '52100000-0000-0000-0000-000000000002'
  ),
  (
    '52500000-0000-0000-0000-000000000003',
    '52400000-0000-0000-0000-000000000004',
    'Booking Confirmado',
    '52100000-0000-0000-0000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

update public.shipping_instructions
set shipment_status = 'Cancelada',
    supplier_name = 'ALTERADO DIRECTAMENTE'
where id = '52400000-0000-0000-0000-000000000001';

reset role;
select pg_temp.assert_true(
  (
    select shipment_status = 'Pendiente Validación'
      and supplier_name = 'Proveedor inicial'
    from public.shipping_instructions
    where id = '52400000-0000-0000-0000-000000000001'
  ),
  'Ventas no debe actualizar ninguna columna directamente'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

select public.save_shipping_instruction_sales_initial(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001'),
  '{
    "supplier_name":"Proveedor autorizado",
    "supplier_contact":"Contacto autorizado",
    "supplier_email":"ventas@test.local",
    "supplier_phone":"+504 2222-2222",
    "supplier_address":"Direccion autorizada",
    "sales_observations":"Observacion inicial",
    "special_instructions":"Instruccion comercial inicial"
  }'::jsonb,
  false
);

reset role;
select pg_temp.assert_true(
  (
    select supplier_name = 'Proveedor autorizado'
      and special_instructions = 'Instruccion comercial inicial'
    from public.shipping_instructions
    where id = '52400000-0000-0000-0000-000000000001'
  ),
  'Ventas debe poder guardar todos los campos iniciales permitidos'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000001',
    (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001'),
    '{"shipment_status":"Cancelada"}'::jsonb,
    false
  )$$,
  'Ventas no debe enviar columnas fuera de la lista permitida'
);

select public.save_shipping_instruction_sales_initial(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001'),
  '{}'::jsonb,
  true
);

select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000001',
    (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001'),
    '{"supplier_name":"Cambio tardio"}'::jsonb,
    false
  )$$,
  'Ventas no debe editar despues de enviar a Operaciones'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);

select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000002',
    (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000002'),
    '{}'::jsonb,
    false
  )$$,
  'Ventas no debe editar una SI creada por otra persona'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

create temp table stale_operations_version as
select updated_at
from public.shipping_instructions
where id = '52400000-0000-0000-0000-000000000001';

select public.save_shipping_instruction_operations_details(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from stale_operations_version),
  '{"freight_terms":"Prepaid","insurance_requested":true}'::jsonb
);

reset role;
select pg_temp.assert_true(
  (
    select freight_terms = 'Prepaid' and insurance_requested = true
    from public.shipping_instructions
    where id = '52400000-0000-0000-0000-000000000001'
  ) and (
    select count(*) = 1
    from public.activity_logs
    where action = 'shipping_instruction_updated'
      and entity_id = '52400000-0000-0000-0000-000000000001'
  ),
  'El guardado operativo debe ser explicito y dejar auditoria'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_error(
  $$select public.save_shipping_instruction_operations_details(
    '52400000-0000-0000-0000-000000000001',
    (select updated_at from stale_operations_version),
    '{"freight_terms":"Collect"}'::jsonb
  )$$,
  'El guardado operativo debe rechazar una version obsoleta'
);

select pg_temp.expect_error(
  $$select public.save_shipping_instruction_operations_details(
    '52400000-0000-0000-0000-000000000001',
    (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001'),
    '{"shipment_status":"Cancelada"}'::jsonb
  )$$,
  'Operaciones no debe cambiar estados mediante el formulario general'
);

create temp table stale_si_version as
select updated_at
from public.shipping_instructions
where id = '52400000-0000-0000-0000-000000000001';

select public.validate_shipping_instruction(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from stale_si_version)
);

select pg_temp.expect_error(
  $$select public.assign_shipping_instruction(
    '52400000-0000-0000-0000-000000000001',
    '52100000-0000-0000-0000-000000000003',
    (select updated_at from stale_si_version)
  )$$,
  'La asignacion debe rechazar una version obsoleta'
);

select public.assign_shipping_instruction(
  '52400000-0000-0000-0000-000000000001',
  '52100000-0000-0000-0000-000000000003',
  (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001')
);

select pg_temp.assert_true(
  (
    select si.operations_assigned_to = '52100000-0000-0000-0000-000000000003'
      and si.operational_status = 'Listo para Booking'
      and shipment.assigned_to = si.operations_assigned_to
    from public.shipping_instructions si
    join public.shipments shipment on shipment.shipping_instruction_id = si.id
    where si.id = '52400000-0000-0000-0000-000000000001'
  ),
  'Asignar debe sincronizar shipment sin regresar una SI validada'
);

select pg_temp.expect_error(
  $$select public.assign_shipping_instruction(
    '52400000-0000-0000-0000-000000000001',
    '52100000-0000-0000-0000-000000000006',
    (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000001')
  )$$,
  'No se debe asignar un operativo inactivo'
);

select public.cancel_shipping_instruction(
  '52400000-0000-0000-0000-000000000002',
  (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000002'),
  'Cancelacion atomica de prueba'
);

select pg_temp.assert_true(
  (
    select si.shipment_status = 'Cancelada'
      and si.operational_status = 'Cancelada'
      and shipment.operational_status = 'Cancelada'
      and shipment.closed_at is not null
    from public.shipping_instructions si
    join public.shipments shipment on shipment.shipping_instruction_id = si.id
    where si.id = '52400000-0000-0000-0000-000000000002'
  ),
  'Cancelar debe cerrar SI y shipment en la misma transaccion'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.activity_logs
    where action = 'shipping_instruction_cancelled'
      and entity_id = '52400000-0000-0000-0000-000000000002'
  ) and (
    select count(*) = 1
    from public.operational_events
    where shipping_instruction_id = '52400000-0000-0000-0000-000000000002'
      and event_label = 'Shipping Instruction cancelada'
  ),
  'La cancelacion debe dejar auditoria y evento operativo'
);

select pg_temp.expect_error(
  $$select public.cancel_shipping_instruction(
    '52400000-0000-0000-0000-000000000003',
    (select updated_at from public.shipping_instructions where id = '52400000-0000-0000-0000-000000000003'),
    'No debe permitir booking existente'
  )$$,
  'Una SI con bookings no se debe cancelar'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

create temp table first_page as
select public.list_shipping_instructions(
  'RT-PAGE-', 'Todos', 'Todos', 1, 25
) as payload;

create temp table second_page as
select public.list_shipping_instructions(
  'RT-PAGE-', 'Todos', 'Todos', 2, 25
) as payload;

select pg_temp.assert_true(
  (select (payload ->> 'total')::integer = 30 from first_page)
  and (select jsonb_array_length(payload -> 'items') = 25 from first_page)
  and (select (payload ->> 'page')::integer = 1 from first_page)
  and (select jsonb_array_length(payload -> 'items') = 5 from second_page)
  and (select (payload ->> 'page')::integer = 2 from second_page),
  'La bandeja debe paginar y contar en servidor'
);

select pg_temp.assert_true(
  (
    select (public.list_shipping_instructions(
      'Q-SI-SEARCH-001', 'Todos', 'Todos', 1, 25
    ) ->> 'total')::integer = 1
  ) and (
    select (public.list_shipping_instructions(
      '%', 'Todos', 'Todos', 1, 25
    ) ->> 'total')::integer = 1
  ),
  'Busqueda por relacion y comodines literales debe ser exacta'
);

select pg_temp.assert_true(
  (
    select (public.list_shipping_instructions(
      '', 'Parcialmente Confirmado', 'Todos', 1, 25
    ) ->> 'total')::integer = 1
  ),
  'El filtro debe usar el estado agregado de multiples bookings'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select (public.list_shipping_instructions(
      '', 'Todos', 'Mis asignados', 1, 25
    ) ->> 'total')::integer = 1
  ),
  'Mis asignados debe usar el usuario autenticado'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select (public.list_shipping_instructions(
      'RT-ASSIGNED-001', 'Todos', 'Todos', 1, 25
    ) ->> 'total')::integer = 1
  ) and (
    select (public.list_shipping_instructions(
      'RT-WORKFLOW-001', 'Todos', 'Todos', 1, 25
    ) ->> 'total')::integer = 0
  ),
  'La RPC debe conservar el alcance RLS de Ventas aunque sea security definer'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000006","role":"authenticated"}',
  true
);

select pg_temp.expect_error(
  $$select public.list_shipping_instructions('', 'Todos', 'Todos', 1, 25)$$,
  'Un usuario inactivo no debe consultar la RPC'
);

set local role anon;
select pg_temp.expect_error(
  $$select public.list_shipping_instructions('', 'Todos', 'Todos', 1, 25)$$,
  'Anon no debe ejecutar la RPC'
);

reset role;
rollback;

\echo 'shipping_instruction_workflow_hardening.sql: OK'

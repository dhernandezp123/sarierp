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

create or replace function pg_temp.expect_error(command text, message text, expected_state text default null)
returns void language plpgsql as $$
declare
  failed boolean := false;
begin
  begin
    execute command;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then
      raise exception 'Unexpected SQLSTATE % (expected %): %', sqlstate, expected_state, sqlerrm;
    end if;
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
  tenant_id = '00000000-0000-4000-8000-000000000001',
  is_platform_admin = false,
  status = 'Aprobado',
  is_active = id <> '52100000-0000-0000-0000-000000000006'
where id in (
  '52100000-0000-0000-0000-000000000001', '52100000-0000-0000-0000-000000000002',
  '52100000-0000-0000-0000-000000000003', '52100000-0000-0000-0000-000000000004',
  '52100000-0000-0000-0000-000000000005', '52100000-0000-0000-0000-000000000006'
);

select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000001","role":"authenticated"}', true);

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

-- The existing fixtures cover pending, assigned, closed and third-party owners.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select pg_temp.expect_error(
  $$select public.accept_shipping_instruction_handoff(
    '52400000-0000-0000-0000-000000000001',
    (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000001'))$$,
  'Admin must submit before acceptance');

select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000001', '2000-01-01', '{}', true)$$,
  'Admin must not bypass stale revisions');

-- Admin submits an SI created by Sales, then accepts and validates it.
select public.save_shipping_instruction_sales_initial(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000001'), '{}', true);
select public.accept_shipping_instruction_handoff(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000001'));
select public.validate_shipping_instruction(
  '52400000-0000-0000-0000-000000000001',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000001'));
select pg_temp.assert_true((select operational_status='Listo para Booking'
  and operations_assigned_to=auth.uid() and operations_accepted_by=auth.uid()
  and validated_by=auth.uid() from public.shipping_instructions
  where id='52400000-0000-0000-0000-000000000001'), 'Admin reaches booking readiness');
select pg_temp.assert_true((select assigned_to=auth.uid() from public.shipments
  where shipping_instruction_id='52400000-0000-0000-0000-000000000001'), 'Shipment owner follows acceptance');
select public.create_booking_for_shipping_instruction('52400000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*)=1 from public.bookings
  where shipping_instruction_id='52400000-0000-0000-0000-000000000001'), 'Admin creates booking after validation');

-- The actual reported case: SI created by Admin, without a Sales submission.
reset role;
update public.shipping_instructions set created_by='52100000-0000-0000-0000-000000000001'
where id='52400000-0000-0000-0000-000000000002';
set local role authenticated;
select public.save_shipping_instruction_sales_initial(
  '52400000-0000-0000-0000-000000000002',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000002'), '{}', true);
select public.accept_shipping_instruction_handoff(
  '52400000-0000-0000-0000-000000000002',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000002'));

-- Admin can explicitly take responsibility from an assigned operator.
select public.save_shipping_instruction_sales_initial(
  '52400000-0000-0000-0000-000000000005',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000005'), '{}', true);
select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select pg_temp.expect_error(
  $$select public.accept_shipping_instruction_handoff(
    '52400000-0000-0000-0000-000000000005',
    (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000005'))$$,
  'Another operator cannot take the assignment', '42501');
select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.accept_shipping_instruction_handoff(
  '52400000-0000-0000-0000-000000000005',
  (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000005'));
select pg_temp.assert_true((select operations_assigned_to=auth.uid()
  and operations_accepted_by=auth.uid() from public.shipping_instructions
  where id='52400000-0000-0000-0000-000000000005'), 'Admin assumes responsibility explicitly');

reset role;
update public.shipping_instructions set shipment_status='Cancelada', operational_status='Cancelada'
where id='52400000-0000-0000-0000-000000000006';
set local role authenticated;
select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000006',
    (select updated_at from public.shipping_instructions where id='52400000-0000-0000-0000-000000000006'), '{}', true)$$,
  'Admin cannot submit cancelled operations');

select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000006', clock_timestamp(), '{}', true)$$,
  'Sales cannot send another user SI');
select pg_temp.expect_error(
  $$select public.accept_shipping_instruction_handoff(
    '52400000-0000-0000-0000-000000000001', clock_timestamp())$$,
  'Sales cannot accept operational handoffs');

reset role;
insert into public.tenants (id, slug, name) values
  ('52900000-0000-4000-8000-000000000001', 'admin-handoff-test', 'Other tenant');
select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('52100000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'si-admin-other-tenant@test.local', '{}');
update public.profiles set tenant_id='52900000-0000-4000-8000-000000000001',
  rol='Admin', status='Aprobado', is_active=true, is_platform_admin=false
where id='52100000-0000-0000-0000-000000000007';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*)=0 from public.shipping_instructions
  where id='52400000-0000-0000-0000-000000000001'), 'RLS hides another tenant SI from Admin');
select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000001', clock_timestamp(), '{}', true)$$,
  'Admin cannot submit another tenant SI', 'P0002');
select pg_temp.expect_error(
  $$select public.accept_shipping_instruction_handoff(
    '52400000-0000-0000-0000-000000000001', clock_timestamp())$$,
  'Admin cannot accept another tenant SI', 'P0002');

reset role;
update public.profiles set is_active=false
where id='52100000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"52100000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error(
  $$select public.save_shipping_instruction_sales_initial(
    '52400000-0000-0000-0000-000000000001', clock_timestamp(), '{}', true)$$,
  'Inactive Admin cannot submit', '42501');
select pg_temp.expect_error(
  $$select public.accept_shipping_instruction_handoff(
    '52400000-0000-0000-0000-000000000001', clock_timestamp())$$,
  'Inactive Admin cannot accept', '42501');

reset role;
rollback;
\echo 'admin_shipping_instruction_handoff.sql: OK'

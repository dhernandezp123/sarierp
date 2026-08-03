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

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('6d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'admin-booking-doc-delete@test.local', '{}'::jsonb),
  ('6d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'operations-booking-doc-delete@test.local', '{}'::jsonb),
  ('6d000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'sales-owner-booking-doc-delete@test.local', '{}'::jsonb),
  ('6d000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
   'sales-other-booking-doc-delete@test.local', '{}'::jsonb),
  ('6d000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated',
   'inactive-operations-booking-doc-delete@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '6d000000-0000-0000-0000-000000000001' then 'Admin'::public.user_role
    when '6d000000-0000-0000-0000-000000000002' then 'Operaciones'::public.user_role
    when '6d000000-0000-0000-0000-000000000005' then 'Operaciones'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado',
  is_active = id <> '6d000000-0000-0000-0000-000000000005';

insert into public.shipping_instructions (
  id,
  routing_number,
  created_by,
  status,
  shipment_status,
  operational_status
) values
  (
    '6d100000-0000-0000-0000-000000000001',
    'RT-DOC-DELETE-OWNER',
    '6d000000-0000-0000-0000-000000000003',
    'Validada',
    'Booking Confirmado',
    'Booking Confirmado'
  ),
  (
    '6d100000-0000-0000-0000-000000000002',
    'RT-DOC-DELETE-OTHER',
    '6d000000-0000-0000-0000-000000000004',
    'Validada',
    'Booking Confirmado',
    'Booking Confirmado'
  );

insert into public.bookings (id, shipping_instruction_id, created_by)
values
  (
    '6d200000-0000-0000-0000-000000000001',
    '6d100000-0000-0000-0000-000000000001',
    '6d000000-0000-0000-0000-000000000002'
  ),
  (
    '6d200000-0000-0000-0000-000000000002',
    '6d100000-0000-0000-0000-000000000002',
    '6d000000-0000-0000-0000-000000000002'
  );

insert into public.booking_documents (
  id,
  booking_id,
  document_type,
  file_name,
  file_url,
  uploaded_by
) values
  (
    '6d300000-0000-0000-0000-000000000001',
    '6d200000-0000-0000-0000-000000000001',
    'Other',
    'admin-delete.pdf',
    '6d200000-0000-0000-0000-000000000001/admin-delete.pdf',
    '6d000000-0000-0000-0000-000000000001'
  ),
  (
    '6d300000-0000-0000-0000-000000000002',
    '6d200000-0000-0000-0000-000000000001',
    'Other',
    'operations-delete.pdf',
    '6d200000-0000-0000-0000-000000000001/operations-delete.pdf',
    '6d000000-0000-0000-0000-000000000002'
  ),
  (
    '6d300000-0000-0000-0000-000000000003',
    '6d200000-0000-0000-0000-000000000001',
    'Other',
    'sales-owner-denied.pdf',
    '6d200000-0000-0000-0000-000000000001/sales-owner-denied.pdf',
    '6d000000-0000-0000-0000-000000000001'
  ),
  (
    '6d300000-0000-0000-0000-000000000004',
    '6d200000-0000-0000-0000-000000000002',
    'Other',
    'sales-other-denied.pdf',
    '6d200000-0000-0000-0000-000000000002/sales-other-denied.pdf',
    '6d000000-0000-0000-0000-000000000001'
  ),
  (
    '6d300000-0000-0000-0000-000000000005',
    '6d200000-0000-0000-0000-000000000001',
    'Other',
    'inactive-operations-denied.pdf',
    '6d200000-0000-0000-0000-000000000001/inactive-operations-denied.pdf',
    '6d000000-0000-0000-0000-000000000001'
  );

\ir ../migrations/20260803143000_booking_document_delete_permissions.sql
\ir ../migrations/20260803143000_booking_document_delete_permissions.sql

select pg_temp.assert_true(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'booking_documents'
      and policyname = 'booking_documents_delete_policy'
      and cmd = 'DELETE'
  ),
  'La policy DELETE debe existir una sola vez despues de reaplicarla'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

with deleted as (
  delete from public.booking_documents
  where id = '6d300000-0000-0000-0000-000000000001'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 1 from deleted),
  'Admin debe eliminar metadata de documentos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

with deleted as (
  delete from public.booking_documents
  where id = '6d300000-0000-0000-0000-000000000002'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 1 from deleted),
  'Operaciones debe eliminar metadata de documentos'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booking_documents
    where id = '6d300000-0000-0000-0000-000000000003'
  ),
  'Ventas propietario debe conservar lectura del documento'
);

with deleted as (
  delete from public.booking_documents
  where id = '6d300000-0000-0000-0000-000000000003'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from deleted),
  'Ventas propietario no debe eliminar documentos'
);

with deleted as (
  delete from public.booking_documents
  where id = '6d300000-0000-0000-0000-000000000004'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from deleted),
  'Ventas no debe eliminar documentos de un booking ajeno'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"6d000000-0000-0000-0000-000000000005","role":"authenticated"}',
  true
);

with deleted as (
  delete from public.booking_documents
  where id = '6d300000-0000-0000-0000-000000000005'
  returning id
)
select pg_temp.assert_true(
  (select count(*) = 0 from deleted),
  'Operaciones inactivo no debe eliminar documentos'
);

reset role;

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.booking_documents
    where id in (
      '6d300000-0000-0000-0000-000000000003',
      '6d300000-0000-0000-0000-000000000004',
      '6d300000-0000-0000-0000-000000000005'
    )
  ),
  'Los intentos no autorizados deben conservar las tres filas'
);

rollback;

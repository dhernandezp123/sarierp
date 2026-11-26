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
declare
  blocked boolean := false;
begin
  begin
    execute command;
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('6b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'operations-6b@test.local', '{}'::jsonb);

update public.profiles
set rol = 'Admin'::public.user_role,
    tenant_id = '00000000-0000-4000-8000-000000000001',
    is_platform_admin = false,
    status = 'Aprobado',
    is_active = true
where id = '6b000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims','{"sub":"6b000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.clientes (id, nombre)
values ('6b100000-0000-0000-0000-000000000001', 'Cliente BL 6B');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number,
  service_product, quote_type, tipo_transporte, incoterm, origen, destino
) values (
  '6b200000-0000-0000-0000-000000000001',
  '6b100000-0000-0000-0000-000000000001',
  '6b000000-0000-0000-0000-000000000001',
  'Ganada', 'Q-6B-BL', 'other_origin_fcl', 'FCL', 'Maritimo',
  'FOB', 'Shanghai', 'Puerto Cortes'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status
) values (
  '6b300000-0000-0000-0000-000000000001',
  'RT-6B-BL',
  '6b200000-0000-0000-0000-000000000001',
  '6b100000-0000-0000-0000-000000000001',
  '6b000000-0000-0000-0000-000000000001',
  'Validada', 'Booking Confirmado', 'Booking Confirmado'
);

insert into public.bookings (
  id, shipping_instruction_id, booking_number, carrier, vessel_name, voyage,
  shipment_status, created_by
) values (
  '6b400000-0000-0000-0000-000000000001',
  '6b300000-0000-0000-0000-000000000001',
  'BOOKING-6B', 'MAERSK', 'VESSEL 6B', '001S',
  'Booking Confirmado',
  '6b000000-0000-0000-0000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '6b000000-0000-0000-0000-000000000001',
  true
);



create or replace function pg_temp.create_returning_bl(p_id uuid, p_type text, p_parent uuid default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_number text;
begin
  insert into public.bills_of_lading(id,booking_id,shipping_instruction_id,bl_type,bl_number,parent_bl_id,status,created_by)
  values(p_id,'6b400000-0000-0000-0000-000000000001','6b300000-0000-0000-0000-000000000001',p_type,
    case when p_type='MBL' then 'MASTER-RETURNING-'||p_id::text else null end,p_parent,
    case when p_type='MBL' then 'MBL Draft' else 'HBL Draft' end,auth.uid())
  returning id,bl_number into v_id,v_number;
  if v_id is distinct from p_id then raise exception 'INSERT RETURNING lost document identity'; end if;
  if nullif(v_number,'') is null then raise exception 'INSERT RETURNING lost document number'; end if;
  return v_id;
end;
$$;

create or replace function pg_temp.set_fixture_profile(p_role text, p_active boolean default true, p_status text default 'Aprobado')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  update public.profiles set rol=p_role::public.user_role,is_active=p_active,status=p_status
    where id='6b000000-0000-0000-0000-000000000001';
  perform set_config('request.jwt.claims','{"sub":"6b000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
end;
$$;

set local role authenticated;
-- Admin: exactly the INSERT + representation requested by the editor.
select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000011','MBL');
select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000012','HBL','6b500000-0000-0000-0000-000000000011');
select pg_temp.assert_true((select bl_number like 'SARI-HBL-%' from public.bills_of_lading
  where id='6b500000-0000-0000-0000-000000000012'), 'HBL numbering remains server-generated');
select pg_temp.assert_true((select count(*)=2 from public.bills_of_lading
  where booking_id='6b400000-0000-0000-0000-000000000001'), 'Admin reads the documents just created');
select pg_temp.expect_denied($cmd$select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000013','HBL')$cmd$,
  'HBL still requires its MBL parent');

reset role;
select pg_temp.set_fixture_profile('Operaciones');
set local role authenticated;
select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000021','MBL');
select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000022','HBL','6b500000-0000-0000-0000-000000000021');

reset role;
-- Test each forbidden role as an authenticated, approved and active user.
do $roles$
declare v_role text;
begin
  foreach v_role in array array['Ventas','Pricing','Contabilidad','Cliente'] loop
    perform pg_temp.set_fixture_profile(v_role);
    execute 'set local role authenticated';
    perform pg_temp.expect_denied($cmd$select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000031','MBL')$cmd$,
      'Forbidden role cannot insert returning: '||v_role);
    perform pg_temp.assert_true((select count(*)=0 from public.bills_of_lading
      where booking_id='6b400000-0000-0000-0000-000000000001'), 'Forbidden role cannot read BLs');
    execute 'reset role';
  end loop;
end $roles$;
select pg_temp.set_fixture_profile('Admin',false);
set local role authenticated;
select pg_temp.expect_denied($cmd$select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000031','MBL')$cmd$,
  'Inactive Admin cannot create');
reset role;
select pg_temp.set_fixture_profile('Admin',true,'Pendiente');
set local role authenticated;
select pg_temp.expect_denied($cmd$select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000031','MBL')$cmd$,
  'Unapproved Admin cannot create');
reset role;

select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
insert into public.tenants(id,slug,name) values('6b900000-0000-4000-8000-000000000001','bl-returning-test','Other tenant');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
values('6b000000-0000-0000-0000-000000000002','authenticated','authenticated','other-bl-admin@test.local','{}');
update public.profiles set rol='Admin',status='Aprobado',is_active=true,is_platform_admin=false,
  tenant_id='6b900000-0000-4000-8000-000000000001' where id='6b000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims','{"sub":"6b000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.bills_of_lading
  where booking_id='6b400000-0000-0000-0000-000000000001'), 'Other tenant Admin cannot read BLs');
select pg_temp.expect_denied($cmd$select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000031','MBL')$cmd$,
  'Other tenant Admin cannot insert under a foreign booking');
reset role;
set local role anon;
select pg_temp.expect_denied($cmd$select pg_temp.create_returning_bl('6b500000-0000-0000-0000-000000000031','MBL')$cmd$,
  'Anonymous cannot create');
reset role;
rollback;
\echo 'bl_insert_returning_rls.sql: OK'

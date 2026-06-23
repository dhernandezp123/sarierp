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
  ('49400000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pricing-delete@test.local', '{}'::jsonb),
  ('49400000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sales-delete@test.local', '{}'::jsonb),
  ('49400000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ops-delete@test.local', '{}'::jsonb),
  ('49400000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'accounting-delete@test.local', '{}'::jsonb),
  ('49400000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'client-delete@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '49400000-0000-0000-0000-000000000001' then 'Pricing'::public.user_role
    when '49400000-0000-0000-0000-000000000002' then 'Ventas'::public.user_role
    when '49400000-0000-0000-0000-000000000003' then 'Operaciones'::public.user_role
    when '49400000-0000-0000-0000-000000000004' then 'Contabilidad'::public.user_role
    else 'Cliente'::public.user_role
  end,
  status = 'Aprobado', is_active = true;

insert into public.clientes (id, nombre)
values ('49500000-0000-0000-0000-000000000001', 'Cliente Pricing RLS');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number
)
values (
  '49600000-0000-0000-0000-000000000001',
  '49500000-0000-0000-0000-000000000001',
  '49400000-0000-0000-0000-000000000002',
  'Ganada', 'Q-DELETE-RLS'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by
)
values (
  '49700000-0000-0000-0000-000000000001', 'RT-DELETE-RLS',
  '49600000-0000-0000-0000-000000000001',
  '49500000-0000-0000-0000-000000000001',
  '49400000-0000-0000-0000-000000000002'
);

insert into public.pricing_items (id, quotation_id, item_type, description)
values
  ('49800000-0000-0000-0000-000000000001', '49600000-0000-0000-0000-000000000001', 'Flete', 'Pricing puede borrar'),
  ('49800000-0000-0000-0000-000000000002', '49600000-0000-0000-0000-000000000001', 'Flete', 'Ventas puede borrar'),
  ('49800000-0000-0000-0000-000000000003', '49600000-0000-0000-0000-000000000001', 'Flete', 'Operaciones puede borrar'),
  ('49800000-0000-0000-0000-000000000004', '49600000-0000-0000-0000-000000000001', 'Flete', 'Contabilidad no puede borrar'),
  ('49800000-0000-0000-0000-000000000005', '49600000-0000-0000-0000-000000000001', 'Flete', 'Cliente no puede borrar');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"49400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
delete from public.pricing_items where id = '49800000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims', '{"sub":"49400000-0000-0000-0000-000000000002","role":"authenticated"}', true);
delete from public.pricing_items where id = '49800000-0000-0000-0000-000000000002';

select set_config('request.jwt.claims', '{"sub":"49400000-0000-0000-0000-000000000003","role":"authenticated"}', true);
delete from public.pricing_items where id = '49800000-0000-0000-0000-000000000003';

select set_config('request.jwt.claims', '{"sub":"49400000-0000-0000-0000-000000000004","role":"authenticated"}', true);
delete from public.pricing_items where id = '49800000-0000-0000-0000-000000000004';

select set_config('request.jwt.claims', '{"sub":"49400000-0000-0000-0000-000000000005","role":"authenticated"}', true);
delete from public.pricing_items where id = '49800000-0000-0000-0000-000000000005';

reset role;

select pg_temp.assert_true(
  (select count(*) = 0 from public.pricing_items
   where id in (
     '49800000-0000-0000-0000-000000000001',
     '49800000-0000-0000-0000-000000000002',
     '49800000-0000-0000-0000-000000000003'
   )),
  'Pricing, Ventas y Operaciones con acceso deben poder reemplazar líneas'
);

select pg_temp.assert_true(
  (select count(*) = 2 from public.pricing_items
   where id in (
     '49800000-0000-0000-0000-000000000004',
     '49800000-0000-0000-0000-000000000005'
   )),
  'Contabilidad y Cliente no deben poder eliminar pricing'
);

rollback;

\echo 'phase5_pricing_delete_rls.sql: OK'

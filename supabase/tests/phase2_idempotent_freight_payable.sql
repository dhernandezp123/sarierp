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
values (
  '20000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'finance-payable@test.local',
  '{}'::jsonb
);

update public.profiles
set rol = 'Finanzas', status = 'Aprobado', is_active = true
where id = '20000000-0000-0000-0000-000000000003';

insert into public.agents (id, name)
values ('23000000-0000-0000-0000-000000000001', 'Agente CxP Phase 2');

insert into public.proveedores (id, nombre, tipo, agente_id, terminos_pago)
values (
  '23000000-0000-0000-0000-000000000002',
  'Proveedor CxP Phase 2',
  'Agente',
  '23000000-0000-0000-0000-000000000001',
  30
);

insert into public.quotations (id, created_by, quotation_number, status)
values (
  '23000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000003',
  'QT-CXP-PHASE2',
  'Ganada'
);

insert into public.agent_quotes (
  quotation_id,
  agente_nombre,
  agent_id,
  costo,
  moneda,
  is_selected
)
values (
  '23000000-0000-0000-0000-000000000003',
  'Agente CxP Phase 2',
  '23000000-0000-0000-0000-000000000001',
  1250,
  'USD',
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

create temporary table payable_results as
select * from public.create_freight_account_payable(
  '23000000-0000-0000-0000-000000000003'
)
union all
select * from public.create_freight_account_payable(
  '23000000-0000-0000-0000-000000000003'
);

select pg_temp.assert_true(
  (select count(*) = 2 from payable_results),
  'El RPC debe responder en ambos intentos'
);

select pg_temp.assert_true(
  (select count(*) filter (where was_created) = 1 from payable_results),
  'Solo el primer intento debe crear la CxP'
);

select pg_temp.assert_true(
  (select count(distinct account_payable_id) = 1 from payable_results),
  'Ambos intentos deben devolver la misma CxP'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.cuentas_pagar
    where generation_source = 'quotation_selected_freight'
      and generation_key = '23000000-0000-0000-0000-000000000003'
  ),
  'Solo debe persistir una CxP de flete por cotización'
);

reset role;
rollback;

\echo 'phase2_idempotent_freight_payable.sql: OK'

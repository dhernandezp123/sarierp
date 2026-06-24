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
  ('49900000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pricing-atomic@test.local', '{}'::jsonb),
  ('49900000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sales-atomic@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '49900000-0000-0000-0000-000000000001' then 'Pricing'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado', is_active = true;

insert into public.clientes (id, nombre)
values ('49910000-0000-0000-0000-000000000001', 'Cliente Pricing Atómico');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number
)
values (
  '49920000-0000-0000-0000-000000000001',
  '49910000-0000-0000-0000-000000000001',
  '49900000-0000-0000-0000-000000000002',
  'Pendiente de Fijar Precios', 'Q-ATOMIC-001'
);

insert into public.agent_quotes (
  id, quotation_id, agente_nombre, ocean_freight, carrier,
  transit_time, transshipment, valid_until, is_selected
)
values
  ('49930000-0000-0000-0000-000000000001', '49920000-0000-0000-0000-000000000001',
   'Agente anterior', 100, 'OLD CARRIER', '20 días', 'No', current_date + 10, true),
  ('49930000-0000-0000-0000-000000000002', '49920000-0000-0000-0000-000000000001',
   'Agente nuevo', 120, 'NEW CARRIER', '12 días', 'Panamá', current_date + 30, false);

insert into public.pricing_items (
  id, quotation_id, item_type, description, cost_amount, sale_amount, quantity
)
values (
  '49940000-0000-0000-0000-000000000001',
  '49920000-0000-0000-0000-000000000001',
  'Flete', 'Línea anterior', 100, 120, 1
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select * from public.select_agent_quote_and_replace_pricing(
  '49920000-0000-0000-0000-000000000001',
  '49930000-0000-0000-0000-000000000002',
  '[
    {"item_type":"Flete","description":"Flete nuevo","cost_amount":120,"sale_amount":150,"quantity":1,"taxable":false,"tax_rate":0,"tax_amount":0,"total_amount":150,"currency":"USD","supplier":"Agente nuevo"},
    {"item_type":"Origen","description":"EXW","cost_amount":20,"sale_amount":20,"quantity":1,"taxable":false,"tax_rate":0,"tax_amount":0,"total_amount":20,"currency":"USD","supplier":"Agente nuevo"}
  ]'::jsonb,
  'Cambio por mejor tiempo de tránsito'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(id = '49930000-0000-0000-0000-000000000002')
    from public.agent_quotes
    where quotation_id = '49920000-0000-0000-0000-000000000001'
      and is_selected is true
  ),
  'Debe quedar una sola tarifa seleccionada'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
      and count(*) filter (where description = 'Línea anterior') = 0
      and sum(total_amount) = 170
    from public.pricing_items
    where quotation_id = '49920000-0000-0000-0000-000000000001'
  ),
  'El pricing anterior debe reemplazarse completo en la misma transacción'
);

select pg_temp.assert_true(
  (
    select preferred_carrier = 'NEW CARRIER'
      and transit_time = '12 días'
      and transshipment = 'Panamá'
    from public.quotations
    where id = '49920000-0000-0000-0000-000000000001'
  ),
  'La cotización debe sincronizar los datos comerciales de la tarifa'
);

select pg_temp.expect_denied(
  $$select public.select_agent_quote_and_replace_pricing(
    '49920000-0000-0000-0000-000000000001',
    '49930000-0000-0000-0000-000000000001',
    '[{"item_type":"Flete","description":"","cost_amount":1,"sale_amount":1,"quantity":1}]'::jsonb,
    'Intento inválido'
  )$$,
  'Una línea inválida debe abortar toda la selección'
);

select pg_temp.assert_true(
  (
    select is_selected is true
    from public.agent_quotes
    where id = '49930000-0000-0000-0000-000000000002'
  ),
  'Un intento fallido no debe cambiar la selección previa'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"49900000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.expect_denied(
  $$select public.select_agent_quote_and_replace_pricing(
    '49920000-0000-0000-0000-000000000001',
    '49930000-0000-0000-0000-000000000001',
    '[{"item_type":"Flete","description":"No autorizado","cost_amount":1,"sale_amount":1,"quantity":1}]'::jsonb,
    'Ventas no autorizado'
  )$$,
  'Ventas no debe seleccionar tarifas de agente'
);

select pg_temp.expect_denied(
  $$select public.notify_expired_selected_agent_quotes()$$,
  'Los usuarios web no deben poder ejecutar el proceso global de vencimientos'
);

reset role;
rollback;

\echo 'phase5_atomic_agent_selection.sql: OK'

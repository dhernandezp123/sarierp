\set ON_ERROR_STOP on

begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(1);

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
  ('6c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'pricing-options@test.local', '{}'::jsonb),
  ('6c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'sales-options@test.local', '{}'::jsonb);

update public.profiles
set rol = case id
    when '6c000000-0000-0000-0000-000000000001' then 'Pricing'::public.user_role
    else 'Ventas'::public.user_role
  end,
  status = 'Aprobado', is_active = true
where id in (
  '6c000000-0000-0000-0000-000000000001',
  '6c000000-0000-0000-0000-000000000002'
);

insert into public.clientes (id, nombre)
values ('6c100000-0000-0000-0000-000000000001', 'Cliente Opciones');

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number, origen, destino
) values (
  '6c200000-0000-0000-0000-000000000001',
  '6c100000-0000-0000-0000-000000000001',
  '6c000000-0000-0000-0000-000000000002',
  'Pendiente de Fijar Precios', 'Q-OPTIONS-001', 'Shanghai', 'Puerto Cortés'
);

insert into public.agent_quotes (
  id, quotation_id, agente_nombre, ocean_freight, carrier, transit_time,
  free_days_destination, transshipment, valid_until, etd, is_selected
) values
  (
    '6c300000-0000-0000-0000-000000000001',
    '6c200000-0000-0000-0000-000000000001',
    'Agente A', 1000, 'NAVIERA A', '20 días', 10, 'Directo',
    current_date + 30, current_date + 5, true
  ),
  (
    '6c300000-0000-0000-0000-000000000002',
    '6c200000-0000-0000-0000-000000000001',
    'Agente B', 900, 'NAVIERA B', '25 días', 7, 'Panamá',
    current_date + 25, current_date + 7, false
  );

insert into public.pricing_items (
  id, quotation_id, item_type, description, cost_amount, sale_amount,
  quantity, taxable, tax_rate, tax_amount, total_amount, currency
) values (
  '6c400000-0000-0000-0000-000000000001',
  '6c200000-0000-0000-0000-000000000001',
  'Flete', 'Flete opción A', 1000, 1200, 1, false, 0, 0, 1200, 'USD'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select * from public.save_current_pricing_as_option_v2(
  '6c200000-0000-0000-0000-000000000001',
  'Salida rápida',
  true,
  null,
  'Salida directa; incluye 10 días libres.'
);

select * from public.update_draft_quotation_option_details(
  (
    select id from public.quotation_options
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
      and option_code = 'A'
  ),
  'Salida rápida actualizada',
  true,
  'Salida directa; incluye 12 días libres.'
);

select * from public.select_agent_quote_and_replace_pricing(
  '6c200000-0000-0000-0000-000000000001',
  '6c300000-0000-0000-0000-000000000002',
  '[{"item_type":"Flete","description":"Flete opción B","cost_amount":900,"sale_amount":1150,"quantity":1,"taxable":false,"tax_rate":0,"tax_amount":0,"total_amount":1150,"currency":"USD","supplier":"Agente B"}]'::jsonb,
  'Preparar segunda opción'
);

select * from public.save_current_pricing_as_option_v2(
  '6c200000-0000-0000-0000-000000000001',
  'Mejor precio',
  false,
  null,
  'Con transbordo en Panamá; sujeta a espacio.'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
      and count(*) filter (
        where option_code = 'A'
          and carrier = 'NAVIERA A'
          and grand_total = 1200
          and label = 'Salida rápida actualizada'
          and client_notes = 'Salida directa; incluye 12 días libres.'
      ) = 1
      and count(*) filter (
        where option_code = 'B'
          and carrier = 'NAVIERA B'
          and grand_total = 1150
          and client_notes = 'Con transbordo en Panamá; sujeta a espacio.'
      ) = 1
    from public.quotation_options
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
  ),
  'Deben conservarse dos snapshots independientes'
);

select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(description = 'Flete opción A')
    from public.quotation_option_items qoi
    join public.quotation_options qo on qo.id = qoi.quotation_option_id
    where qo.quotation_id = '6c200000-0000-0000-0000-000000000001'
      and qo.option_code = 'A'
  ),
  'Cambiar el pricing actual no debe alterar la opción A'
);

reset role;
update public.quotations
set status = 'Pricing Aprobado'
where id = '6c200000-0000-0000-0000-000000000001';

select pg_temp.expect_denied(
  $$update public.quotations
    set status = 'Enviada al Cliente'
    where id = '6c200000-0000-0000-0000-000000000001'$$,
  'No debe enviarse una cotización con opciones que continúan en Borrador'
);

set local role authenticated;

select public.send_quotation_with_options('6c200000-0000-0000-0000-000000000001');

select pg_temp.assert_true(
  (
    select count(*) = 2 and bool_and(status = 'Ofrecida')
    from public.quotation_options
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
  ),
  'Publicar debe congelar todas las opciones borrador'
);

select pg_temp.expect_denied(
  $$select public.save_current_pricing_as_option(
    '6c200000-0000-0000-0000-000000000001', 'No permitido', false, null
  )$$,
  'Una opción publicada no debe poder reemplazarse mediante un nuevo guardado tras el envío'
);

select pg_temp.expect_denied(
  $$select public.update_draft_quotation_option_details(
    (
      select id from public.quotation_options
      where quotation_id = '6c200000-0000-0000-0000-000000000001'
        and option_code = 'A'
    ),
    'Cambio no permitido',
    true,
    'Esta nota no debe guardarse'
  )$$,
  'Una opción ofrecida no debe permitir editar sus detalles comerciales'
);

reset role;
select pg_temp.expect_denied(
  $$update public.quotations
    set status = 'Ganada'
    where id = '6c200000-0000-0000-0000-000000000001'$$,
  'No debe marcarse Ganada sin una opción aceptada'
);

select pg_temp.expect_denied(
  $$insert into public.shipping_instructions (
    id, routing_number, quotation_id, client_id, created_by
  ) values (
    '6c500000-0000-0000-0000-000000000001', 'RT-OPTIONS-BLOCKED',
    '6c200000-0000-0000-0000-000000000001',
    '6c100000-0000-0000-0000-000000000001',
    '6c000000-0000-0000-0000-000000000002'
  )$$,
  'No debe crearse operación antes de elegir una opción'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select * from public.finalize_quotation_option_selection(
  (
    select id from public.quotation_options
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
      and option_code = 'A'
  ),
  false
);

select pg_temp.assert_true(
  (
    select count(*) = 1
      and count(*) filter (where option_code = 'A' and status = 'Aceptada') = 1
    from public.quotation_options
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
      and status = 'Aceptada'
  ),
  'Solo la opción A debe quedar aceptada'
);

select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(description = 'Flete opción A')
    from public.pricing_items
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
  ),
  'Aceptar A debe restaurar únicamente sus líneas como pricing canónico'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(id = '6c300000-0000-0000-0000-000000000001')
    from public.agent_quotes
    where quotation_id = '6c200000-0000-0000-0000-000000000001'
      and is_selected is true
  ),
  'La tarifa vinculada a la opción aceptada debe quedar seleccionada'
);

select pg_temp.assert_true(
  (
    select preferred_carrier = 'NAVIERA A'
      and total_sale = 1200
      and profit_amount = 200
    from public.quotations
    where id = '6c200000-0000-0000-0000-000000000001'
  ),
  'La cotización debe reflejar los valores de la opción ganadora'
);

select pg_temp.assert_true(
  (
    select status = 'Ganada'
    from public.quotations
    where id = '6c200000-0000-0000-0000-000000000001'
  ),
  'Finalizar la elección debe cambiar la cotización a Ganada'
);

reset role;

insert into public.quotations (
  id, cliente_id, created_by, status, quotation_number, origen, destino
) values (
  '6c200000-0000-0000-0000-000000000002',
  '6c100000-0000-0000-0000-000000000001',
  '6c000000-0000-0000-0000-000000000002',
  'Ganada', 'Q-OPTIONS-REPRICING', 'Shanghai', 'Puerto Cortés'
);

insert into public.shipping_instructions (
  id, routing_number, quotation_id, client_id, created_by,
  status, shipment_status, operational_status, agent_name
) values (
  '6c500000-0000-0000-0000-000000000002', 'RT-OPTIONS-REPRICING',
  '6c200000-0000-0000-0000-000000000002',
  '6c100000-0000-0000-0000-000000000001',
  '6c000000-0000-0000-0000-000000000002',
  'Validada', 'Booking Solicitado', 'Listo para Booking', 'Agente anterior'
);

update public.quotations
set status = 'Pendiente de Fijar Precios'
where id = '6c200000-0000-0000-0000-000000000002';

insert into public.agent_quotes (
  id, quotation_id, agente_nombre, ocean_freight, carrier, transit_time,
  free_days_destination, transshipment, valid_until, etd, is_selected
) values (
  '6c300000-0000-0000-0000-000000000003',
  '6c200000-0000-0000-0000-000000000002',
  'Agente Repricing', 1300, 'NAVIERA REPRICING', '18', 14, 'Directo',
  current_date + 30, current_date + 8, true
);

insert into public.pricing_items (
  id, quotation_id, item_type, description, cost_amount, sale_amount,
  quantity, taxable, tax_rate, tax_amount, total_amount, currency
) values (
  '6c400000-0000-0000-0000-000000000002',
  '6c200000-0000-0000-0000-000000000002',
  'Flete', 'Flete repricing', 1300, 1500, 1, false, 0, 0, 1500, 'USD'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select * from public.save_current_pricing_as_option_v2(
  '6c200000-0000-0000-0000-000000000002',
  'Repricing con operación', true, null, 'Opción elegible'
);

reset role;
update public.quotations
set status = 'Pricing Aprobado'
where id = '6c200000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select public.send_quotation_with_options(
  '6c200000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"6c000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select * from public.finalize_quotation_option_selection(
  (
    select id from public.quotation_options
    where quotation_id = '6c200000-0000-0000-0000-000000000002'
      and option_code = 'A'
  ),
  true
);

select pg_temp.assert_true(
  (
    select q.status = 'Ganada'
      and qo.status = 'Aceptada'
      and si.agent_name = 'Agente Repricing'
    from public.quotations q
    join public.quotation_options qo on qo.quotation_id = q.id
    join public.shipping_instructions si on si.quotation_id = q.id
    where q.id = '6c200000-0000-0000-0000-000000000002'
      and qo.option_code = 'A'
  ),
  'Ventas debe aceptar y propagar atómicamente una opción de repricing con SI'
);

select extensions.pass(
  'Snapshots, publicación, selección, restauración y guard operativo validados'
);
select * from extensions.finish();

reset role;
rollback;

\echo 'quotation_commercial_options.sql: OK'

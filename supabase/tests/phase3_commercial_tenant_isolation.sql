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
  was_denied boolean := false;
begin
  begin
    execute command;
  exception when others then
    was_denied := true;
  end;

  if not was_denied then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'clientes', 'client_addresses', 'client_notes',
        'client_pickup_requests', 'client_rates', 'cliente_history',
        'sales_activities', 'quotations', 'quotation_containers',
        'quotation_cargo_lines', 'quotation_status_history',
        'quotation_change_logs', 'pricing_items', 'agents',
        'agent_route_rates', 'agent_quotes',
        'agent_quote_container_rates', 'quotation_options',
        'quotation_option_items'
      )
      and column_name = 'tenant_id'
      and is_nullable <> 'NO'
  ),
  'Las 19 tablas comerciales deben exigir tenant_id'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.profiles profile
    where profile.is_platform_admin is true
      and profile.tenant_id is not null
  ),
  'Un administrador de plataforma no debe conservar un tenant operativo'
);

insert into public.tenants (id, slug, name, status)
values ('00000000-0000-4000-8000-000000000013', 'mya-phase3', 'MYA Phase 3', 'Activo');

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000921', 'authenticated', 'authenticated', 'sari-sales-p3@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000922', 'authenticated', 'authenticated', 'mya-sales-p3@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000923', 'authenticated', 'authenticated', 'sari-pricing-p3@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000924', 'authenticated', 'authenticated', 'mya-pricing-p3@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000925', 'authenticated', 'authenticated', 'sari-client-p3@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000926', 'authenticated', 'authenticated', 'mya-client-p3@test.local', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000927', 'authenticated', 'authenticated', 'platform-p3@test.local', '{}'::jsonb);

update public.profiles
set rol = case
    when id in (
      '00000000-0000-0000-0000-000000000921',
      '00000000-0000-0000-0000-000000000922'
    ) then 'Ventas'::public.user_role
    when id in (
      '00000000-0000-0000-0000-000000000923',
      '00000000-0000-0000-0000-000000000924'
    ) then 'Pricing'::public.user_role
    when id in (
      '00000000-0000-0000-0000-000000000925',
      '00000000-0000-0000-0000-000000000926'
    ) then 'Cliente'::public.user_role
    else 'Admin'::public.user_role
  end,
  status = 'Aprobado',
  is_active = true,
  tenant_id = case
    when id in (
      '00000000-0000-0000-0000-000000000921',
      '00000000-0000-0000-0000-000000000923',
      '00000000-0000-0000-0000-000000000925'
    ) then '00000000-0000-4000-8000-000000000001'::uuid
    when id in (
      '00000000-0000-0000-0000-000000000922',
      '00000000-0000-0000-0000-000000000924',
      '00000000-0000-0000-0000-000000000926'
    ) then '00000000-0000-4000-8000-000000000013'::uuid
    else null
  end,
  is_platform_admin = id = '00000000-0000-0000-0000-000000000927'
where id in (
  '00000000-0000-0000-0000-000000000921',
  '00000000-0000-0000-0000-000000000922',
  '00000000-0000-0000-0000-000000000923',
  '00000000-0000-0000-0000-000000000924',
  '00000000-0000-0000-0000-000000000925',
  '00000000-0000-0000-0000-000000000926',
  '00000000-0000-0000-0000-000000000927'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000921","role":"authenticated"}',
  true
);

insert into public.clientes (id, nombre)
values ('00000000-0000-4000-8000-000000000301', 'Cliente Sari P3');
update public.clientes
set codigo_cliente = 'CLIENTE-COMPARTIDO'
where id = '00000000-0000-4000-8000-000000000301';

insert into public.quotations (id, cliente_id, created_by, status)
values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-0000-0000-000000000921',
  'Borrador'
);
update public.quotations
set quotation_number = 'Q-COMPARTIDA'
where id = '00000000-0000-4000-8000-000000000401';

insert into public.quotation_containers (
  id, quotation_id, container_type_name, quantity
)
values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000401',
  '40HC',
  1
);
insert into public.pricing_items (
  id, quotation_id, item_type, description, created_by
)
values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000401',
  'Flete',
  'Ocean Freight',
  '00000000-0000-0000-0000-000000000921'
);

select pg_temp.assert_true(
  (select tenant_id = '00000000-0000-4000-8000-000000000001' from public.clientes where id = '00000000-0000-4000-8000-000000000301')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001' from public.quotations where id = '00000000-0000-4000-8000-000000000401')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001' from public.quotation_containers where id = '00000000-0000-4000-8000-000000000501')
  and (select tenant_id = '00000000-0000-4000-8000-000000000001' from public.pricing_items where id = '00000000-0000-4000-8000-000000000601'),
  'Raíces e hijos deben derivar automáticamente el tenant Sari'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000922","role":"authenticated"}',
  true
);
insert into public.clientes (id, nombre)
values ('00000000-0000-4000-8000-000000000302', 'Cliente MYA P3');
update public.clientes
set codigo_cliente = 'CLIENTE-COMPARTIDO'
where id = '00000000-0000-4000-8000-000000000302';

insert into public.quotations (id, cliente_id, created_by, status)
values (
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-0000-0000-000000000922',
  'Borrador'
);
update public.quotations
set quotation_number = 'Q-COMPARTIDA'
where id = '00000000-0000-4000-8000-000000000402';

select pg_temp.assert_true(
  (select count(*) = 1 from public.clientes)
    and (select count(*) = 1 from public.quotations),
  'MYA solo debe leer sus propios clientes y cotizaciones'
);
select pg_temp.expect_denied(
  $$insert into public.quotations (cliente_id, created_by, status) values ('00000000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000922', 'Borrador')$$,
  'MYA no debe crear una cotización para un cliente Sari'
);
select pg_temp.expect_denied(
  $$update public.clientes set tenant_id = '00000000-0000-4000-8000-000000000001' where id = '00000000-0000-4000-8000-000000000302'$$,
  'Un usuario no debe mover un cliente a otro tenant'
);
select pg_temp.expect_denied(
  $$insert into public.clientes (nombre, codigo_cliente) values ('Duplicado MYA', 'CLIENTE-COMPARTIDO')$$,
  'El código de cliente debe seguir siendo único dentro de MYA'
);
select pg_temp.expect_denied(
  $$update public.clientes set vendedor_asignado = '00000000-0000-0000-0000-000000000921' where id = '00000000-0000-4000-8000-000000000302'$$,
  'MYA no debe asignar a su cliente un vendedor Sari'
);
select pg_temp.expect_denied(
  $$update public.quotations set created_by = '00000000-0000-0000-0000-000000000921' where id = '00000000-0000-4000-8000-000000000402'$$,
  'MYA no debe atribuir su cotización a un perfil Sari'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}',
  true
);
insert into public.agents (id, name, type)
values ('00000000-0000-4000-8000-000000000701', 'Agente Sari P3', 'Agente');
insert into public.agent_quotes (id, quotation_id, agent_id, carrier)
values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000701',
  'Sari Carrier'
);
select * from public.select_agent_quote_and_replace_pricing(
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000801',
  '[{"item_type":"Flete","description":"Ocean Freight","quantity":1,"cost_amount":10,"sale_amount":20,"currency":"USD","tax_amount":0,"total_amount":20}]'::jsonb,
  'Validación Fase 3'
);
select * from public.save_current_pricing_as_option_v2(
  '00000000-0000-4000-8000-000000000401',
  'Opción Sari P3',
  true,
  null,
  'Notas comerciales Sari'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001')
    from public.quotation_options
    where quotation_id = '00000000-0000-4000-8000-000000000401'
  ) and (
    select count(*) = 1
      and bool_and(tenant_id = '00000000-0000-4000-8000-000000000001')
    from public.quotation_option_items
  ),
  'La selección atómica y el snapshot comercial deben conservar el tenant Sari'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000924","role":"authenticated"}',
  true
);
insert into public.agents (id, name, type)
values ('00000000-0000-4000-8000-000000000702', 'Agente MYA P3', 'Agente');
insert into public.agent_quotes (id, quotation_id, agent_id, carrier)
values (
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000702',
  'MYA Carrier'
);

reset role;
insert into public.quotation_options (
  id, quotation_id, agent_quote_id, option_code, label, created_by
)
values (
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000802',
  'Z',
  'Opción MYA P3',
  '00000000-0000-0000-0000-000000000924'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000923","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(carrier = 'Sari Carrier') from public.agent_quotes),
  'Pricing Sari no debe leer tarifas MYA'
);
select pg_temp.expect_denied(
  $$insert into public.agent_quotes (quotation_id, agent_id, carrier) values ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000702', 'Cruce')$$,
  'Una tarifa no debe combinar cotización Sari con agente MYA'
);
select pg_temp.expect_denied(
  $$select * from public.select_agent_quote_and_replace_pricing('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000802', '[{"item_type":"Flete","description":"Cruce","quantity":1,"cost_amount":10,"sale_amount":20,"tax_amount":0,"total_amount":20}]'::jsonb, 'Prueba cross tenant')$$,
  'Una RPC security definer no debe modificar pricing MYA desde Sari'
);
select pg_temp.expect_denied(
  $$select public.replace_client_rates('00000000-0000-4000-8000-000000000302', 'SPS', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$,
  'La RPC de tarifas de cliente debe rechazar otro tenant'
);
select pg_temp.expect_denied(
  $$select public.delete_draft_quotation_option('00000000-0000-4000-8000-000000000901')$$,
  'Pricing Sari no debe borrar una opción comercial MYA mediante SECURITY DEFINER'
);
select public.delete_draft_quotation_option(
  (select id from public.quotation_options where quotation_id = '00000000-0000-4000-8000-000000000401')
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.quotation_options where quotation_id = '00000000-0000-4000-8000-000000000401'),
  'Pricing Sari debe conservar el borrado atómico de su propia opción'
);

reset role;
select set_config('request.jwt.claims', '{}'::text, true);
update public.profiles
set cliente_id = case id
    when '00000000-0000-0000-0000-000000000925' then '00000000-0000-4000-8000-000000000301'::uuid
    when '00000000-0000-0000-0000-000000000926' then '00000000-0000-4000-8000-000000000302'::uuid
  end
where id in (
  '00000000-0000-0000-0000-000000000925',
  '00000000-0000-0000-0000-000000000926'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000925","role":"authenticated"}',
  true
);
insert into public.client_addresses (cliente_id, nombre_completo, address_line)
values (
  '00000000-0000-4000-8000-000000000301',
  'Cliente Sari P3',
  'Dirección Sari'
);
select pg_temp.expect_denied(
  $$insert into public.client_addresses (cliente_id, nombre_completo, address_line) values ('00000000-0000-4000-8000-000000000302', 'Cruce', 'Dirección MYA')$$,
  'Un Cliente del portal no debe crear direcciones para otra empresa'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000927","role":"authenticated"}',
  true
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.clientes)
    and (select count(*) = 0 from public.quotations)
    and (select count(*) = 0 from public.agent_quotes),
  'El administrador exclusivo de plataforma no debe asumir datos comerciales'
);
select pg_temp.expect_denied(
  $$insert into public.clientes (nombre) values ('Sin tenant')$$,
  'Un perfil sin tenant no debe crear datos comerciales'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.expect_denied(
  $$select * from public.clientes$$,
  'anon no debe leer clientes'
);
select pg_temp.expect_denied(
  $$select * from public.quotations$$,
  'anon no debe leer cotizaciones'
);
select pg_temp.expect_denied(
  $$insert into public.clientes (nombre) values ('Anon')$$,
  'anon no debe crear clientes'
);

reset role;
rollback;

\echo 'phase3_commercial_tenant_isolation.sql: OK'

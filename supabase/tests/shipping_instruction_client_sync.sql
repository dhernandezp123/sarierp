\set ON_ERROR_STOP on
-- Fictional fixtures only; execute against an isolated database.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'ASSERTION FAILED: %', message; end if; end $$;
create function pg_temp.expect_error(command text, code text) returns void language plpgsql as $$
declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual = code then return; end if;
    raise exception 'Expected %, got %: %', code, actual, sqlerrm;
  end;
  raise exception 'Expected error %', code;
end $$;

insert into public.tenants(id, slug, name) values
 ('af370000-0000-4000-8000-000000000001', 'si-client-fixture', 'SI client fixture'),
 ('af370000-0000-4000-8000-000000000002', 'si-client-other', 'Other tenant');
insert into auth.users(id, aud, role, email, raw_user_meta_data) values
 ('af371000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'si-client-ops@test.local', '{}'),
 ('af371000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'si-client-finance@test.local', '{}'),
 ('af371000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'si-client-other@test.local', '{}'),
 ('af371000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'si-client-old-portal@test.local', '{}'),
 ('af371000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'si-client-new-portal@test.local', '{}');
update public.profiles set
 rol = case right(id::text, 1) when '2' then 'Contabilidad'::public.user_role
   when '4' then 'Cliente'::public.user_role when '5' then 'Cliente'::public.user_role
   else 'Operaciones'::public.user_role end,
 status = 'Aprobado', is_active = true,
 tenant_id = case when right(id::text, 1) = '3' then 'af370000-0000-4000-8000-000000000002'::uuid
   else 'af370000-0000-4000-8000-000000000001'::uuid end
 where id::text like 'af371000-%';
insert into public.clientes(id, nombre, tenant_id) values
 ('af372000-0000-4000-8000-000000000001', 'Previous customer', 'af370000-0000-4000-8000-000000000001'),
 ('af372000-0000-4000-8000-000000000002', 'Current customer', 'af370000-0000-4000-8000-000000000001');
update public.profiles set cliente_id = case right(id::text, 1)
 when '4' then 'af372000-0000-4000-8000-000000000001'::uuid
 else 'af372000-0000-4000-8000-000000000002'::uuid end
 where id in ('af371000-0000-4000-8000-000000000004', 'af371000-0000-4000-8000-000000000005');
insert into public.quotations(id, cliente_id, created_by, status, quote_type, tenant_id) values
 ('af373000-0000-4000-8000-000000000001', 'af372000-0000-4000-8000-000000000002',
  'af371000-0000-4000-8000-000000000001', 'Ganada', 'FCL', 'af370000-0000-4000-8000-000000000001');
insert into public.quotations(id, cliente_id, created_by, status, quote_type, tenant_id) values
 ('af373000-0000-4000-8000-000000000002', 'af372000-0000-4000-8000-000000000002',
  'af371000-0000-4000-8000-000000000001', 'Ganada', 'FCL', 'af370000-0000-4000-8000-000000000001');
insert into public.agent_quotes(id, quotation_id, agente_nombre, carrier, valid_until, is_selected, tenant_id) values
 ('af374000-0000-4000-8000-000000000001', 'af373000-0000-4000-8000-000000000001',
  'Selected agent', 'COSCO', current_date + 30, true, 'af370000-0000-4000-8000-000000000001');
insert into public.agent_quotes(id, quotation_id, agente_nombre, carrier, valid_until, is_selected, tenant_id) values
 ('af374000-0000-4000-8000-000000000002', 'af373000-0000-4000-8000-000000000002',
  'Selected agent', 'COSCO', current_date + 30, true, 'af370000-0000-4000-8000-000000000001');
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.shipping_instructions(id, routing_number, quotation_id, client_id, created_by, tenant_id, consignee) values
 ('af375000-0000-4000-8000-000000000001', 'RT-CLIENT-FIXTURE', 'af373000-0000-4000-8000-000000000001',
  'af372000-0000-4000-8000-000000000001', 'af371000-0000-4000-8000-000000000001',
  'af370000-0000-4000-8000-000000000001', 'Explicit BL party');
insert into public.shipping_instructions(id, routing_number, quotation_id, client_id, created_by, tenant_id) values
 ('af375000-0000-4000-8000-000000000002', 'RT-EMPTY-CLIENT-FIXTURE', 'af373000-0000-4000-8000-000000000002',
  'af372000-0000-4000-8000-000000000001', 'af371000-0000-4000-8000-000000000001',
  'af370000-0000-4000-8000-000000000001');
insert into public.bookings(id, shipping_instruction_id, shipment_status, booking_number, carrier, tenant_id) values
 ('af376000-0000-4000-8000-000000000001', 'af375000-0000-4000-8000-000000000001',
  'Booking Confirmado', 'CONFIRMED', 'Existing carrier', 'af370000-0000-4000-8000-000000000001');
create temp table confirmed_booking as select to_jsonb(b) body from public.bookings b
 where id = 'af376000-0000-4000-8000-000000000001';
grant select on confirmed_booking to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.expect_error($c$select public.sync_shipping_instruction_from_selected_agent_quote_v2('af375000-0000-4000-8000-000000000001')$c$, '42501');
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.expect_error($c$select public.sync_shipping_instruction_from_selected_agent_quote_v2('af375000-0000-4000-8000-000000000001')$c$, '42501');
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000001","role":"authenticated"}', true);
create temp table sync_result as select * from public.sync_shipping_instruction_from_selected_agent_quote_v2(
 'af375000-0000-4000-8000-000000000001', 'Customer changed');
select pg_temp.assert_true((select client_id = 'af372000-0000-4000-8000-000000000002' and carrier = 'COSCO'
 and consignee = 'Explicit BL party' from public.shipping_instructions where id = 'af375000-0000-4000-8000-000000000001'),
 'SI customer and carrier update; explicit document parties remain intact');
select pg_temp.assert_true((select client_id = 'af372000-0000-4000-8000-000000000002' from public.shipments
 where shipping_instruction_id = 'af375000-0000-4000-8000-000000000001'), 'Canonical shipment customer updates');
select pg_temp.assert_true((select skipped_count = 1 and updated_bookings = 0 from sync_result), 'Confirmed booking is skipped');
select pg_temp.assert_true((select to_jsonb(b) = s.body from public.bookings b cross join confirmed_booking s
 where b.id = 'af376000-0000-4000-8000-000000000001'), 'Confirmed booking remains unchanged');
select pg_temp.assert_true((select count(*) = 1 from public.activity_logs where entity_id = 'af375000-0000-4000-8000-000000000001'
 and action = 'shipping_instruction_client_synced' and metadata->>'previous_si_client_id' = 'af372000-0000-4000-8000-000000000001'
 and metadata->>'client_id' = 'af372000-0000-4000-8000-000000000002'), 'Customer change is audited');
select * from public.sync_shipping_instruction_from_selected_agent_quote_v2('af375000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*) = 1 from public.activity_logs where entity_id = 'af375000-0000-4000-8000-000000000001'
 and action = 'shipping_instruction_client_synced'), 'Unchanged customer does not duplicate audit');
create temp table empty_sync_result as select * from public.sync_shipping_instruction_from_selected_agent_quote_v2(
 'af375000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select updated_bookings = 0 and skipped_count = 0 from empty_sync_result)
 and (select si.client_id = q.cliente_id and s.client_id = q.cliente_id
 from public.shipping_instructions si join public.shipments s on s.shipping_instruction_id = si.id
 join public.quotations q on q.id = si.quotation_id
 where si.id = 'af375000-0000-4000-8000-000000000002'), 'Customer sync also works without bookings, as in RT0039');

-- Ownership in the canonical portal must move with the persisted shipment.
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select pg_temp.assert_true(not exists (select 1 from public.get_client_shipments_v2(true)
 where id = 'af375000-0000-4000-8000-000000000001'), 'Previous customer loses shipment visibility');
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select pg_temp.assert_true(exists (select 1 from public.get_client_shipments_v2(true)
 where id = 'af375000-0000-4000-8000-000000000001'), 'Current customer gains shipment visibility');
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.shipping_instructions set client_id = 'af372000-0000-4000-8000-000000000001'
 where id = 'af375000-0000-4000-8000-000000000001';
update public.shipments set client_id = 'af372000-0000-4000-8000-000000000001', closed_at = now()
 where id = 'af375000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error($c$select public.sync_shipping_instruction_from_selected_agent_quote_v2('af375000-0000-4000-8000-000000000001')$c$, '23514');
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.shipments set closed_at = null where id = 'af375000-0000-4000-8000-000000000001';
create function pg_temp.fail_customer_audit() returns trigger language plpgsql as $$ begin
 if new.action = 'shipping_instruction_client_synced' then raise exception 'Audit failure' using errcode = '23514'; end if;
 return new; end $$;
create trigger test_customer_audit before insert on public.activity_logs for each row execute function pg_temp.fail_customer_audit();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"af371000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.expect_error($c$select public.sync_shipping_instruction_from_selected_agent_quote_v2('af375000-0000-4000-8000-000000000001')$c$, '23514');
select pg_temp.assert_true((select client_id = 'af372000-0000-4000-8000-000000000001' from public.shipping_instructions
 where id = 'af375000-0000-4000-8000-000000000001') and
 (select client_id = 'af372000-0000-4000-8000-000000000001' from public.shipments
 where id = 'af375000-0000-4000-8000-000000000001'), 'Audit failure rolls back both customer links');
select pg_temp.assert_true(not has_function_privilege('authenticated',
 'public.sync_shipping_instruction_from_selected_agent_quote_v2_v4b(uuid,text)', 'execute'), 'Internal wrapper remains private');
reset role;
rollback;
\echo 'shipping_instruction_client_sync.sql: OK'

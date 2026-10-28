\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'ASSERTION FAILED: %', message; end if; end $$;
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'Expected %, got %', expected, sqlstate;
  end;
  raise exception 'Expected error %', expected;
end $$;

select pg_temp.assert_true(not has_table_privilege('anon','public.leads','INSERT'), 'No direct anonymous lead insert');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.leads','INSERT'), 'No bypass via an authenticated browser');
select pg_temp.assert_true(has_table_privilege('authenticated','public.leads','SELECT'), 'Sales read access preserved');
select pg_temp.assert_true(not has_function_privilege('anon','public.submit_demo_lead(jsonb,text)','EXECUTE'), 'Anon cannot call the service RPC');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.submit_demo_lead(jsonb,text)','EXECUTE'), 'Authenticated cannot call the service RPC');
select pg_temp.assert_true(has_function_privilege('service_role','public.submit_demo_lead(jsonb,text)','EXECUTE'), 'Server can call the receiver');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.demo_request_limits'::regclass), 'Rate table has RLS');
select pg_temp.assert_true(not has_table_privilege('anon','public.demo_request_limits','SELECT,INSERT,UPDATE,DELETE'), 'Anonymous cannot access request limits');

set local role anon;
select pg_temp.expect_error($c$insert into public.leads(nombre,empresa,email) values('test','test','test@example.invalid')$c$, '42501');
select pg_temp.expect_error($c$select public.submit_demo_lead('{}',repeat('a',64))$c$, '42501');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}', true);
select pg_temp.expect_error($c$select public.submit_demo_lead('{}',repeat('a',64))$c$, '42501');
select set_config('request.jwt.claims','{"role":"service_role"}', true);

create temp table before_count as select count(*) as n from public.leads;
do $$ begin
  for i in 1..5 loop
    perform pg_temp.assert_true(public.submit_demo_lead(
      '{"nombre":" Synthetic Person ","empresa":" Fixture ","email":"fixture@example.invalid"}', repeat('a',64)), 'Allowed request');
  end loop;
end $$;
select pg_temp.assert_true(not public.submit_demo_lead(
  '{"nombre":"Synthetic Person","empresa":"Fixture","email":"fixture@example.invalid"}', repeat('a',64)), 'Sixth request blocked');
select pg_temp.assert_true((select count(*)=n+5 from public.leads cross join before_count group by n), 'Blocked request inserts nothing');
select pg_temp.assert_true((select attempts=5 from public.demo_request_limits where request_key=repeat('a',64)), 'Counter cannot exceed limit');
select pg_temp.assert_true((select count(*)=5 from public.leads where email='fixture@example.invalid' and nombre='Synthetic Person' and empresa='Fixture' and telefono is null), 'Normalized values only');

update public.demo_request_limits set window_started_at=now()-interval '16 minutes' where request_key=repeat('a',64);
select pg_temp.assert_true(public.submit_demo_lead(
  '{"nombre":"Synthetic Person","empresa":"Fixture","email":"fixture@example.invalid"}', repeat('a',64)), 'Expired window resets');
select pg_temp.assert_true((select attempts=1 from public.demo_request_limits where request_key=repeat('a',64)), 'Reset counter is one');
select pg_temp.expect_error($c$select public.submit_demo_lead('{"nombre":"x","empresa":"y","email":"bad"}',repeat('b',64))$c$, '22023');
select pg_temp.expect_error($c$select public.submit_demo_lead('{"nombre":42,"empresa":"y","email":"a@b.invalid"}',repeat('b',64))$c$, '22023');
select pg_temp.assert_true(not exists(select 1 from public.demo_request_limits where request_key=repeat('b',64)), 'Invalid input consumes no quota');

-- A failed lead insert rolls its quota increment back in the same transaction.
create function pg_temp.fail_fixture_lead() returns trigger language plpgsql as $$
begin raise exception 'Synthetic failure' using errcode='P0001'; end $$;
create trigger fail_fixture_lead before insert on public.leads for each row execute function pg_temp.fail_fixture_lead();
select pg_temp.expect_error($c$select public.submit_demo_lead('{"nombre":"x","empresa":"y","email":"a@b.invalid"}',repeat('c',64))$c$, 'P0001');
select pg_temp.assert_true(not exists(select 1 from public.demo_request_limits where request_key=repeat('c',64)), 'Insert and quota roll back together');
rollback;

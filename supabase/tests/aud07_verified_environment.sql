\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_denied(command text) returns void language plpgsql as $$ begin
  begin execute command; exception when insufficient_privilege then return; end;
  raise exception 'Expected permission denial';
end $$;
select pg_temp.assert_true(public.is_demo_environment(), 'New installation defaults to Demo');
do $$ begin
  begin update public.platform_environment set environment='production';
    raise exception 'Expected verification constraint';
  exception when check_violation then null; end;
end $$;
set local role authenticated;
select pg_temp.expect_denied('select * from public.platform_environment');
select pg_temp.expect_denied($sql$update public.platform_environment set environment='production'$sql$);
select pg_temp.expect_denied('select public.is_demo_environment()');
reset role;
set local role service_role;
select pg_temp.assert_true((select environment='demo' from public.platform_environment), 'Server may read environment');
select pg_temp.expect_denied($sql$update public.platform_environment set environment='production'$sql$);
select pg_temp.expect_denied('delete from public.platform_environment');
reset role;
update public.platform_environment set environment='production',verified_at=now(),verified_by='AUD07 isolated test';
select pg_temp.assert_true(not public.is_demo_environment(), 'Verified owner configuration is production');
delete from public.platform_environment;
select pg_temp.assert_true(public.is_demo_environment(), 'Missing row fails closed');
rollback;
select 'PASS AUD07 verified environment: default Demo, owner verification, server read-only, RLS';

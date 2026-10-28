\set ON_ERROR_STOP on
\o /dev/null
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_error(command text, code text) returns void language plpgsql as $$ declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual = code then return; end if;
    raise exception 'Expected %, got %: %',code,actual,sqlerrm;
  end;
  raise exception 'Expected %: %',code,command;
end $$;
insert into public.tenants(id,slug,name) values ('ad080000-0000-4000-8000-000000000100','aud08-other','AUD08 other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('ad080000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','aud08-'||n||'@example.invalid','{}'
from generate_series(1,6)n;
update public.profiles set rol=case right(id::text,3) when '003' then 'Operaciones'::public.user_role when '006' then null else 'Admin'::public.user_role end,
  status=case right(id::text,3) when '004' then 'Pendiente' else 'Aprobado' end,
  is_active=true, is_platform_admin=right(id::text,3)='005',
  tenant_id=case right(id::text,3) when '002' then 'ad080000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ad080000-%';
insert into public.miami_packages(id,tracking_number,tenant_id)
values('ad081000-0000-4000-8000-000000000001','AUD08-MIAMI','00000000-0000-4000-8000-000000000001');
insert into public.client_email_deliveries(id,package_id,event_type,recipient_email,status,attempts,tenant_id,updated_at)
values('ad082000-0000-4000-8000-000000000001','ad081000-0000-4000-8000-000000000001','miami_package_assigned',
  'client@example.invalid','processing',1,'00000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z');
update public.support_settings set enabled=true where singleton is true;
insert into public.support_tickets(id,ticket_number,subject,category,created_by,tenant_id)
values('ad083000-0000-4000-8000-000000000001','AUD08-TEST','AUD08 test','Consulta','ad080000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into public.support_notification_outbox(id,ticket_id,event_type,recipient_email,idempotency_key,status,attempts,tenant_id,updated_at,
  request_body,provider_key,first_attempt_at,lease_token)
values('ad084000-0000-4000-8000-000000000001','ad083000-0000-4000-8000-000000000001','ticket_created',
  'support@example.invalid','aud08-test','uncertain',2,'00000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z',
  '{"subject":"AUD08"}','aud08-provider-key','2026-01-01T00:00:00Z','ad085000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.reconcile_email_delivery(text,uuid,uuid,timestamptz,uuid,text,text,text)','execute'), 'No browser reconciliation RPC');
select pg_temp.assert_true(not has_function_privilege('anon','public.reconcile_email_delivery(text,uuid,uuid,timestamptz,uuid,text,text,text)','execute'), 'No anon reconciliation RPC');
select pg_temp.assert_true(has_function_privilege('service_role','public.reconcile_email_delivery(text,uuid,uuid,timestamptz,uuid,text,text,text)','execute'), 'Service RPC executable');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad080000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.client_email_deliveries where id='ad082000-0000-4000-8000-000000000001'), 'Own tenant reads existing metadata');
select pg_temp.expect_error('select request_body from public.client_email_deliveries','42501');
select pg_temp.expect_error('select provider_key from public.support_notification_outbox','42501');
select pg_temp.expect_error('select * from public.email_delivery_reconciliations','42501');
select pg_temp.expect_error('update public.client_email_deliveries set status=''sent''','42501');
select set_config('request.jwt.claims','{"sub":"ad080000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.client_email_deliveries where id='ad082000-0000-4000-8000-000000000001'), 'Other tenant cannot read metadata');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare actor text; begin
  foreach actor in array array['002','003','004','005','006'] loop
    perform pg_temp.expect_error(format($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01',%L,'accepted','Provider logs verified for fixture','aud08-id')$cmd$, 'ad080000-0000-4000-8000-000000000'||actor),'42501');
  end loop;
end $$;
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01','ad080000-0000-4000-8000-000000000001','accepted','Provider logs verified for fixture',null)$cmd$,'22023');
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01','ad080000-0000-4000-8000-000000000001','not_accepted','Too short',null)$cmd$,'22023');
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','ad080000-0000-4000-8000-000000000100','2026-01-01','ad080000-0000-4000-8000-000000000002','accepted','Provider logs verified for fixture','aud08-id')$cmd$,'P0002');
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-02','ad080000-0000-4000-8000-000000000001','accepted','Provider logs verified for fixture','aud08-id')$cmd$,'PT409');
select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01',
  'ad080000-0000-4000-8000-000000000001','accepted','Provider logs verified for fixture','aud08-id');
select pg_temp.assert_true((select status='sent' and resend_message_id='aud08-id' and sent_at is not null and attempts=1 from public.client_email_deliveries where id='ad082000-0000-4000-8000-000000000001'), 'Accepted reconciliation confirmed with provider ID, no attempt increment');
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01','ad080000-0000-4000-8000-000000000001','not_accepted','Provider logs verified for fixture',null)$cmd$,'PT409');
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('support','ad084000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01','ad080000-0000-4000-8000-000000000001','not_accepted','Provider logs verified for fixture',null)$cmd$,'42501');
select public.reconcile_email_delivery('support','ad084000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01',
  'ad080000-0000-4000-8000-000000000005','not_accepted','Provider logs verified non-acceptance for fixture',null);
select pg_temp.assert_true((select status='failed' and retry_authorized and request_body is null and provider_key is null and first_attempt_at is null and lease_token is null and attempts=2 from public.support_notification_outbox where id='ad084000-0000-4000-8000-000000000001'), 'Verified non-acceptance authorizes a fresh attempt only');
select pg_temp.assert_true((select count(*)=2 from public.email_delivery_reconciliations where delivery_id in ('ad082000-0000-4000-8000-000000000001','ad084000-0000-4000-8000-000000000001')), 'Two append-only evidence rows');
select pg_temp.assert_true((select previous_state->>'provider_key'='aud08-provider-key' and not previous_state ? 'request_body' from public.email_delivery_reconciliations where delivery_id='ad084000-0000-4000-8000-000000000001'), 'Evidence preserves prior key without message content');
select pg_temp.expect_error('delete from public.email_delivery_reconciliations','42501');
select pg_temp.expect_error('update public.email_delivery_reconciliations set evidence=''rewritten''','42501');
update public.client_email_deliveries set status='processing',updated_at=clock_timestamp() where id='ad082000-0000-4000-8000-000000000001';
do $$ declare revision timestamptz; begin
  select updated_at into revision from public.client_email_deliveries where id='ad082000-0000-4000-8000-000000000001';
  perform pg_temp.expect_error(format($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',%L,'ad080000-0000-4000-8000-000000000001','accepted','Provider logs verified for fixture','aud08-id')$cmd$,revision),'PT409');
end $$;
reset role;
-- A persisted provider ID is incompatible with authorizing a fresh send.
update public.client_email_deliveries set status='uncertain',updated_at='2026-01-01',resend_message_id='known-provider-id'
where id='ad082000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01','ad080000-0000-4000-8000-000000000001','not_accepted','Provider logs verified for fixture',null)$cmd$,'22023');
reset role;
-- A failed evidence insertion must roll back the status mutation as well.
create function pg_temp.reject_evidence() returns trigger language plpgsql as $$ begin raise exception 'AUD08 evidence failure' using errcode='23514'; end $$;
create trigger aud08_reject_evidence before insert on public.email_delivery_reconciliations for each row execute function pg_temp.reject_evidence();
update public.client_email_deliveries set status='uncertain',updated_at='2026-01-01' where id='ad082000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_error($cmd$select public.reconcile_email_delivery('miami','ad082000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-01-01','ad080000-0000-4000-8000-000000000001','accepted','Provider logs verified for fixture','aud08-id')$cmd$,'23514');
select pg_temp.assert_true((select status='uncertain' from public.client_email_deliveries where id='ad082000-0000-4000-8000-000000000001'), 'Audit failure rolls back reconciliation');
rollback;
\o
\echo 'AUD08 SQL PASS: states, ACL/RLS, administrator evidence, stale revision, active lease, atomic reconciliation'

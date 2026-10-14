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
create function pg_temp.as_user(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub','ad060000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);
end $$;
create function pg_temp.notification_count(p_id uuid) returns bigint language sql security definer set search_path=public as $$
  select count(*) from public.client_notifications where entity_id=p_id and entity_type='miami_packages';
$$;
insert into public.tenants(id,slug,name) values ('ad060000-0000-4000-8000-000000000100','aud06-other','AUD06 other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('ad060000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','aud06-'||n||'@test.local','{}'
from generate_series(1,14)n;
update public.profiles set
  rol=case right(id::text,3) when '001' then 'Admin'::public.user_role when '004' then 'Ventas'::public.user_role
    when '005' then 'Finanzas'::public.user_role when '006' then 'Pricing'::public.user_role
    when '007' then 'Cliente'::public.user_role when '011' then 'Cliente'::public.user_role
    when '012' then 'Cliente'::public.user_role when '013' then 'Cliente'::public.user_role
    when '014' then 'Cliente'::public.user_role else 'Operaciones'::public.user_role end,
  status=case when right(id::text,3) in ('008','014') then 'Pendiente' else 'Aprobado' end,
  is_active=right(id::text,3) not in ('009','012'),
  tenant_id=case when right(id::text,3)='010' then 'ad060000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ad060000-%' and right(id::text,3)<>'100';
insert into public.clientes(id,nombre,tenant_id,deleted_at)
select ('ad061000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'AUD06 client '||n,
  case when n=4 then 'ad060000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end,
  case when n=3 then now() else null end from generate_series(1,5)n;
update public.profiles set cliente_id='ad061000-0000-4000-8000-000000000001' where id in ('ad060000-0000-4000-8000-000000000007','ad060000-0000-4000-8000-000000000012','ad060000-0000-4000-8000-000000000013','ad060000-0000-4000-8000-000000000014');
update public.profiles set cliente_id='ad061000-0000-4000-8000-000000000002' where id='ad060000-0000-4000-8000-000000000011';
insert into public.miami_manifests(id,manifest_number,carrier,status,tenant_id)
select ('ad063000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'AUD06-MANIFEST-'||n,'AUD06 carrier',
  case when n=2 then 'Cerrado' else 'Abierto' end,'00000000-0000-4000-8000-000000000001'
from generate_series(1,2)n;
insert into public.miami_packages(id,tracking_number,manifest_id,cargo_status,tenant_id)
select ('ad062000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'AUD06-PKG-'||n,
  case when n=3 then null when n=8 then 'ad063000-0000-4000-8000-000000000002'::uuid else 'ad063000-0000-4000-8000-000000000001'::uuid end,
  case when n=4 then 'En Tránsito' else 'Recibido en Miami' end,
  case when n=3 then 'ad060000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end
from generate_series(1,9)n;
insert into public.miami_pre_alerts(id,cliente_id,tracking_number,tenant_id)
values ('ad064000-0000-4000-8000-000000000001','ad061000-0000-4000-8000-000000000001','AUTO-AUD06','00000000-0000-4000-8000-000000000001'),
  ('ad064000-0000-4000-8000-000000000002','ad061000-0000-4000-8000-000000000004','AUTO-AUD06','ad060000-0000-4000-8000-000000000100'),
  ('ad064000-0000-4000-8000-000000000003','ad061000-0000-4000-8000-000000000001','SCAN-AUD06','00000000-0000-4000-8000-000000000001'),
  ('ad064000-0000-4000-8000-000000000004','ad061000-0000-4000-8000-000000000001','EXPLICIT-AUD06','00000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.expect_error($cmd$update public.miami_packages set cliente_id='ad061000-0000-4000-8000-000000000001',warehouse_number='SPS-INVALID',status='Asignado' where id='ad062000-0000-4000-8000-000000000001'$cmd$,'42501');
select pg_temp.expect_error($cmd$insert into public.miami_packages(tracking_number,status,cliente_id) values('RAW-AUD06','Asignado','ad061000-0000-4000-8000-000000000001')$cmd$,'42501');
select public.assign_miami_package('ad062000-0000-4000-8000-000000000001','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select status='Asignado' and warehouse_number is not null and assigned_at is not null and assigned_by=auth.uid() from public.miami_packages where id='ad062000-0000-4000-8000-000000000001'),'Complete assignment persisted');
select pg_temp.assert_true((select count(*)=1 from public.miami_package_events where package_id='ad062000-0000-4000-8000-000000000001' and event_type='assignment'),'Exactly one event');
select pg_temp.assert_true(pg_temp.notification_count('ad062000-0000-4000-8000-000000000001')=2,'AUD12: two approved active portal profiles each notified once');
select pg_temp.as_user(3);
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000001','ad061000-0000-4000-8000-000000000002','ad063000-0000-4000-8000-000000000001')$cmd$,'PT409');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000001','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001')$cmd$,'PT409');
select pg_temp.assert_true(pg_temp.notification_count('ad062000-0000-4000-8000-000000000001')=2,'Loser/retry creates no notification');
select pg_temp.expect_error($cmd$delete from public.miami_packages where id='ad062000-0000-4000-8000-000000000001'$cmd$,'42501');
select pg_temp.expect_error($cmd$delete from public.miami_package_events where package_id='ad062000-0000-4000-8000-000000000001'$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000002','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000002')$cmd$,'PT409');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000002','ad061000-0000-4000-8000-000000000003','ad063000-0000-4000-8000-000000000001')$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000002','ad061000-0000-4000-8000-000000000004','ad063000-0000-4000-8000-000000000001')$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000003','ad061000-0000-4000-8000-000000000001')$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000004','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001')$cmd$,'PT409');
-- Closing reception does not prevent assigning still-unassigned packages.
select public.assign_miami_package('ad062000-0000-4000-8000-000000000008','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000002');
select public.assign_miami_package('ad062000-0000-4000-8000-000000000009','ad061000-0000-4000-8000-000000000005','ad063000-0000-4000-8000-000000000001');
select pg_temp.assert_true(pg_temp.notification_count('ad062000-0000-4000-8000-000000000009')=0,'AUD12: assignment without portal profiles remains valid');
do $$ declare n integer; begin
  foreach n in array array[4,5,6,7,8,9,10] loop
    perform pg_temp.as_user(n);
    perform pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000002','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001')$cmd$,case when n=10 then 'PT409' else '42501' end);
    perform pg_temp.expect_error($cmd$select public.receive_miami_package('{"tracking_number":"DENIED-AUD06"}','ad061000-0000-4000-8000-000000000001')$cmd$,'42501');
  end loop;
end $$;
select pg_temp.as_user(2);
select pg_temp.expect_error($cmd$select public.assign_miami_package_internal('ad062000-0000-4000-8000-000000000002','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001','spoofed')$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.receive_miami_package('{"tracking_number":"INJECT-AUD06","warehouse_number":"FORGED"}')$cmd$,'22023');
do $$ declare pkg public.miami_packages%rowtype; pkg2 public.miami_packages%rowtype; scan_id uuid; begin
  pkg := public.receive_miami_package('{"tracking_number":" plain-aud06 ","weight_lbs":10,"length_in":12,"width_in":12,"height_in":12}');
  perform pg_temp.assert_true(pkg.status='Sin asignar' and pkg.tracking_number='PLAIN-AUD06' and pkg.ft3=1,'Plain receipt preserves measurements');
  pkg := public.receive_miami_package('{"tracking_number":"EXPLICIT-AUD06"}','ad061000-0000-4000-8000-000000000002');
  perform pg_temp.assert_true(pkg.status='Asignado' and pkg.cliente_id='ad061000-0000-4000-8000-000000000002','Explicit client wins over a different pre-alert');
  perform pg_temp.assert_true(pg_temp.notification_count(pkg.id)=1,'AUD12: a single eligible account gets one notification');
  perform pg_temp.assert_true((select status='Pendiente' from public.miami_pre_alerts where id='ad064000-0000-4000-8000-000000000004'),'Explicit receipt does not consume unrelated alert');
  pkg := public.receive_miami_package('{"tracking_number":"auto-aud06"}');
  perform pg_temp.assert_true(pkg.status='Asignado' and pkg.cliente_id='ad061000-0000-4000-8000-000000000001' and pkg.assigned_by=auth.uid(),'AFTER trigger returns persisted auto-assignment');
  perform pg_temp.assert_true((select matched_package_id=pkg.id and status='Recibido' from public.miami_pre_alerts where id='ad064000-0000-4000-8000-000000000001'),'Pre-alert consumed once');
  perform pg_temp.assert_true(pg_temp.notification_count(pkg.id)=2,'Auto-assignment notifies both approved active accounts');
  pkg2 := public.receive_miami_package('{"tracking_number":"auto-aud06"}');
  perform pg_temp.assert_true(pkg2.status='Sin asignar' and pkg2.cliente_id is null,'Consumed alert/other tenant never reused');
  select package_id into scan_id from public.scan_miami_manifest_package('ad063000-0000-4000-8000-000000000001','SCAN-AUD06');
  select mp.* into pkg from public.miami_packages mp where mp.id=scan_id;
  perform pg_temp.assert_true(pkg.status='Asignado' and pkg.manifest_id='ad063000-0000-4000-8000-000000000001','Manifest scan keeps auto-assignment');
end $$;
-- Portal RLS exposes only the profile's real notification/package.
select pg_temp.as_user(7);
select pg_temp.assert_true((select count(*)=1 from public.client_notifications where entity_id='ad062000-0000-4000-8000-000000000001'),'Client reads its notification');
select pg_temp.as_user(13);
select pg_temp.assert_true((select count(*)=1 from public.client_notifications where entity_id='ad062000-0000-4000-8000-000000000001'),'AUD12: second account reads only its own notification');
select pg_temp.as_user(11);
select pg_temp.assert_true((select count(*)=0 from public.client_notifications where entity_id='ad062000-0000-4000-8000-000000000001'),'Other client cannot read notification');
reset role;
-- Failure after generating WH/update must roll back package, sequence and traces.
create temporary table sequence_before as select next_value from public.document_sequences
where tenant_id='00000000-0000-4000-8000-000000000001' and sequence_key='MIAMI_WAREHOUSE';
create function pg_temp.fail_assignment_event() returns trigger language plpgsql as $$ begin
  if new.package_id='ad062000-0000-4000-8000-000000000005' then raise exception 'Simulated event failure' using errcode='23514'; end if;
  return new;
end $$;
create function pg_temp.fail_assignment_notification() returns trigger language plpgsql as $$ begin
  if new.entity_id='ad062000-0000-4000-8000-000000000006' then raise exception 'Simulated notification failure' using errcode='23514'; end if;
  return new;
end $$;
create trigger aud06_event_failure before insert on public.miami_package_events for each row execute function pg_temp.fail_assignment_event();
create trigger aud06_notification_failure before insert on public.client_notifications for each row execute function pg_temp.fail_assignment_notification();
set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000005','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001')$cmd$,'23514');
select pg_temp.expect_error($cmd$select public.assign_miami_package('ad062000-0000-4000-8000-000000000006','ad061000-0000-4000-8000-000000000001','ad063000-0000-4000-8000-000000000001')$cmd$,'23514');
select pg_temp.assert_true((select count(*)=2 from public.miami_packages where id in ('ad062000-0000-4000-8000-000000000005','ad062000-0000-4000-8000-000000000006') and status='Sin asignar' and cliente_id is null and warehouse_number is null),'Failures roll back both assignments');
reset role;
select pg_temp.assert_true((select next_value=(select next_value from sequence_before) from public.document_sequences where tenant_id='00000000-0000-4000-8000-000000000001' and sequence_key='MIAMI_WAREHOUSE'),'Failures roll back WH allocation');
select pg_temp.assert_true((select count(*)=0 from public.miami_package_events where package_id in ('ad062000-0000-4000-8000-000000000005','ad062000-0000-4000-8000-000000000006')),'Failures leave no assignment event');
select pg_temp.assert_true(pg_temp.notification_count('ad062000-0000-4000-8000-000000000006')=0,'Failure leaves no notification');
rollback;
\o
select 'PASS AUD06: assignment/receipt/pre-alert, role/tenant, portal RLS and rollback';

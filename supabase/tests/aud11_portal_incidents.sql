\set ON_ERROR_STOP on
\o /dev/null
begin;
create function pg_temp.id(prefix text,n integer) returns uuid language sql immutable as $$
  select (prefix||'-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_error(command text,code text) returns void language plpgsql as $$ declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=code then return; end if;
    raise exception 'Expected %, got %: %',code,actual,sqlerrm;
  end;
  raise exception 'Expected %: %',code,command;
end $$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('ad110000',n),'role','authenticated')::text,true);
end $$;
create function pg_temp.report(n integer,k integer,description text default 'AUD11 test report') returns jsonb language sql as $$
  select public.report_miami_incident(pg_temp.id('ad112000',n),'Otro',description,pg_temp.id('ad119000',k),auth.uid());
$$;
insert into public.tenants(id,slug,name) values(pg_temp.id('ad110000',100),'aud11-other','AUD11 other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select pg_temp.id('ad110000',n),'authenticated','authenticated','aud11-'||n||'@example.invalid','{}' from generate_series(1,14)n;
insert into public.clientes(id,nombre,tenant_id,deleted_at)
select pg_temp.id('ad111000',n),'AUD11 client '||n,
  case when n=3 then pg_temp.id('ad110000',100) else '00000000-0000-4000-8000-000000000001'::uuid end,
  case when n=4 then now() else null end from generate_series(1,4)n;
update public.profiles set rol=case right(id::text,3)
  when '005' then 'Admin'::public.user_role when '006' then 'Operaciones'::public.user_role
  when '007' then 'Ventas'::public.user_role when '013' then 'Finanzas'::public.user_role when '014' then null else 'Cliente'::public.user_role end,
  status=case when right(id::text,3)='008' then 'Pendiente' else 'Aprobado' end,
  is_active=right(id::text,3)<>'009',is_platform_admin=right(id::text,3)='011',
  tenant_id=case when right(id::text,3)='004' then pg_temp.id('ad110000',100) else '00000000-0000-4000-8000-000000000001'::uuid end,
  cliente_id=case right(id::text,3) when '003' then pg_temp.id('ad111000',2) when '004' then pg_temp.id('ad111000',3)
    when '010' then null when '012' then pg_temp.id('ad111000',4) else pg_temp.id('ad111000',1) end
where id::text like 'ad110000-%';
insert into public.miami_packages(id,tracking_number,tenant_id,cliente_id,status,cargo_status,warehouse_number,assigned_by,assigned_at)
select pg_temp.id('ad112000',n),'AUD11-PKG-'||n,
  case when n=3 then pg_temp.id('ad110000',100) else '00000000-0000-4000-8000-000000000001'::uuid end,
  case n when 2 then pg_temp.id('ad111000',2) when 3 then pg_temp.id('ad111000',3) when 7 then pg_temp.id('ad111000',4) else pg_temp.id('ad111000',1) end,
  case n when 4 then 'Entregado' when 6 then 'Sin asignar' else 'Asignado' end,
  case when n in (4,5) then 'Entregado' else 'Recibido en Miami' end,'AUD11-WH-'||n,
  case when n=3 then null else pg_temp.id('ad110000',6) end,now()
from generate_series(1,11)n;
insert into public.miami_incidencias(tenant_id,package_id,cliente_id,tipo,descripcion,status)
values('00000000-0000-4000-8000-000000000001',pg_temp.id('ad112000',11),pg_temp.id('ad111000',1),'Otro','AUD11 legacy active','Abierta');

select pg_temp.assert_true(has_function_privilege('authenticated','public.report_miami_incident(uuid,text,text,uuid,uuid)','execute'),'RPC available to authenticated');
select pg_temp.assert_true(not has_function_privilege('anon','public.report_miami_incident(uuid,text,text,uuid,uuid)','execute'),'RPC denied to anon');
select pg_temp.assert_true(not has_function_privilege('service_role','public.report_miami_incident(uuid,text,text,uuid,uuid)','execute'),'No external service caller');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.report_miami_incident_internal(uuid,text,text,uuid)','execute'),'Internal core not exposed');
set local role authenticated;
select pg_temp.as_user(1);
select pg_temp.report(1,1);
select pg_temp.assert_true((select status='Con incidencia' and cargo_status='Recibido en Miami' and warehouse_number='AUD11-WH-1'
  and assigned_by=pg_temp.id('ad110000',6) from public.miami_packages where id=pg_temp.id('ad112000',1)),'Only incident flag changes');
select pg_temp.assert_true((select count(*)=1 and bool_and(created_by=auth.uid() and request_key=pg_temp.id('ad119000',1))
  from public.miami_incidencias where package_id=pg_temp.id('ad112000',1)),'Case derives client/tenant/actor and key');
select pg_temp.assert_true((pg_temp.report(1,1)->>'already_applied')::boolean,'Same request returns original case');
select pg_temp.expect_error('select pg_temp.report(1,1,''Changed description'')','22023');
select pg_temp.expect_error('select pg_temp.report(8,1)','22023');
select pg_temp.expect_error('select pg_temp.report(1,2)','PT409');
select pg_temp.expect_error('select pg_temp.report(2,2)','42501');
select pg_temp.expect_error('select pg_temp.report(3,2)','42501');
select pg_temp.expect_error('select pg_temp.report(4,2)','PT409');
select pg_temp.expect_error('select pg_temp.report(5,2)','PT409');
select pg_temp.expect_error('select pg_temp.report(6,2)','PT409');
select pg_temp.expect_error('select pg_temp.report(11,2)','PT409');
select pg_temp.expect_error('select pg_temp.report(8,2,''   '')','22023');
select pg_temp.expect_error('select pg_temp.report(8,2,E''\t\n'')','22023');
select pg_temp.expect_error('select pg_temp.report(8,2,repeat(''x'',5001))','22023');
select pg_temp.expect_error($cmd$select public.report_miami_incident(pg_temp.id('ad112000',8),'Invalid','AUD11',pg_temp.id('ad119000',2),auth.uid())$cmd$,'22023');
select pg_temp.expect_error($cmd$select public.report_miami_incident(pg_temp.id('ad112000',8),'Otro','AUD11',pg_temp.id('ad119000',2),pg_temp.id('ad110000',2))$cmd$,'42501');
select pg_temp.expect_error($cmd$insert into public.miami_incidencias(package_id,cliente_id,tipo,descripcion) values(pg_temp.id('ad112000',8),pg_temp.id('ad111000',1),'Otro','Direct')$cmd$,'42501');
select pg_temp.as_user(2);
select pg_temp.expect_error('select pg_temp.report(1,3)','PT409');
select pg_temp.assert_true((select count(*)=1 from public.miami_incidencias where package_id=pg_temp.id('ad112000',1)),'Second portal account reads same client case');
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*)=0 from public.miami_incidencias where package_id=pg_temp.id('ad112000',1)),'Other client cannot read case');
select pg_temp.expect_error('select pg_temp.report(1,3)','42501');
select pg_temp.as_user(4);
select pg_temp.assert_true((select count(*)=0 from public.miami_incidencias where package_id=pg_temp.id('ad112000',1)),'Other tenant cannot read case');
select pg_temp.expect_error('select pg_temp.report(1,3)','42501');
do $$ declare n integer; begin
  foreach n in array array[5,6,7,8,9,10,11,12,13,14] loop
    perform pg_temp.as_user(n);
    perform pg_temp.expect_error('select pg_temp.report(8,3)','42501');
  end loop;
end $$;
select pg_temp.as_user(5);
select pg_temp.expect_error($cmd$insert into public.miami_incidencias(package_id,cliente_id,tipo) values(pg_temp.id('ad112000',8),pg_temp.id('ad111000',1),'Otro')$cmd$,'42501');
select pg_temp.expect_error($cmd$update public.miami_incidencias set descripcion='Rewrite' where package_id=pg_temp.id('ad112000',1)$cmd$,'42501');
select pg_temp.expect_error($cmd$update public.miami_incidencias set request_key=null where package_id=pg_temp.id('ad112000',1)$cmd$,'42501');
select pg_temp.expect_error($cmd$delete from public.miami_incidencias where package_id=pg_temp.id('ad112000',1)$cmd$,'42501');
select pg_temp.expect_error($cmd$delete from public.miami_package_events where package_id=pg_temp.id('ad112000',1) and event_type='incident_reported'$cmd$,'42501');
select pg_temp.assert_true((select count(*)=1 from public.miami_package_events where package_id=pg_temp.id('ad112000',1) and event_type='incident_reported'),'One event after all replays');
select pg_temp.assert_true((select count(*)=1 from public.activity_logs where action='report_miami_incident' and metadata->>'package_id'=pg_temp.id('ad112000',1)::text),'One activity trace after replays');
update public.miami_incidencias set status='Cerrada' where package_id=pg_temp.id('ad112000',1);
update public.miami_packages set status='Entregado',cargo_status='Entregado' where id=pg_temp.id('ad112000',1);
select pg_temp.as_user(1);
select pg_temp.assert_true(pg_temp.report(1,1)->>'status'='Cerrada','Replay can recover a closed case after delivery, without reopening');
select pg_temp.assert_true((select status='Entregado' from public.miami_packages where id=pg_temp.id('ad112000',1)),'Replay does not overwrite delivery');
select pg_temp.expect_error('select pg_temp.report(1,4)','PT409');
reset role;
-- All failures below happen after a case insert; the complete transaction rolls back.
create function pg_temp.block_incident_status() returns trigger language plpgsql as $$ begin
  if new.id=pg_temp.id('ad112000',8) and new.status='Con incidencia' then raise exception 'AUD11 injected status failure' using errcode='23514'; end if;
  return new;
end $$;
create function pg_temp.block_incident_event() returns trigger language plpgsql as $$ begin
  if new.package_id=pg_temp.id('ad112000',9) and new.event_type='incident_reported' then raise exception 'AUD11 injected event failure' using errcode='23514'; end if;
  return new;
end $$;
create function pg_temp.block_incident_activity() returns trigger language plpgsql as $$ begin
  if new.action='report_miami_incident' and new.metadata->>'package_id'=pg_temp.id('ad112000',10)::text then raise exception 'AUD11 injected activity failure' using errcode='23514'; end if;
  return new;
end $$;
create trigger aud11_fail_status before update on public.miami_packages for each row execute function pg_temp.block_incident_status();
create trigger aud11_fail_event before insert on public.miami_package_events for each row execute function pg_temp.block_incident_event();
create trigger aud11_fail_activity before insert on public.activity_logs for each row execute function pg_temp.block_incident_activity();
set local role authenticated;
select pg_temp.as_user(1);
select pg_temp.expect_error('select pg_temp.report(8,8)','23514');
select pg_temp.expect_error('select pg_temp.report(9,9)','23514');
select pg_temp.expect_error('select pg_temp.report(10,10)','23514');
reset role;
select pg_temp.assert_true((select count(*)=0 from public.miami_incidencias where package_id in (pg_temp.id('ad112000',8),pg_temp.id('ad112000',9),pg_temp.id('ad112000',10))),'Failures leave no case');
select pg_temp.assert_true((select bool_and(status='Asignado') from public.miami_packages where id in (pg_temp.id('ad112000',8),pg_temp.id('ad112000',9),pg_temp.id('ad112000',10))),'Failures restore package flag');
select pg_temp.assert_true((select count(*)=0 from public.miami_package_events where event_type='incident_reported' and package_id in (pg_temp.id('ad112000',8),pg_temp.id('ad112000',9),pg_temp.id('ad112000',10))),'Failures leave no event');
rollback;
\o
\echo 'AUD11 SQL PASS: atomic report, replay, delivered policy, roles/tenant/ownership/RLS, trace guards and rollback'

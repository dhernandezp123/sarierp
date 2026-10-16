\set ON_ERROR_STOP on
-- Fictional fixtures in the isolated local stack only. All writes roll back.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',('aa160000-0000-4000-8000-'||lpad(n::text,12,'0')),'role','authenticated')::text,true);
end $$;
insert into public.tenants(id,slug,name) values ('aa160000-0000-4000-8000-000000000100','visits-test-other','Visits other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('aa160000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','visits-'||n||'@test.local','{}'
from generate_series(1,7)n;
update public.profiles set
  rol=case right(id::text,3) when '001' then 'Admin'::public.user_role when '007' then 'Pricing'::public.user_role else 'Ventas'::public.user_role end,
  status=case when right(id::text,3)='006' then 'Pendiente' else 'Aprobado' end,
  is_active=right(id::text,3)<>'005',
  tenant_id=case when right(id::text,3)='004' then 'aa160000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'aa160000-%' and right(id::text,3)<>'100';

set local role authenticated;
select pg_temp.as_user(2);
insert into public.sales_activities(id,tipo_actividad,tipo_cliente,nombre_prospecto,fecha_actividad,created_by)
values ('aa161000-0000-4000-8000-000000000001','Visita','Nuevo','Visits fixture','2026-10-20','aa160000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select estado_ejecucion='Pendiente' from public.sales_activities where id='aa161000-0000-4000-8000-000000000001'),'New visits default pending');
update public.sales_activities set estado_ejecucion='Realizada' where id='aa161000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select estado_ejecucion='Realizada' from public.sales_activities where id='aa161000-0000-4000-8000-000000000001'),'Owner may record execution');
update public.sales_activities set estado_ejecucion=null where id='aa161000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select estado_ejecucion is null from public.sales_activities where id='aa161000-0000-4000-8000-000000000001'),'Historical/unclassified is distinct from pending');
do $$ begin
  begin update public.sales_activities set estado_ejecucion='Inventado' where id='aa161000-0000-4000-8000-000000000001';
    raise exception 'Invalid status accepted';
  exception when check_violation then null; end;
end $$;
select pg_temp.as_user(3);
select pg_temp.assert_true((select count(*)=1 from public.sales_activities where id='aa161000-0000-4000-8000-000000000001'),'Team may report visits');
with changed as (update public.sales_activities set estado_ejecucion='Cancelada' where id='aa161000-0000-4000-8000-000000000001' returning id)
select pg_temp.assert_true((select count(*)=0 from changed),'Other salesperson cannot edit visit');
select pg_temp.as_user(1);
update public.sales_activities set estado_ejecucion='Cancelada' where id='aa161000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select estado_ejecucion='Cancelada' from public.sales_activities where id='aa161000-0000-4000-8000-000000000001'),'Admin may cancel');
do $$ declare n integer; begin
  foreach n in array array[4,5,6,7] loop
    perform pg_temp.as_user(n);
    perform pg_temp.assert_true((select count(*)=0 from public.sales_activities where id='aa161000-0000-4000-8000-000000000001'),'Other tenant/inactive/unapproved/Pricing cannot read team visits');
    begin
      insert into public.sales_activities(tipo_actividad,tipo_cliente,nombre_prospecto,fecha_actividad,created_by)
      values('Visita','Nuevo','Denied','2026-10-20','aa160000-0000-4000-8000-000000000002');
      raise exception 'Forbidden insert accepted';
    exception when insufficient_privilege or foreign_key_violation then null; end;
  end loop;
end $$;
reset role;
rollback;
select 'PASS visits execution: default, legacy, constraint, owner/Admin, team, tenant, inactive/unapproved and role RLS';

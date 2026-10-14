\set ON_ERROR_STOP on
-- Before AUD-06, only in the isolated database; fictional rows, rollback.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('ad060000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','aud06-before-'||n||'@test.local','{}'
from generate_series(1,2)n;
update public.profiles set rol='Operaciones',status='Aprobado',is_active=true,
  tenant_id='00000000-0000-4000-8000-000000000001' where id::text like 'ad060000-%';
insert into public.clientes(id,nombre,tenant_id)
select ('ad061000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'AUD06 client '||n,'00000000-0000-4000-8000-000000000001'
from generate_series(1,2)n;
insert into public.miami_packages(id,tracking_number,tenant_id)
values ('ad062000-0000-4000-8000-000000000001','AUD06-BEFORE','00000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad060000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.miami_packages set cliente_id='ad061000-0000-4000-8000-000000000001',
  warehouse_number=public.next_warehouse_number(),status='Asignado',assigned_at=now(),assigned_by=auth.uid()
where id='ad062000-0000-4000-8000-000000000001';
-- The second operator still believes the package is unassigned.
select set_config('request.jwt.claims','{"sub":"ad060000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.miami_packages set cliente_id='ad061000-0000-4000-8000-000000000002',
  warehouse_number=public.next_warehouse_number(),status='Asignado',assigned_at=now(),assigned_by=auth.uid()
where id='ad062000-0000-4000-8000-000000000001';
do $$ begin
  if not exists (select 1 from public.miami_packages where id='ad062000-0000-4000-8000-000000000001'
    and cliente_id='ad061000-0000-4000-8000-000000000002') then raise exception 'Overwrite was not reproduced'; end if;
  if exists (select 1 from public.miami_package_events where package_id='ad062000-0000-4000-8000-000000000001') then
    raise exception 'Missing assignment audit was not reproduced'; end if;
end $$;
select 'BEFORE: second stale operator overwrote client/WH; no assignment event';
rollback;

\set ON_ERROR_STOP on
-- Run BEFORE AUD-05, only on the isolated local database. No persistent rows.
begin;
insert into auth.users(id,aud,role,email,raw_user_meta_data)
values ('ad050000-0000-4000-8000-000000000001','authenticated','authenticated','aud05-before@test.local','{}');
update public.profiles set rol='Ventas',status='Aprobado',is_active=true,
  tenant_id='00000000-0000-4000-8000-000000000001' where id='ad050000-0000-4000-8000-000000000001';
insert into public.clientes(id,nombre,tenant_id)
values ('ad051000-0000-4000-8000-000000000001','AUD05 before','00000000-0000-4000-8000-000000000001');
insert into public.quotations(id,cliente_id,created_by,status,service_product,tenant_id)
values ('ad052000-0000-4000-8000-000000000001','ad051000-0000-4000-8000-000000000001',
  'ad050000-0000-4000-8000-000000000001','Pendiente de Fijar Precios','miami_air','00000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ad050000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.quotations set status='Pricing Aprobado' where id='ad052000-0000-4000-8000-000000000001';
do $$ begin
  if not exists (select 1 from public.quotations where id='ad052000-0000-4000-8000-000000000001' and status='Pricing Aprobado') then
    raise exception 'The old role bypass was not reproduced';
  end if;
  if exists (select 1 from public.quotation_status_history where quotation_id='ad052000-0000-4000-8000-000000000001' and old_status is not null) then
    raise exception 'The old missing-history failure was not reproduced';
  end if;
end $$;
select 'BEFORE: Ventas approves pricing directly; status changed without transition history';
rollback;

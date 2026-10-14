\set ON_ERROR_STOP on
-- Fictional fixtures, isolated local stack only. Every change rolls back.
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_error(command text, code text)
returns void language plpgsql as $$ declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual = code then return; end if;
    raise exception 'Expected %, got %: %',code,actual,sqlerrm;
  end;
  raise exception 'Expected failure %: %',code,command;
end $$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',('ad050000-0000-4000-8000-'||lpad(n::text,12,'0')),'role','authenticated')::text,true);
end $$;
insert into public.tenants(id,slug,name) values ('ad050000-0000-4000-8000-000000000100','aud05-other','AUD05 other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('ad050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','aud05-'||n||'@test.local','{}'
from generate_series(1,9)n;
update public.profiles set
  rol=case right(id::text,3) when '001' then 'Admin'::public.user_role when '002' then 'Pricing'::public.user_role
    when '003' then 'Ventas'::public.user_role when '004' then 'Operaciones'::public.user_role
    when '005' then 'Contabilidad'::public.user_role when '006' then 'Finanzas'::public.user_role else 'Admin'::public.user_role end,
  status=case when right(id::text,3)='008' then 'Pendiente' else 'Aprobado' end,
  is_active=right(id::text,3)<>'009',
  tenant_id=case when right(id::text,3)='007' then 'ad050000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'ad050000-%' and right(id::text,3)<>'100';
insert into public.clientes(id,nombre,tenant_id)
values ('ad051000-0000-4000-8000-000000000001','AUD05 client','00000000-0000-4000-8000-000000000001');
insert into public.quotations(id,cliente_id,created_by,status,service_product,quote_type,commodity,tipo_transporte,tenant_id)
select ('ad052000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ad051000-0000-4000-8000-000000000001',
  'ad050000-0000-4000-8000-000000000003',case n when 3 then 'Ganada' when 4 then 'Enviada al Cliente'
  when 5 then 'Pricing Aprobado' when 6 then 'Pendiente de Fijar Precios' when 7 then 'Solicitud' else 'Borrador' end,
  'miami_air','Courier','AUD05 cargo','Aéreo','00000000-0000-4000-8000-000000000001'
from generate_series(1,8)n;
insert into public.pricing_items(quotation_id,item_type,description,cost_amount,sale_amount,quantity,tenant_id)
select id,'Flete','AUD05 pricing',100,150,2,tenant_id from public.quotations where id::text like 'ad052000-%';
set local role authenticated;
select pg_temp.as_user(3);
select pg_temp.expect_error($cmd$insert into public.quotations(cliente_id,created_by,status,service_product) values('ad051000-0000-4000-8000-000000000001','ad050000-0000-4000-8000-000000000003','Ganada','miami_air')$cmd$,'42501');
select pg_temp.expect_error($cmd$insert into public.quotations(cliente_id,created_by,status,service_product) values('ad051000-0000-4000-8000-000000000001','ad050000-0000-4000-8000-000000000003','Pricing Aprobado','other_origin_fcl')$cmd$,'42501');
select pg_temp.expect_error($cmd$update public.quotations set status='Ganada' where id='ad052000-0000-4000-8000-000000000001'$cmd$,'42501');
select pg_temp.expect_error($cmd$update public.quotations set pricing_approved=true where id='ad052000-0000-4000-8000-000000000001'$cmd$,'42501');
select pg_temp.expect_error($cmd$update public.quotations set status_revision=1 where id='ad052000-0000-4000-8000-000000000001'$cmd$,'42501');
select pg_temp.expect_error($cmd$insert into public.quotation_status_history(quotation_id,old_status,new_status,changed_by) values('ad052000-0000-4000-8000-000000000001','Borrador','Ganada','ad050000-0000-4000-8000-000000000003')$cmd$,'42501');
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Borrador',0,'Pendiente de Fijar Precios');
select pg_temp.assert_true((select count(*)=1 from public.quotation_status_history where quotation_id='ad052000-0000-4000-8000-000000000001' and status_revision=1),'Exactly one atomic history entry');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Borrador',0,'Pendiente de Fijar Precios')$cmd$,'PT409');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',1,'Pricing Aprobado')$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',1,'Ganada')$cmd$,'23514');
select pg_temp.as_user(2);
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000006','Pendiente de Fijar Precios',0,'Ganada')$cmd$,'23514');
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',1,'Pricing Aprobado');
select pg_temp.assert_true((select total_cost=200 and total_sale=300 and profit_amount=100 and pricing_approved_by='ad050000-0000-4000-8000-000000000002' from public.quotations where id='ad052000-0000-4000-8000-000000000001'),'Pricing uses persisted totals/actor');
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Pricing Aprobado',2,'Pricing Aprobado');
select pg_temp.assert_true((select status_revision=3 from public.quotations where id='ad052000-0000-4000-8000-000000000001'),'Reapproval increments revision');
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Pricing Aprobado',3,'Enviada al Cliente');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Enviada al Cliente',4,'Ganada')$cmd$,'42501');
select pg_temp.as_user(3);
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Enviada al Cliente',4,'Ganada');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Ganada',5,'Pendiente de Fijar Precios')$cmd$,'23514');
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Ganada',5,'Pendiente de Fijar Precios','Cambio de naviera');
select pg_temp.assert_true((select not pricing_approved and pricing_approved_at is null and repricing_return_status='Ganada' from public.quotations where id='ad052000-0000-4000-8000-000000000001'),'Reopen resets approval');
select pg_temp.assert_true((select reason='Cambio de naviera' from public.quotation_change_logs where quotation_id='ad052000-0000-4000-8000-000000000001' and status_revision=6),'Reason is in same revision');
select pg_temp.as_user(2);
select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',6,'Ganada');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000001','Ganada',5,'Pendiente de Fijar Precios','Pantalla antigua')$cmd$,'PT409');
select pg_temp.as_user(3);
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000004','Enviada al Cliente',0,'Perdida')$cmd$,'23514');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000004','Enviada al Cliente',0,'Perdida',null,'Otra',' ')$cmd$,'23514');
select public.transition_quotation('ad052000-0000-4000-8000-000000000004','Enviada al Cliente',0,'Perdida',null,'Otra','Cliente canceló');
select pg_temp.assert_true((select loss_reason='Otra' and loss_reason_detail='Cliente canceló' from public.quotations where id='ad052000-0000-4000-8000-000000000004'),'Loss reason is persisted');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000004','Perdida',1,'Pendiente de Fijar Precios','Reactivar')$cmd$,'23514');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000007','Solicitud',0,'Pendiente de Fijar Precios')$cmd$,'23514');
-- Closed quote transitions cannot be invoked by read-only/inactive/unapproved/cross-tenant roles.
do $$ declare n integer; begin
  foreach n in array array[4,5,6,7,8,9] loop
    perform pg_temp.as_user(n);
    perform pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000003','Ganada',0,'Pendiente de Fijar Precios','Forbidden')$cmd$,'42501');
  end loop;
end $$;
select pg_temp.as_user(3);
select pg_temp.expect_error($cmd$select public.send_quotation_with_options_aud05_internal('ad052000-0000-4000-8000-000000000005')$cmd$,'42501');
select pg_temp.expect_error($cmd$select * from public.finalize_quotation_option_selection_aud05_internal('ad052000-0000-4000-8000-000000000005',false)$cmd$,'42501');
-- Editor keeps child RLS and guards the revision before changing any fields.
select pg_temp.expect_error($cmd$select public.save_quotation_edit('ad052000-0000-4000-8000-000000000005','Pricing Aprobado','{"commodity":"Must rollback"}',false,'[]',false,'[]',false,'[]',true,99,'Cambio')$cmd$,'PT409');
select public.save_quotation_edit('ad052000-0000-4000-8000-000000000005','Pricing Aprobado','{"commodity":"Updated"}',false,'[]',false,'[]',false,'[]',true,0,'Carga actualizada');
select pg_temp.assert_true((select commodity='Updated' and status='Pendiente de Fijar Precios' and status_revision=1 from public.quotations where id='ad052000-0000-4000-8000-000000000005'),'Editor/status/trace commit together');
select pg_temp.as_user(1);
-- A sync failure happens after state/audit writes, which must all roll back.
select public.transition_quotation('ad052000-0000-4000-8000-000000000008','Borrador',0,'Pendiente de Fijar Precios');
select public.transition_quotation('ad052000-0000-4000-8000-000000000008','Pendiente de Fijar Precios',1,'Pricing Aprobado');
select public.transition_quotation('ad052000-0000-4000-8000-000000000008','Pricing Aprobado',2,'Enviada al Cliente');
select public.transition_quotation('ad052000-0000-4000-8000-000000000008','Enviada al Cliente',3,'Ganada');
insert into public.shipping_instructions(id,quotation_id,client_id,created_by,tenant_id)
values ('ad053000-0000-4000-8000-000000000008','ad052000-0000-4000-8000-000000000008',
  'ad051000-0000-4000-8000-000000000001','ad050000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
select public.transition_quotation('ad052000-0000-4000-8000-000000000008','Ganada',4,'Pendiente de Fijar Precios','Repricing sync');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000008','Pendiente de Fijar Precios',5,'Ganada',null,null,null,true)$cmd$,'P0001');
select pg_temp.assert_true((select status='Pendiente de Fijar Precios' and status_revision=5 and not pricing_approved from public.quotations where id='ad052000-0000-4000-8000-000000000008'),'Sync failure rolls back approval/state');
select pg_temp.assert_true((select count(*)=0 from public.quotation_status_history where quotation_id='ad052000-0000-4000-8000-000000000008' and status_revision=6),'Sync failure rolls back history');
-- Force an audit failure after the UPDATE; the entire transition must roll back.
reset role;
create function pg_temp.fail_audit() returns trigger language plpgsql as $$ begin
  if new.quotation_id in ('ad052000-0000-4000-8000-000000000002', 'ad052000-0000-4000-8000-000000000003') then raise exception 'Simulated history failure' using errcode='23514'; end if;
  return new;
end $$;
create trigger aud05_test_failure before insert on public.quotation_status_history for each row execute function pg_temp.fail_audit();
set local role authenticated;
select pg_temp.as_user(3);
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000002','Borrador',0,'Pendiente de Fijar Precios')$cmd$,'23514');
select pg_temp.assert_true((select status='Borrador' and status_revision=0 from public.quotations where id='ad052000-0000-4000-8000-000000000002'),'History error rolls back state/revision');
select pg_temp.expect_error($cmd$select public.transition_quotation('ad052000-0000-4000-8000-000000000003','Ganada',0,'Pendiente de Fijar Precios','Must roll back reason')$cmd$,'23514');
select pg_temp.assert_true((select count(*)=0 from public.quotation_change_logs where quotation_id='ad052000-0000-4000-8000-000000000003'),'History error rolls back repricing reason');
select pg_temp.assert_true((select status='Ganada' and status_revision=0 and repricing_return_status is null from public.quotations where id='ad052000-0000-4000-8000-000000000003'),'Reopen is rolled back entirely');
select 'PASS AUD05: role/tenant, stale/ABA, reapproval, loss, repricing, editor and rollback';
-- Owner-reviewed legacy recovery requires explicit final history, never inferred ownership/state.
reset role;
select set_config('request.jwt.claims','{}',true);
insert into public.quotation_status_history(id,quotation_id,tenant_id,old_status,new_status,created_at)
values('ad054000-0000-4000-8000-000000000001','ad052000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001',
  'Ganada','Pendiente de Fijar Precios',clock_timestamp());
set local role authenticated;
select pg_temp.expect_error($cmd$select public.recover_proven_legacy_repricing('ad052000-0000-4000-8000-000000000006','ad054000-0000-4000-8000-000000000001',0,'Reviewed historical evidence for isolated test')$cmd$,'42501');
reset role;
select pg_temp.expect_error($cmd$select public.recover_proven_legacy_repricing('ad052000-0000-4000-8000-000000000006','ad054000-0000-4000-8000-000000000001',1,'Reviewed historical evidence for isolated test')$cmd$,'PT409');
insert into public.quotation_status_history(id,quotation_id,tenant_id,old_status,new_status,created_at)
select 'ad054000-0000-4000-8000-000000000002',quotation_id,tenant_id,old_status,new_status,created_at from public.quotation_status_history where id='ad054000-0000-4000-8000-000000000001';
select pg_temp.expect_error($cmd$select public.recover_proven_legacy_repricing('ad052000-0000-4000-8000-000000000006','ad054000-0000-4000-8000-000000000001',0,'Reviewed historical evidence for isolated test')$cmd$,'23514');
delete from public.quotation_status_history where id='ad054000-0000-4000-8000-000000000002';
select public.recover_proven_legacy_repricing('ad052000-0000-4000-8000-000000000006','ad054000-0000-4000-8000-000000000001',0,'Reviewed historical evidence for isolated test');
select pg_temp.assert_true((select status='Pendiente de Fijar Precios' and not pricing_approved and status_revision=0 and repricing_return_status='Ganada' from public.quotations where id='ad052000-0000-4000-8000-000000000006'),'Recovery changes only return metadata');
select pg_temp.assert_true((select count(*)=1 from public.activity_logs where entity_id='ad052000-0000-4000-8000-000000000006' and action='recover_proven_legacy_repricing'),'Recovery audited once');
select pg_temp.expect_error($cmd$select public.recover_proven_legacy_repricing('ad052000-0000-4000-8000-000000000006','ad054000-0000-4000-8000-000000000001',0,'Reviewed historical evidence for isolated test')$cmd$,'PT409');
update public.quotations set repricing_return_status=null where id='ad052000-0000-4000-8000-000000000006';
create function pg_temp.fail_recovery_audit() returns trigger language plpgsql as $$ begin
  if new.action='recover_proven_legacy_repricing' then raise exception 'Simulated recovery audit failure' using errcode='23514'; end if;
  return new;
end $$;
create trigger aud05_recovery_failure before insert on public.activity_logs for each row execute function pg_temp.fail_recovery_audit();
select pg_temp.expect_error($cmd$select public.recover_proven_legacy_repricing('ad052000-0000-4000-8000-000000000006','ad054000-0000-4000-8000-000000000001',0,'Reviewed historical evidence for isolated test')$cmd$,'23514');
select pg_temp.assert_true((select repricing_return_status is null from public.quotations where id='ad052000-0000-4000-8000-000000000006'),'Recovery rolls back when audit fails');
select 'PASS AUD05 legacy recovery: explicit history, owner only, conflict, ambiguity and atomic audit';
rollback;

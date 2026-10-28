\set ON_ERROR_STOP on
-- Fictional, rollback-only fixtures for the isolated database / CI.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.expect_error(command text,code text) returns void language plpgsql as $$
declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=code then return; end if;
    raise exception 'Expected %, got %: %',code,actual,sqlerrm;
  end;
  raise exception 'Expected error %',code;
end $$;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('af730000-0000-4000-8000-000000000001','authenticated','authenticated','won-pricing@test.local','{}'),
 ('af730000-0000-4000-8000-000000000002','authenticated','authenticated','won-sales@test.local','{}');
update public.profiles set rol=case when right(id::text,1)='1' then 'Pricing'::public.user_role else 'Ventas'::public.user_role end,
 status='Aprobado',is_active=true,tenant_id='00000000-0000-4000-8000-000000000001'
 where id::text like 'af730000-%';
select set_config('request.jwt.claims','{"sub":"af730000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.clientes(id,nombre,tenant_id) values
 ('af731000-0000-4000-8000-000000000001','Won adjustment fixture','00000000-0000-4000-8000-000000000001');
insert into public.quotations(id,cliente_id,created_by,status,quote_type,tenant_id,total_cost,total_sale,pricing_approved)
 values ('af732000-0000-4000-8000-000000000001','af731000-0000-4000-8000-000000000001',
 'af730000-0000-4000-8000-000000000002','Ganada','FCL','00000000-0000-4000-8000-000000000001',100,150,true);
insert into public.agent_quotes(id,quotation_id,agente_nombre,carrier,valid_until,is_selected,tenant_id) values
 ('af733000-0000-4000-8000-000000000001','af732000-0000-4000-8000-000000000001','Fixture agent','Fixture carrier',current_date-20,true,'00000000-0000-4000-8000-000000000001');
insert into public.pricing_items(id,quotation_id,item_type,description,cost_amount,sale_amount,quantity,currency,tenant_id) values
 ('af734000-0000-4000-8000-000000000001','af732000-0000-4000-8000-000000000001','Flete','Confirmed freight',100,150,1,'USD','00000000-0000-4000-8000-000000000001');
insert into public.quotation_options(id,quotation_id,agent_quote_id,option_code,label,status,created_by,accepted_by,accepted_at,cost_total,sale_subtotal,grand_total,currency,tenant_id)
 values ('af735000-0000-4000-8000-000000000001','af732000-0000-4000-8000-000000000001','af733000-0000-4000-8000-000000000001',
 'A','Original sale','Aceptada','af730000-0000-4000-8000-000000000001','af730000-0000-4000-8000-000000000002',now()-interval '20 days',100,150,150,'USD','00000000-0000-4000-8000-000000000001');
insert into public.quotation_option_items(quotation_option_id,source_pricing_item_id,item_type,description,cost_amount,sale_amount,quantity,currency,sort_order,tenant_id)
 values ('af735000-0000-4000-8000-000000000001','af734000-0000-4000-8000-000000000001','Flete','Confirmed freight',100,150,1,'USD',0,'00000000-0000-4000-8000-000000000001');
insert into public.shipping_instructions(id,quotation_id,client_id,created_by,quotation_option_id,agent_name,tenant_id) values
 ('af736000-0000-4000-8000-000000000001','af732000-0000-4000-8000-000000000001','af731000-0000-4000-8000-000000000001',
 'af730000-0000-4000-8000-000000000002','af735000-0000-4000-8000-000000000001','Confirmed operation','00000000-0000-4000-8000-000000000001');
create temp table original_option as select to_jsonb(o)-'status'-'is_recommended'-'updated_at' body from public.quotation_options o where id='af735000-0000-4000-8000-000000000001';
create temp table original_lines as select to_jsonb(i) body from public.quotation_option_items i where quotation_option_id='af735000-0000-4000-8000-000000000001';
create temp table original_si as select to_jsonb(s) body from public.shipping_instructions s where id='af736000-0000-4000-8000-000000000001';
grant select on original_option,original_lines,original_si to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"af730000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Ganada',0,'Pendiente de Fijar Precios','Agregar seguro confirmado');
select set_config('request.jwt.claims','{"sub":"af730000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.pricing_items(id,quotation_id,item_type,description,cost_amount,sale_amount,quantity,currency,tenant_id,created_by) values
 ('af734000-0000-4000-8000-000000000002','af732000-0000-4000-8000-000000000001','Seguro','Seguro de Carga',75,100,1,'USD','00000000-0000-4000-8000-000000000001','af730000-0000-4000-8000-000000000001');
select * from public.save_current_pricing_as_option_v2('af732000-0000-4000-8000-000000000001','Con seguro',false,null,'Confirmado');
-- Reproduce the current intermediate status too; reapproval must finish the won adjustment.
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',1,'Pricing Aprobado');
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',2,'Ganada');
select pg_temp.assert_true((select status='Ganada' and status_revision=3 and total_cost=175 and total_sale=250 and repricing_return_status is null from public.quotations where id='af732000-0000-4000-8000-000000000001'),'Approval returns to won with insurance');
select pg_temp.assert_true((select count(*)=2 and count(*) filter(where id in ('af734000-0000-4000-8000-000000000001','af734000-0000-4000-8000-000000000002'))=2 from public.pricing_items where quotation_id='af732000-0000-4000-8000-000000000001'),'Live pricing IDs are preserved');
select pg_temp.assert_true((select count(*)=1 and bool_and(option_code='B' and supersedes_option_id='af735000-0000-4000-8000-000000000001' and accepted_at is null and accepted_by is null) from public.quotation_options where quotation_id='af732000-0000-4000-8000-000000000001' and status='Aceptada'),'The draft becomes the successor without inventing a new client response');
select pg_temp.assert_true((select (to_jsonb(o)-'status'-'is_recommended'-'updated_at')=b.body from public.quotation_options o cross join original_option b where o.id='af735000-0000-4000-8000-000000000001'),'Original accepted sale remains intact');
select pg_temp.assert_true((select to_jsonb(i)=b.body from public.quotation_option_items i cross join original_lines b where i.quotation_option_id='af735000-0000-4000-8000-000000000001'),'Original commercial lines remain intact');
select pg_temp.assert_true((select to_jsonb(s)=b.body from public.shipping_instructions s cross join original_si b where s.id='af736000-0000-4000-8000-000000000001'),'No operational change when synchronization is not requested');
select pg_temp.assert_true((select count(*)=1 from public.activity_logs where entity_id='af732000-0000-4000-8000-000000000001' and action='won_quotation_adjustment_approved' and metadata->>'client_confirmation_requested'='false'),'Adjustment has explicit audit');
select pg_temp.expect_error($c$select public.snapshot_won_quotation_adjustment('af732000-0000-4000-8000-000000000001')$c$,'42501');
select pg_temp.expect_error($c$select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',2,'Ganada')$c$,'PT409');
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Ganada',3,'Pendiente de Fijar Precios','Ajustar seguro');
update public.pricing_items set cost_amount=90,sale_amount=125 where id='af734000-0000-4000-8000-000000000002';
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',4,'Ganada');
select pg_temp.assert_true((select status='Ganada' and status_revision=5 and total_sale=275 from public.quotations where id='af732000-0000-4000-8000-000000000001'),'Direct reapproval works without a manually saved draft');
select pg_temp.assert_true((select count(*)=3 from public.quotation_options where quotation_id='af732000-0000-4000-8000-000000000001'),'Second adjustment creates a new historical version');
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Ganada',5,'Pendiente de Fijar Precios','Permission check');
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pendiente de Fijar Precios',6,'Pricing Aprobado');
select set_config('request.jwt.claims','{"sub":"af730000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.expect_error($c$select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',7,'Ganada')$c$,'42501');
select pg_temp.expect_error($c$update public.quotations set status='Ganada' where id='af732000-0000-4000-8000-000000000001'$c$,'42501');
reset role;
insert into public.agent_quotes(id,quotation_id,agente_nombre,carrier,valid_until,is_selected,tenant_id) values
 ('af733000-0000-4000-8000-000000000002','af732000-0000-4000-8000-000000000001','Different agent','Different carrier',current_date+20,false,'00000000-0000-4000-8000-000000000001');
update public.agent_quotes set is_selected=false where id='af733000-0000-4000-8000-000000000001';
update public.agent_quotes set is_selected=true where id='af733000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"af730000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.expect_error($c$select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',7,'Ganada')$c$,'23514');
reset role;
update public.agent_quotes set is_selected=false where id='af733000-0000-4000-8000-000000000002';
update public.agent_quotes set is_selected=true where id='af733000-0000-4000-8000-000000000001';
update public.quotation_options set status='No seleccionada' where quotation_id='af732000-0000-4000-8000-000000000001' and status='Aceptada';
set local role authenticated;
select pg_temp.expect_error($c$select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',7,'Ganada')$c$,'23514');
reset role;
update public.quotation_options set status='Aceptada' where quotation_id='af732000-0000-4000-8000-000000000001' and option_code='C';
select pg_temp.assert_true(not has_function_privilege('anon','public.snapshot_won_quotation_adjustment(uuid)','execute')
 and not has_function_privilege('authenticated','public.snapshot_won_quotation_adjustment(uuid)','execute')
 and not has_function_privilege('service_role','public.snapshot_won_quotation_adjustment(uuid)','execute'),'Snapshot core is not a public bypass');
create function pg_temp.fail_adjustment_audit() returns trigger language plpgsql as $$ begin
 if new.action='won_quotation_adjustment_approved' then raise exception 'Simulated audit failure' using errcode='23514'; end if; return new; end $$;
create trigger test_adjustment_audit before insert on public.activity_logs for each row execute function pg_temp.fail_adjustment_audit();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"af730000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.expect_error($c$select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',7,'Ganada')$c$,'23514');
select pg_temp.assert_true((select status='Pricing Aprobado' and status_revision=7 from public.quotations where id='af732000-0000-4000-8000-000000000001'),'Audit failure rolls back state/revision');
select pg_temp.assert_true((select count(*)=3 and count(*) filter(where status='Aceptada')=1 from public.quotation_options where quotation_id='af732000-0000-4000-8000-000000000001'),'Audit failure rolls back snapshots/selection');
reset role;
drop trigger test_adjustment_audit on public.activity_logs;
set local role authenticated;
select public.transition_quotation('af732000-0000-4000-8000-000000000001','Pricing Aprobado',7,'Ganada',null,null,null,true);
select pg_temp.assert_true((select status='Ganada' and status_revision=8 from public.quotations where id='af732000-0000-4000-8000-000000000001'),'Intermediate approval can close with explicit operational synchronization');
select pg_temp.assert_true((select agent_name='Fixture agent' from public.shipping_instructions where id='af736000-0000-4000-8000-000000000001'),'Explicit synchronization uses the existing canonical operation RPC');
reset role;
rollback;
\echo 'won_quotation_pricing_adjustments.sql: OK'

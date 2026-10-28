\set ON_ERROR_STOP on
-- Fictional fixtures only; run against the isolated local stack. Roll back everything.
begin;
create function pg_temp.check_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_error(command text, code text)
returns void language plpgsql as $$ declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual=code then return; end if;
    raise exception 'Expected %, got %: %',code,actual,sqlerrm;
  end;
  raise exception 'Expected failure: %',command;
end $$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',('cc010000-0000-4000-8000-'||lpad(n::text,12,'0')),'role','authenticated')::text,true);
end $$;
insert into public.tenants(id,slug,name) values ('cc010000-0000-4000-8000-000000000100','customs-other','Customs other');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('cc010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','customs-'||n||'@test.local','{}'
from generate_series(1,6)n;
update public.profiles set rol=case right(id::text,3)
  when '001' then 'Ventas'::public.user_role when '002' then 'Operaciones'::public.user_role
  when '003' then 'Finanzas'::public.user_role else 'Admin'::public.user_role end,
  status='Aprobado', is_active=right(id::text,3)<>'006',
  tenant_id=case when right(id::text,3)='005' then 'cc010000-0000-4000-8000-000000000100'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end
where id::text like 'cc010000-%' and right(id::text,3)<>'100';
insert into public.clientes(id,nombre,tenant_id,vendedor_asignado)
values ('cc011000-0000-4000-8000-000000000001','Customs client','00000000-0000-4000-8000-000000000001','cc010000-0000-4000-8000-000000000001');
create function pg_temp.quote_data(n integer, delivery boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('id',('cc012000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    'cliente_id','cc011000-0000-4000-8000-000000000001','service_product','customs_only',
    'quote_type','Aduanas','tipo_transporte','Aduanas','status','Pricing Aprobado','commodity','Repuestos',
    'puerto_destino','Puerto Cortés','trade_direction','import','valid_until',current_date+15,
    'delivery_address',case when delivery then 'San Pedro Sula' else '' end)
$$;
create function pg_temp.items(delivery boolean default false) returns jsonb language sql as $$
  select '[{"rate_code":"customs_service","description":"Servicio de Aduanas","item_type":"destination_charge","quantity":1,"cost_amount":0,"sale_amount":200,"currency":"USD","taxable":true,"tax_rate":15,"tax_amount":30,"total_amount":230,"supplier":"Sari Express"}]'::jsonb ||
    case when delivery then '[{"rate_code":"customs_delivery","description":"Entrega final","item_type":"destination_charge","quantity":1,"cost_amount":50,"sale_amount":100,"currency":"USD","taxable":false,"tax_rate":0,"tax_amount":0,"total_amount":100}]'::jsonb else '[]'::jsonb end
$$;
set local role authenticated;
select pg_temp.as_user(1);
select * from public.create_quotation_with_child_lines(pg_temp.quote_data(1),'[]','[]',pg_temp.items());
select * from public.create_quotation_with_child_lines(pg_temp.quote_data(2,true),'[]','[]',pg_temp.items(true));
select * from public.create_quotation_with_child_lines(pg_temp.quote_data(4),'[]','[]',pg_temp.items());
select pg_temp.check_true((select status='Pricing Aprobado' and pricing_approved and total_sale=200 and total_cost=0
  from public.quotations where id='cc012000-0000-4000-8000-000000000001'),'Own service is immediately ready with persisted totals');
select pg_temp.expect_error($cmd$select * from public.create_quotation_with_child_lines(pg_temp.quote_data(3)||'{"puerto_destino":""}','[]','[]',pg_temp.items())$cmd$,'23514');
select pg_temp.expect_error($cmd$select * from public.create_quotation_with_child_lines(pg_temp.quote_data(3)||'{"service_product":"other_origin_fcl"}','[]','[]',pg_temp.items())$cmd$,'42501');
select pg_temp.expect_error($cmd$select public.validate_customs_quotation(pg_temp.quote_data(5),jsonb_set(pg_temp.items(),'{0,cost_amount}','210'),false)$cmd$,'23514');
select public.validate_customs_quotation(pg_temp.quote_data(5)||'{"pricing_notes":"Justificación interna ficticia"}',jsonb_set(pg_temp.items(),'{0,cost_amount}','210'),false);
select * from public.create_quotation_with_child_lines(pg_temp.quote_data(3)||'{"status":"Borrador"}','[]','[]',pg_temp.items());
select public.save_quotation_edit('cc012000-0000-4000-8000-000000000003','Borrador','{}',false,'[]',false,'[]',true,pg_temp.items(),true,
  (select status_revision from public.quotations where id='cc012000-0000-4000-8000-000000000003'));
select pg_temp.check_true((select status='Pricing Aprobado' from public.quotations where id='cc012000-0000-4000-8000-000000000003'),'Draft approves without pricing queue');
do $$ declare q record; begin
  for q in select * from public.quotations where id in ('cc012000-0000-4000-8000-000000000001','cc012000-0000-4000-8000-000000000002','cc012000-0000-4000-8000-000000000004') loop
    perform public.transition_quotation(q.id,q.status,q.status_revision,'Enviada al Cliente');
    perform public.transition_quotation(q.id,'Enviada al Cliente',q.status_revision+1,'Ganada');
    perform public.create_shipment_from_quotation(q.id,'default');
  end loop;
end $$;
-- Repricing can return an already won service and synchronize an open file without an agent.
select public.transition_quotation(id,status,status_revision,'Pendiente de Fijar Precios','Cambio de alcance') from public.quotations where id='cc012000-0000-4000-8000-000000000004';
select public.save_quotation_edit('cc012000-0000-4000-8000-000000000004','Pendiente de Fijar Precios','{}',false,'[]',false,'[]',true,
  jsonb_set(pg_temp.items(),'{0,sale_amount}','250'),false,(select status_revision from public.quotations where id='cc012000-0000-4000-8000-000000000004'));
select public.transition_quotation(id,status,status_revision,'Ganada','Ajuste autorizado',null,null,true) from public.quotations where id='cc012000-0000-4000-8000-000000000004';
select pg_temp.check_true((select status='Ganada' and total_sale=250 from public.quotations where id='cc012000-0000-4000-8000-000000000004'),'Won service adjustment returns to won without agent sync');
select pg_temp.check_true((select count(*)=0 from public.agent_quotes where quotation_id::text like 'cc012000-%'),'No fabricated agents');
select pg_temp.check_true((select count(*)=0 from public.quotation_containers where quotation_id::text like 'cc012000-%'),'No fabricated containers');
select pg_temp.expect_error($cmd$insert into public.quotation_containers(quotation_id,container_type_name,quantity) values('cc012000-0000-4000-8000-000000000001','40HC',1)$cmd$,'23514');
select pg_temp.expect_error($cmd$select public.advance_customs_service((select id from public.shipping_instructions where quotation_id='cc012000-0000-4000-8000-000000000001'),null,'Liberado','Invalid role')$cmd$,'42501');
select pg_temp.as_user(2);
select set_config('test.customs_si',(select id::text from public.shipping_instructions where quotation_id='cc012000-0000-4000-8000-000000000001'),true);
select pg_temp.expect_error($cmd$update public.shipping_instructions set operational_status='Liberado' where quotation_id='cc012000-0000-4000-8000-000000000001'$cmd$,'42501');
do $$ declare si record; begin
  for si in select * from public.shipping_instructions where quotation_id::text like 'cc012000-%' loop
    perform public.advance_customs_service(si.id,si.updated_at,'En gestión aduanera','Expediente revisado');
    perform pg_temp.expect_error(format('select public.advance_customs_service(%L,%L,''Liberado'',''Stale'')',si.id,si.updated_at),'PT409');
    perform public.advance_customs_service(si.id,(select updated_at from public.shipping_instructions where id=si.id),'Liberado','Referencia de liberación ficticia');
  end loop;
end $$;
select pg_temp.expect_error($cmd$select public.advance_customs_service((select id from public.shipping_instructions where quotation_id='cc012000-0000-4000-8000-000000000002'),(select updated_at from public.shipping_instructions where quotation_id='cc012000-0000-4000-8000-000000000002'),'Finalizado','Cannot skip delivery')$cmd$,'23514');
select public.advance_customs_service(id,updated_at,'Entregado','Comprobante de entrega ficticio') from public.shipping_instructions where quotation_id='cc012000-0000-4000-8000-000000000002';
select public.advance_customs_service(id,updated_at,'Finalizado','Cierre revisado') from public.shipping_instructions where quotation_id in ('cc012000-0000-4000-8000-000000000001','cc012000-0000-4000-8000-000000000002','cc012000-0000-4000-8000-000000000004');
select pg_temp.check_true((select bool_and(closed_at is not null and operational_status='Finalizado' and requires_hbl=false) from public.shipments where quotation_id::text like 'cc012000-%'),'Canonical closure without BL/booking');
select pg_temp.as_user(3);
-- Finance explicitly confirms the company's zero external cost. Delivery still needs reconciliation.
select public.validate_quotation_financial_costs('cc012000-0000-4000-8000-000000000001');
select pg_temp.expect_error($cmd$select public.validate_quotation_financial_costs('cc012000-0000-4000-8000-000000000002')$cmd$,'P0001');
reset role;
select pg_temp.check_true((select financial_validation_status='Validado' from public.quotations where id='cc012000-0000-4000-8000-000000000001'),'Own service can proceed to billing without fake supplier invoice');
-- NULL legacy product/rate codes must never inherit the customs-only exception.
insert into public.quotations(id,cliente_id,created_by,status,commodity,tenant_id)
values('cc012000-0000-4000-8000-000000000006','cc011000-0000-4000-8000-000000000001','cc010000-0000-4000-8000-000000000001','Ganada','Legacy test','00000000-0000-4000-8000-000000000001');
insert into public.pricing_items(quotation_id,item_type,description,cost_amount,sale_amount,quantity,currency,tenant_id)
values('cc012000-0000-4000-8000-000000000006','Otro','Legacy cost zero',0,200,1,'USD','00000000-0000-4000-8000-000000000001');
insert into public.shipping_instructions(id,quotation_id,client_id,created_by,tenant_id,operational_status,shipment_status)
values('cc013000-0000-4000-8000-000000000006','cc012000-0000-4000-8000-000000000006','cc011000-0000-4000-8000-000000000001','cc010000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Finalizado','Finalizado');
update public.shipments set operational_status='Finalizado',closed_at=clock_timestamp() where quotation_id='cc012000-0000-4000-8000-000000000006';
set local role authenticated;
select pg_temp.as_user(3);
select pg_temp.expect_error($cmd$select public.validate_quotation_financial_costs('cc012000-0000-4000-8000-000000000006')$cmd$,'P0001');
select pg_temp.as_user(5);
select pg_temp.expect_error($cmd$select public.advance_customs_service(current_setting('test.customs_si')::uuid,null,'Liberado','Otro tenant')$cmd$,'42501');
select pg_temp.check_true((select count(*)=0 from public.quotations where id::text like 'cc012000-%'),'Cross tenant quotation visibility blocked');
select pg_temp.as_user(6);
select pg_temp.expect_error($cmd$select * from public.create_quotation_with_child_lines(pg_temp.quote_data(4),'[]','[]',pg_temp.items())$cmd$,'42501');
reset role;
select pg_temp.check_true((select count(*)=0 from public.bookings b join public.shipments s on s.id=b.shipment_id where s.quotation_id::text like 'cc012000-%'),'No fabricated bookings');
rollback;

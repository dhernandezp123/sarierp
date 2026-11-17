\set ON_ERROR_STOP on
-- Synthetic fixtures only. Execute on an isolated local stack and roll back.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.expect_error(command text, code text) returns void language plpgsql as $$
declare actual text; begin
  begin execute command; exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual=code then return; end if;
    raise exception 'Expected %, got %: %',code,actual,sqlerrm;
  end;
  raise exception 'Expected failure: %',command;
end $$;
insert into auth.users(id,aud,role,email,raw_user_meta_data)
values ('d5170000-0000-4000-8000-000000000001','authenticated','authenticated','miami-destination@test.local','{}');
update public.profiles set rol='Admin',status='Aprobado',is_active=true,
 tenant_id='00000000-0000-4000-8000-000000000001'
where id='d5170000-0000-4000-8000-000000000001';
insert into public.clientes(id,nombre,tenant_id,preferred_miami_rate_destination)
values ('d5170000-0000-4000-8000-000000000002','Cliente ficticio dos destinos','00000000-0000-4000-8000-000000000001','SPS');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.create_quotation_with_child_lines_aud01_internal(jsonb,jsonb,jsonb,jsonb)','EXECUTE'),'Internal create remains private');
select pg_temp.assert_true(not (select prosecdef from pg_proc where oid='public.save_quotation_edit(uuid,text,jsonb,boolean,jsonb,boolean,jsonb,boolean,jsonb,boolean,bigint,text)'::regprocedure),'Edit remains security invoker');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d5170000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select * from public.create_quotation_with_child_lines(
 '{"id":"d5170000-0000-4000-8000-000000000003","cliente_id":"d5170000-0000-4000-8000-000000000002","service_product":"miami_lcl","quote_type":"LCL","tipo_transporte":"Marítima","status":"Borrador","commodity":"Carga ficticia","miami_rate_destination":"TGU"}',
 '[]','[{"quantity":1,"package_type":"Caja","length":1,"width":1,"height":1,"dimension_unit":"m","weight_lbs":100,"ft3":35.31,"cbm":1}]','[]');
select pg_temp.assert_true((select miami_rate_destination='TGU' from public.quotations where id='d5170000-0000-4000-8000-000000000003'),'Create persists quote destination');
select public.save_quotation_edit('d5170000-0000-4000-8000-000000000003','Borrador','{"miami_rate_destination":"SPS"}');
select pg_temp.assert_true((select miami_rate_destination='SPS' from public.quotations where id='d5170000-0000-4000-8000-000000000003'),'Edit persists changed destination');
select public.save_quotation_edit('d5170000-0000-4000-8000-000000000003','Borrador','{"observaciones":"Conservar destino"}');
select pg_temp.assert_true((select miami_rate_destination='SPS' from public.quotations where id='d5170000-0000-4000-8000-000000000003'),'Unrelated edit preserves destination');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('d5170000-0000-4000-8000-000000000003','Borrador','{"miami_rate_destination":"OTHER"}')$cmd$,'23514');
select pg_temp.assert_true((select preferred_miami_rate_destination='SPS' from public.clientes where id='d5170000-0000-4000-8000-000000000002'),'Client preference remains unchanged');
select pg_temp.expect_error($cmd$select public.save_quotation_edit('d5170000-0000-4000-8000-000000000003','Ganada','{"miami_rate_destination":"TGU"}')$cmd$,'PT409');
reset role;
insert into public.client_rates(cliente_id,rate_code,rate_label,category,unit,currency,amount,is_active,miami_rate_destination)
values ('d5170000-0000-4000-8000-000000000002','consolidado_aereo_kg','Aereo KG','Aereo','KG','USD',2.7,true,'SPS'),
 ('d5170000-0000-4000-8000-000000000002','consolidado_aereo_kg','Aereo KG','Aereo','KG','USD',4,true,'TGU');
set local role authenticated;
select public.replace_client_rates('d5170000-0000-4000-8000-000000000002','TGU','["consolidado_aereo_kg"]','[]',
 '[{"rate_code":"consolidado_aereo_kg","rate_label":"Aereo KG","category":"Aereo","unit":"KG","currency":"USD","amount":4.5,"is_active":true,"miami_rate_destination":"TGU"}]');
select pg_temp.assert_true((select amount=2.7 from public.client_rates where cliente_id='d5170000-0000-4000-8000-000000000002' and miami_rate_destination='SPS'),'Updating TGU retains SPS rate');
select pg_temp.assert_true((select amount=4.5 from public.client_rates where cliente_id='d5170000-0000-4000-8000-000000000002' and miami_rate_destination='TGU'),'TGU has its own amount');
select * from public.create_quotation_with_child_lines(
 '{"id":"d5170000-0000-4000-8000-000000000004","cliente_id":"d5170000-0000-4000-8000-000000000002","service_product":"miami_air","quote_type":"Consolidado","tipo_transporte":"Aéreo","status":"Borrador","commodity":"Carga ficticia","miami_rate_destination":"TGU"}',
 '[]','[{"quantity":1,"package_type":"Caja","length":1,"width":1,"height":1,"dimension_unit":"m","weight_lbs":100,"ft3":35.31,"cbm":1}]','[]');
select pg_temp.assert_true((select miami_rate_destination='TGU' from public.quotations where id='d5170000-0000-4000-8000-000000000004'),'Air create persists TGU');
reset role;
rollback;

\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;
create function pg_temp.expect_error(command text, expected text)
returns void language plpgsql as $$ begin
  begin execute command; exception when others then
    if position(expected in sqlerrm)>0 then return; end if; raise;
  end; raise exception 'Expected error: %',expected;
end $$;
insert into public.tenants(id,slug,name) values
('be270000-0000-4000-8000-000000000100','fiscal27','Empresa prueba'),
('be270000-0000-4000-8000-000000000200','fiscal27-other','Empresa ajena');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('be270000-0000-4000-8000-000000000001','authenticated','authenticated','fiscal27@test.local','{}');
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,
tenant_id='be270000-0000-4000-8000-000000000100'
where id='be270000-0000-4000-8000-000000000001';
insert into public.company_settings(tenant_id,legal_name,rtn,address,billing_points_of_sale) values
('be270000-0000-4000-8000-000000000100','Empresa prueba','08019999123456','Domicilio matriz',array['SPS','TGU']);
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values
('be270100-0000-4000-8000-000000000001','be270000-0000-4000-8000-000000000100','SPS','Dirección SPS','11111111','sps@test.local','001','001'),
('be270100-0000-4000-8000-000000000002','be270000-0000-4000-8000-000000000100','TGU','Dirección TGU','22222222','tgu@test.local','002','001'),
('be270100-0000-4000-8000-000000000003','be270000-0000-4000-8000-000000000200','Otra','Otra','','','003','001');
insert into public.clientes(id,nombre,rtn,condicion_pago,tenant_id,billing_office_id) values
('be270200-0000-4000-8000-000000000001','Cliente TGU','08019999123456','Contado','be270000-0000-4000-8000-000000000100','be270100-0000-4000-8000-000000000002'),
('be270200-0000-4000-8000-000000000002','Sin oficina','08019999123456','Contado','be270000-0000-4000-8000-000000000100',null);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=2 from public.billing_offices),'Solo oficinas propias');
select pg_temp.expect_error($c$update public.clientes set billing_office_id='be270100-0000-4000-8000-000000000003' where id='be270200-0000-4000-8000-000000000001'$c$,'foreign key');
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values
('be270300-0000-4000-8000-000000000001','TEST-TGU','TGU','Factura','002-001-01-00000001','002-001-01-00000100',current_date+30,false,null),
('be270300-0000-4000-8000-000000000002','TEST-TGU-NC','TGU','Nota de Crédito','002-001-06-00000001','002-001-06-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000001');
select public.activate_cai_range('be270300-0000-4000-8000-000000000002');


select public.import_accounting_accounts('[{"code":"1201","name":"Equipos","kind":"Activo"},{"code":"1202","name":"Depreciación acumulada","kind":"Activo"},{"code":"1101","name":"Bancos","kind":"Activo"},{"code":"5101","name":"Depreciación","kind":"Gasto"}]');
select public.manage_accounting_period('2020-01-01',current_date);
create temporary table acquisition as select public.create_manual_journal(gen_random_uuid(),'2020-01-01','Compra equipo',jsonb_build_array(
jsonb_build_object('account_id',(select id from public.accounting_accounts where code='1201'),'debit',100),
jsonb_build_object('account_id',(select id from public.accounting_accounts where code='1101'),'credit',100))) id;
create temporary table asset_input as select jsonb_build_object('request_id',gen_random_uuid(),'code','EQ-001','name','Equipo prueba','category','Equipo','acquisition_date','2020-01-01','available_date','2020-01-01','start_month','2020-01-01','cost',100,'residual',1,'useful_months',7,
'asset_account_id',(select id from public.accounting_accounts where code='1201'),'accumulated_account_id',(select id from public.accounting_accounts where code='1202'),'depreciation_account_id',(select id from public.accounting_accounts where code='5101'),'acquisition_line_id',(select id from public.journal_lines where entry_id=(select id from acquisition) and debit>0)) payload;
create temporary table asset as select public.save_fixed_asset((select payload from asset_input)) id;
select pg_temp.assert_true(public.save_fixed_asset((select payload from asset_input))=(select id from asset),'Alta idempotente');
select public.save_fixed_asset((select payload||jsonb_build_object('id',(select id from asset),'name','Equipo editado') from asset_input));
select pg_temp.expect_error($c$select public.reverse_journal((select id from acquisition),current_date,'Reverso incorrecto')$c$,'respalda un activo');
select pg_temp.expect_error($c$select public.save_fixed_asset((select payload||jsonb_build_object('request_id',gen_random_uuid(),'code','EQ-002') from asset_input))$c$,'supera');
select pg_temp.expect_error($c$select public.post_asset_depreciation((select id from asset),'2020-02-01')$c$,'en orden');
select public.post_asset_depreciation((select id from asset),'2020-01-01');
select public.post_asset_depreciation((select id from asset),'2020-01-01');
select pg_temp.assert_true((select count(*)=1 and sum(amount)=14.14 from public.asset_depreciations),'Una depreciación por mes, redondeada');
select pg_temp.expect_error($c$select public.save_fixed_asset((select payload||jsonb_build_object('id',(select id from asset),'residual',2) from asset_input))$c$,'conserva');
select public.post_asset_depreciation((select id from asset),'2020-02-01');
select pg_temp.expect_error($c$select public.reverse_asset_depreciation((select id from public.asset_depreciations where period_month='2020-01-01'),current_date,'Incorrecto')$c$,'último mes');
select pg_temp.expect_error($c$select public.dispose_fixed_asset((select id from asset),'2020-04-01',(select id from public.accounting_accounts where code='5101'),'Faltan meses')$c$,'Completa');
select public.reverse_asset_depreciation((select id from public.asset_depreciations where period_month='2020-02-01'),'2020-02-29','Prueba reverso');
select public.post_asset_depreciation((select id from asset),'2020-02-01');
do $$declare m integer;begin for m in 3..7 loop perform public.post_asset_depreciation((select id from asset),make_date(2020,m,1));end loop;end $$;
select pg_temp.assert_true((select accumulated_depreciation=99 and net_book_value=1 and status='Depreciado' and depreciated_months=7 from public.fixed_asset_balances),'Residual exacto y vida completa');
select public.dispose_fixed_asset((select id from asset),'2020-07-31',(select id from public.accounting_accounts where code='5101'),'Fin de uso');
select public.dispose_fixed_asset((select id from asset),'2020-07-31',(select id from public.accounting_accounts where code='5101'),'Fin de uso');
select pg_temp.assert_true((select count(*)=1 from public.journal_entries where source_type='Baja de activo'),'Baja idempotente');
select pg_temp.assert_true((select net_book_value=0 from public.fixed_asset_balances),'Valor en libros cero tras baja');
select pg_temp.assert_true((select sum(l.debit-l.credit)=0 from public.journal_lines l join public.accounting_accounts a on a.id=l.account_id where a.code='1201'),'Baja cancela costo en mayor');
select pg_temp.assert_true((select sum(l.debit-l.credit)=0 from public.journal_lines l join public.accounting_accounts a on a.id=l.account_id where a.code='1202'),'Baja cancela depreciación en mayor');
select pg_temp.expect_error($c$update public.fixed_assets set cost=1$c$,'permission denied');
select pg_temp.expect_error($c$delete from public.asset_depreciations$c$,'permission denied');
set constraints all immediate;
reset role;
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('be270000-0000-4000-8000-000000000002','authenticated','authenticated','assets-other@test.local','{}');
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,tenant_id='be270000-0000-4000-8000-000000000200' where id='be270000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"be270000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.fixed_asset_balances),'Activos aislados por empresa');
select pg_temp.expect_error($c$select public.post_asset_depreciation((select id from asset),'2020-08-01')$c$,'no disponible');
rollback;

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

select public.import_accounting_accounts('[
{"code":"1","name":"Activos","kind":"Activo","postable":false},
{"code":"1101","name":"Bancos","kind":"Activo","parent_code":"1"},
{"code":"1102","name":"Clientes","kind":"Activo","parent_code":"1"},
{"code":"1103","name":"ISV crédito","kind":"Activo","parent_code":"1"},
{"code":"2101","name":"Proveedores","kind":"Pasivo"},
{"code":"2102","name":"Anticipos clientes","kind":"Pasivo"},
{"code":"2103","name":"ISV débito","kind":"Pasivo"},
{"code":"4101","name":"Servicios","kind":"Ingreso"},
{"code":"5101","name":"Compras","kind":"Gasto"}]');
select pg_temp.expect_error($c$select public.import_accounting_accounts('[{"code":"999","name":"Temporal","kind":"Activo"},{"code":"1101","name":"Repetida","kind":"Activo"}]')$c$,'duplicate key');
select pg_temp.assert_true(not exists(select 1 from public.accounting_accounts where code='999'),'Importación atómica');
select public.manage_accounting_period(current_date-1,current_date-1);
select public.manage_accounting_period(current_date,current_date);
select pg_temp.expect_error($c$select public.manage_accounting_period(current_date-1,current_date)$c$,'límites');
select public.save_accounting_settings(true,current_date-1,(select jsonb_object_agg(purpose,id) from (select id,case code
when '1101' then 'cash' when '1102' then 'receivable' when '1103' then 'purchase_tax' when '2101' then 'payable'
when '2102' then 'customer_advances' when '2103' then 'sales_tax' when '4101' then 'sales' when '5101' then 'purchases' end purpose
from public.accounting_accounts where postable) a));
create temporary table journal_input as select jsonb_build_array(
jsonb_build_object('account_id',(select id from public.accounting_accounts where code='1101'),'debit',100,'credit',0),
jsonb_build_object('account_id',(select id from public.accounting_accounts where code='4101'),'debit',0,'credit',100)) as lines;
create temporary table manual as select public.create_manual_journal('be270500-0000-4000-8000-000000000001',current_date-1,'Asiento manual de prueba',(select lines from journal_input)) as id;
select pg_temp.assert_true(public.create_manual_journal('be270500-0000-4000-8000-000000000001',current_date-1,'Asiento manual de prueba',(select lines from journal_input))=(select id from manual),'Asiento idempotente');
select pg_temp.expect_error($c$select public.create_manual_journal('be270500-0000-4000-8000-000000000002',current_date,'Incorrecto',jsonb_set((select lines from journal_input),'{1,credit}','99'))$c$,'desbalanceado');
select pg_temp.expect_error($c$select public.create_manual_journal('be270500-0000-4000-8000-000000000003',current_date,'Incorrecto',jsonb_set((select lines from journal_input),'{0,debit}','"NaN"'))$c$,'dos decimales');
select pg_temp.assert_true((select count(*)=1 from public.journal_entries),'Errores no dejan encabezados');
select public.manage_accounting_period(current_date-1,current_date-1,true);
select pg_temp.expect_error($c$select public.create_manual_journal('be270500-0000-4000-8000-000000000004',current_date-1,'Cerrado',(select lines from journal_input))$c$,'período contable abierto');
select public.reverse_journal((select id from manual),current_date,'Corrección de prueba');
select pg_temp.assert_true((select sum(debit)=sum(credit) and sum(debit)=200 from public.journal_lines),'Reverso balanceado');
create temporary table invoice on commit drop as select * from public.create_manual_invoice_with_items(
'{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}',
'[{"description":"Flete","quantity":1,"unit_price":100,"isv_rate":15}]');
select pg_temp.assert_true((select count(*)=2 from public.journal_entries),'Borrador no contabiliza');
update public.invoices set status='Aprobada' where id=(select invoice_id from invoice);
select pg_temp.assert_true((select count(*)=1 from public.journal_entries where source_id=(select invoice_id from invoice)),'Factura emite asiento una vez');
select public.post_invoice_journal((select invoice_id from invoice));
select pg_temp.assert_true((select sum(l.debit)=115 and sum(l.credit)=115 from public.journal_lines l join public.journal_entries e on e.id=l.entry_id where e.source_id=(select invoice_id from invoice)),'Factura: cuenta cliente, ingreso e ISV');
select pg_temp.expect_error($c$select public.reverse_journal((select id from public.journal_entries where source_id=(select invoice_id from invoice)),current_date,'Inconsistente')$c$,'documento de origen');
update public.invoices set status='Anulada' where id=(select invoice_id from invoice);
select pg_temp.assert_true((select sum(l.debit-l.credit)=0 from public.journal_lines l join public.accounting_accounts a on a.id=l.account_id where a.code='1102'),'Anular revierte cuenta por cobrar');
select pg_temp.expect_error($c$update public.journal_lines set debit=1$c$,'permission denied');
select pg_temp.expect_error($c$select public.save_accounting_account(jsonb_build_object('id',(select id from public.accounting_accounts where code='1101'),'code','NEW','name','Cambiar','kind','Activo'))$c$,'conserva código');
set constraints all immediate;
rollback;

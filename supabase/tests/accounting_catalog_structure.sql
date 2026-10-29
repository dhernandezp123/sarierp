\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
insert into public.tenants(id,slug,name) values('ac290000-0000-4000-8000-000000000100','account-catalog-fixture','Empresa ficticia catálogo');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('ac290000-0000-4000-8000-000000000001','authenticated','authenticated','catalog@test.local','{}');
update public.profiles set tenant_id='ac290000-0000-4000-8000-000000000100',rol='Contabilidad',status='Aprobado',is_active=true where id='ac290000-0000-4000-8000-000000000001';
insert into public.proveedores(id,tenant_id,nombre,tipo,rtn,moneda) values('ac290000-0000-4000-8000-000000000020','ac290000-0000-4000-8000-000000000100','Proveedor ficticio catálogo','Otro','08019999123456','HNL');
-- Demo uses its own access-grant guard, without changing production functions.
do $$begin if (select environment from public.platform_environment where singleton)='demo'
 and exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_demo_user') then
 execute $demo$update public.profiles set is_demo_user=true,demo_expires_at=now()+interval '1 day',demo_access_grant_id='ac290000-0000-4000-8000-000000000099' where id='ac290000-0000-4000-8000-000000000001'$demo$;
end if;end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ac290000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"demo_access_grant_id":"ac290000-0000-4000-8000-000000000099"}}',true);
select pg_temp.assert_true(public.import_accounting_accounts('[
 {"code":"1","name":"Activo ficticio","kind":"Activo","postable":false,"account_level":"Tipo"},
 {"code":"11","name":"Caja agrupada","kind":"Activo","postable":false,"parent_code":"1","account_level":"Grupo"},
 {"code":"11101","name":"Caja ficticia","kind":"Activo","postable":true,"parent_code":"11","account_level":"Auxiliar"},
 {"code":"4","name":"Resultado agrupado","kind":"Resultado","postable":false,"account_level":"Tipo"},
 {"code":"41","name":"Ingreso agrupado","kind":"Ingreso","postable":false,"parent_code":"4","account_level":"Grupo"},
 {"code":"41101","name":"Ingreso ficticio","kind":"Ingreso","postable":true,"parent_code":"41","account_level":"Auxiliar"},
 {"code":"42","name":"Costo agrupado","kind":"Costo","postable":false,"parent_code":"4","account_level":"Grupo"},
 {"code":"42101","name":"Costo ficticio","kind":"Costo","postable":true,"parent_code":"42","account_level":"Auxiliar"},
 {"code":"43","name":"Gasto agrupado","kind":"Gasto","postable":false,"parent_code":"4","account_level":"Grupo"},
 {"code":"43101","name":"Gasto ficticio","kind":"Gasto","postable":true,"parent_code":"43","account_level":"Auxiliar"},
 {"code":"5","name":"Orden agrupada","kind":"Orden","postable":false,"account_level":"Tipo"},
 {"code":"51","name":"Orden deudora agrupada","kind":"Orden","postable":false,"parent_code":"5","account_level":"Grupo"},
 {"code":"51001","name":"Orden deudora ficticia","kind":"Orden","postable":true,"parent_code":"51","account_level":"Auxiliar"},
 {"code":"52","name":"Orden acreedora agrupada","kind":"Orden","postable":false,"parent_code":"5","account_level":"Grupo"},
 {"code":"52001","name":"Orden acreedora ficticia","kind":"Orden","postable":true,"parent_code":"52","account_level":"Auxiliar"}
]')=15,'Importa estructura mixta con niveles y padres');
select pg_temp.assert_true((select count(*)=15 and count(*) filter(where postable)=6 and bool_and(account_level is not null) from public.accounting_accounts),'Conserva niveles y movimiento explícito');
select pg_temp.expect_error($sql$select public.save_accounting_account('{"code":"BAD","name":"Agrupadora inválida","kind":"Resultado","postable":true}')$sql$,'agrupadora');
select pg_temp.expect_error($sql$select public.save_accounting_account('{"code":"BAD","name":"Grupo inválido","kind":"Activo","account_level":"Grupo","postable":true}')$sql$,'agrupadora');
select pg_temp.expect_error($sql$select public.import_accounting_accounts('[{"code":"NEW","name":"Cuenta ficticia","kind":"Activo"},{"code":"1","name":"Duplicada","kind":"Activo"}]')$sql$,'duplicate key');
select pg_temp.assert_true(not exists(select 1 from public.accounting_accounts where code='NEW'),'Duplicado revierte todo el lote');
select pg_temp.expect_error($sql$select public.save_accounting_account(jsonb_build_object('code','BAD','name','Padre inválido','kind','Orden','parent_id',(select id from public.accounting_accounts where code='4')))$sql$,'cuenta padre');
select public.save_accounting_settings(false,null,jsonb_build_object('purchases',(select id from public.accounting_accounts where code='42101')));
select public.manage_accounting_period(date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,false);
select public.create_manual_journal('ac290000-0000-4000-8000-000000000010',current_date,'Costo ficticio',jsonb_build_array(
 jsonb_build_object('account_id',(select id from public.accounting_accounts where code='42101'),'debit',40,'credit',0),
 jsonb_build_object('account_id',(select id from public.accounting_accounts where code='11101'),'debit',0,'credit',40)));
select public.create_manual_journal('ac290000-0000-4000-8000-000000000011',current_date,'Orden ficticia',jsonb_build_array(
 jsonb_build_object('account_id',(select id from public.accounting_accounts where code='51001'),'debit',100,'credit',0),
 jsonb_build_object('account_id',(select id from public.accounting_accounts where code='52001'),'debit',0,'credit',100)));
select pg_temp.expect_error($sql$select public.create_manual_journal('ac290000-0000-4000-8000-000000000012',current_date,'Mezcla inválida',jsonb_build_array(
 jsonb_build_object('account_id',(select id from public.accounting_accounts where code='51001'),'debit',20,'credit',0),
 jsonb_build_object('account_id',(select id from public.accounting_accounts where code='11101'),'debit',0,'credit',20)))$sql$,'orden deben balancearse separadas');
select pg_temp.assert_true((select count(*)=2 from public.journal_entries),'Asiento incompatible no persiste');
select public.create_purchase_document('ac290000-0000-4000-8000-000000000021',jsonb_build_object('document_type','Factura de proveedor','supplier_id','ac290000-0000-4000-8000-000000000020','currency','HNL','issue_date',current_date,'document_number','TEST-CATALOG-COST'),jsonb_build_array(jsonb_build_object('account_id',(select id from public.accounting_accounts where code='42101'),'description','Costo ficticio','quantity',1,'unit_price',100,'discount_amount',5,'tax_rate',0)));
select pg_temp.assert_true(exists(select 1 from public.purchase_documents where document_number='TEST-CATALOG-COST' and total=95),'Compra admite costo conservando descuentos');
select pg_temp.expect_error($sql$select public.delete_accounting_account((select id from public.accounting_accounts where code='43'))$sql$,'cuentas hijas');
select pg_temp.expect_error($sql$select public.delete_accounting_account((select id from public.accounting_accounts where code='11101'))$sql$,'movimientos contables');
select public.save_accounting_account('{"code":"43102","name":"Gasto de compra ficticio","kind":"Gasto","account_level":"Auxiliar"}'::jsonb||jsonb_build_object('parent_id',(select id from public.accounting_accounts where code='43')));
select public.create_purchase_document('ac290000-0000-4000-8000-000000000022',jsonb_build_object('document_type','Factura de proveedor','supplier_id','ac290000-0000-4000-8000-000000000020','currency','HNL','issue_date',current_date,'document_number','TEST-CATALOG-EXPENSE'),jsonb_build_array(jsonb_build_object('account_id',(select id from public.accounting_accounts where code='43102'),'description','Gasto ficticio','quantity',1,'unit_price',10,'tax_rate',0)));
select pg_temp.expect_error($sql$select public.delete_accounting_account((select id from public.accounting_accounts where code='43102'))$sql$,'documentos de compra');
select public.save_accounting_account('{"code":"11102","name":"Caja asignada ficticia","kind":"Activo","account_level":"Auxiliar"}'::jsonb||jsonb_build_object('parent_id',(select id from public.accounting_accounts where code='11')));
select public.save_accounting_settings(false,null,jsonb_build_object('cash',(select id from public.accounting_accounts where code='11102')));
select pg_temp.expect_error($sql$select public.delete_accounting_account((select id from public.accounting_accounts where code='11102'))$sql$,'asignada en configuración');
select public.delete_accounting_account((select id from public.accounting_accounts where code='43101'));
select pg_temp.assert_true(not exists(select 1 from public.accounting_accounts where code='43101'),'Elimina una cuenta sin uso');
select pg_temp.assert_true(not has_function_privilege('anon','public.delete_accounting_account(uuid)','execute'),'Anon no elimina cuentas');
select pg_temp.assert_true(not has_function_privilege('anon','public.import_accounting_accounts(jsonb)','execute') and not has_table_privilege('authenticated','public.accounting_accounts','insert'),'Permisos de catálogo siguen protegidos');
reset role;
set constraints all immediate;
rollback;

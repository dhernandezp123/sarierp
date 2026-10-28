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
select public.save_accounting_account('{"code":"5102","name":"Aseo de jardín","kind":"Gasto"}');
select public.save_accounting_account('{"code":"4102","name":"Flete marítimo","kind":"Ingreso"}');
select public.save_accounting_account('{"code":"2104","name":"Retenciones por pagar","kind":"Pasivo"}');
select public.save_accounting_settings(true,current_date-1,jsonb_build_object('withholding_payable',(select id from public.accounting_accounts where code='2104')));
insert into public.proveedores(id,tenant_id,nombre,tipo,rtn,moneda) values('be270600-0000-4000-8000-000000000001',public.current_tenant_id(),'Proveedor prueba','Otro','08019999123456','HNL');
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values
('be270300-0000-4000-8000-000000000004','TEST-TGU-BOLETA','TGU','Boleta de Compra','002-001-11-00000001','002-001-11-00000100',current_date+30,false,null),
('be270300-0000-4000-8000-000000000005','TEST-TGU-RET','TGU','Comprobante de Retención','002-001-05-00000001','002-001-05-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000004');
select public.activate_cai_range('be270300-0000-4000-8000-000000000005');
-- Roles reales y una empresa ajena. Las solicitudes solo se deciden en Contabilidad.
reset role;
select set_config('request.jwt.claims','{}',true);
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('be270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','void-'||n||'@test.local','{}'::jsonb from generate_series(2,7) n;
update public.profiles set rol=(case right(id::text,1) when '2' then 'Admin' when '3' then 'Finanzas' when '4' then 'Ventas' else 'Contabilidad' end)::public.user_role,
status='Aprobado',is_active=right(id::text,1)<>'6',nombre='Rol prueba '||right(id::text,1),
tenant_id=case when right(id::text,1)='5' then 'be270000-0000-4000-8000-000000000200'::uuid else 'be270000-0000-4000-8000-000000000100'::uuid end
where id in (select ('be270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(2,7) n);
update public.profiles set is_platform_admin=true,rol='Admin',tenant_id=null where id='be270000-0000-4000-8000-000000000007';
create function pg_temp.as_user(n integer) returns void language sql as $$ select set_config('request.jwt.claims',jsonb_build_object('sub','be270000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::text is not null $$;
set local role authenticated;
select pg_temp.as_user(1);
create temporary table docs(name text,id uuid);
insert into docs select 'main',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Flete prueba","quantity":1,"unit_price":100,"isv_rate":15}]');
insert into docs select 'stale',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Flete prueba","quantity":1,"unit_price":100,"isv_rate":15}]');
insert into docs select 'paid',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Flete prueba","quantity":1,"unit_price":100,"isv_rate":15}]');
update public.invoices set status='Aprobada' where id in (select id from docs);
create temporary table numbering as select id,next_number from public.cai_ranges;
create temporary table requests(name text,id uuid);
select pg_temp.as_user(2);
select pg_temp.assert_true(not public.can_approve_fiscal_void(),'Admin no sustituye Contabilidad');
insert into requests values('main',public.request_fiscal_void('invoices',(select id from docs where name='main'),'be272300-0000-4000-8000-000000000001','Error de emisión'));
select pg_temp.assert_true(public.request_fiscal_void('invoices',(select id from docs where name='main'),'be272300-0000-4000-8000-000000000001','Error de emisión')=(select id from requests where name='main'),'Solicitud idempotente');
select pg_temp.expect_error($c$select public.request_fiscal_void('invoices',(select id from docs where name='stale'),'be272300-0000-4000-8000-000000000001','Otro')$c$,'otros datos');
select pg_temp.expect_error($c$select public.request_fiscal_void('invoices',(select id from docs where name='main'),gen_random_uuid(),'Duplicada')$c$,'solicitud pendiente');
select pg_temp.expect_error($c$update public.invoices set status='Anulada' where id=(select id from docs where name='main')$c$,'aprobada por Contabilidad');
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),true,'Aprobar',true)$c$,'Solo Contabilidad');
select pg_temp.expect_error($c$update public.fiscal_void_requests set status='Aprobada'$c$,'permission denied');
select pg_temp.as_user(3);
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),false,'Rechazar',false)$c$,'Solo Contabilidad');
select pg_temp.as_user(4);
select pg_temp.assert_true((select count(*)=0 from public.fiscal_void_requests),'Ventas no ve historial financiero');
select pg_temp.expect_error($c$select public.request_fiscal_void('invoices',(select id from docs where name='main'),gen_random_uuid(),'No permitido')$c$,'No autorizado');
select pg_temp.as_user(5);
select pg_temp.assert_true((select count(*)=0 from public.fiscal_void_requests),'Empresa ajena no ve solicitudes');
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),true,'Ajena',true)$c$,'Solicitud no disponible');
select pg_temp.expect_error($c$select public.request_fiscal_void('invoices',(select id from docs where name='main'),gen_random_uuid(),'Ajena')$c$,'Documento no disponible');
select pg_temp.as_user(6);
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),true,'Inactivo',true)$c$,'Solo Contabilidad');
select pg_temp.as_user(7);
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),true,'Plataforma',true)$c$,'Solo Contabilidad');
select pg_temp.as_user(1);
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),true,'Aprobada',false)$c$,'original y la copia');
select public.save_accounting_settings(false,current_date-1,'{}');
savepoint closed_period_check;
select public.manage_accounting_period(current_date,current_date,true);
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),true,'Corrección autorizada',true)$c$,'período contable abierto');
select pg_temp.assert_true((select status='Pendiente' from public.fiscal_void_requests where id=(select id from requests where name='main')),'Fallo de reverso conserva solicitud pendiente');
select pg_temp.assert_true((select status='Aprobada' from public.invoices where id=(select id from docs where name='main')),'Fallo de reverso no anula documento');
rollback to savepoint closed_period_check;
release savepoint closed_period_check;
select public.review_fiscal_void((select id from requests where name='main'),true,'Corrección autorizada',true);
select public.review_fiscal_void((select id from requests where name='main'),true,'Corrección autorizada',true);
select pg_temp.assert_true((select status='Anulada' and cancelled_by=auth.uid() and cancellation_reason='Error de emisión' and cancellation_request_id=(select id from requests where name='main') from public.invoices where id=(select id from docs where name='main')),'Documento conserva motivo, aprobador y vínculo');
select pg_temp.assert_true((select requested_by='be270000-0000-4000-8000-000000000002' and reviewed_by=auth.uid() and accounting_result='Reversado' and original_entry_id is not null and reversal_entry_id is not null from public.fiscal_void_requests where id=(select id from requests where name='main')),'Historial distingue solicitante y aprobador y revierte aunque automático está apagado');
select pg_temp.assert_true((select count(*)=2 from public.journal_entries where id in (select original_entry_id from public.fiscal_void_requests where id=(select id from requests where name='main')) or reverses_id in (select original_entry_id from public.fiscal_void_requests where id=(select id from requests where name='main'))),'Reintento no duplica reversos');
select pg_temp.assert_true(not exists(select 1 from public.cai_ranges c join numbering n using(id) where c.next_number is distinct from n.next_number),'Anular no recicla ni consume CAI');
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='main'),false,'Cambiar decisión',false)$c$,'decisión no puede cambiar');
select pg_temp.expect_error($c$update public.invoices set status='Aprobada' where id=(select id from docs where name='main')$c$,'conserva su contenido');
select pg_temp.expect_error($c$update public.invoices set deleted_at=now() where id=(select id from docs where name='stale')$c$,'no se oculta');
select pg_temp.expect_error($c$delete from public.invoices where id=(select id from docs where name='stale')$c$,'permission denied');
reset role;
select pg_temp.expect_error($c$delete from public.invoices where id=(select id from docs where name='stale')$c$,'conservan');
set local role authenticated;
insert into requests values('stale',public.request_fiscal_void('invoices',(select id from docs where name='stale'),gen_random_uuid(),'Revisar documento'));
select pg_temp.expect_error($c$update public.invoices set notes='Datos actualizados después de la solicitud' where id=(select id from docs where name='stale')$c$,'corrección aprobada');
-- Un cambio de estado permitido también invalida el snapshot de una solicitud.
update public.invoices set status='Vencida' where id=(select id from docs where name='stale');
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='stale'),true,'Autorizar',true)$c$,'cambió desde la solicitud');
select public.review_fiscal_void((select id from requests where name='stale'),false,'Datos cambiaron; solicitar de nuevo',false);
select pg_temp.assert_true((select status='Vencida' from public.invoices where id=(select id from docs where name='stale')),'Rechazo conserva el estado vigente del documento');
select public.review_fiscal_void(public.request_fiscal_void('invoices',(select id from docs where name='stale'),gen_random_uuid(),'Nueva revisión'),true,'Autorizar actual',true);
-- Documento sin asiento: registro fiscal explícito, nunca un asiento de importe cero.
insert into docs select 'unposted',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Flete sin partida","quantity":1,"unit_price":20,"isv_rate":0}]');
update public.invoices set status='Aprobada' where id=(select id from docs where name='unposted');
insert into requests values('unposted',public.request_fiscal_void('invoices',(select id from docs where name='unposted'),gen_random_uuid(),'Error sin partida'));
select public.review_fiscal_void((select id from requests where name='unposted'),true,'Confirmado',true);
select pg_temp.assert_true((select accounting_result='Sin asiento previo' and original_entry_id is null and reversal_entry_id is null from public.fiscal_void_requests where id=(select id from requests where name='unposted')),'Sin partida no inventa contabilización');
-- Pagos y conversión siguen protegidos, incluso después de solicitar.
select public.register_customer_receipt(gen_random_uuid(),'be270200-0000-4000-8000-000000000001',115,'HNL',current_date,'Efectivo','','',jsonb_build_array(jsonb_build_object('document_id',(select id from docs where name='paid'),'amount',115)));
insert into requests values('paid',public.request_fiscal_void('invoices',(select id from docs where name='paid'),gen_random_uuid(),'Pago debe revertirse'));
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='paid'),true,'Autorizar',true)$c$,'pagos');
select pg_temp.assert_true((select status='Pendiente' from public.fiscal_void_requests where id=(select id from requests where name='paid')),'No registra aprobación parcial con pagos activos');
insert into docs select 'proforma',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Proforma","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Proforma de prueba","quantity":1,"unit_price":20,"isv_rate":0}]');
select pg_temp.assert_true((select cai is null and invoice_number not like '002-%' from public.invoices where id=(select id from docs where name='proforma')),'Proforma usa secuencia propia sin CAI');
insert into requests values('proforma',public.request_fiscal_void('invoices',(select id from docs where name='proforma'),gen_random_uuid(),'Cancelar comercial'));
select public.review_fiscal_void((select id from requests where name='proforma'),true,'Confirmar comercial',false);
select pg_temp.assert_true((select accounting_result='No fiscal' from public.fiscal_void_requests where id=(select id from requests where name='proforma')),'Proforma no se confunde con documento SAR');
-- Boleta y retención: se bloquean las vías antiguas y se concilian sus movimientos.
select public.save_accounting_settings(true,current_date-1,'{}');
create temporary table purchase as select public.create_purchase_document(gen_random_uuid(),
jsonb_build_object('document_type','Boleta de Compra','supplier_id','be270600-0000-4000-8000-000000000001','office_id','be270100-0000-4000-8000-000000000002','currency','HNL','issue_date',current_date,'supplier_identity','08019999123456','supplier_address','Domicilio prueba','supplier_phone','22222222'),
jsonb_build_array(jsonb_build_object('description','Jardín prueba','quantity',1,'unit_price',100,'tax_rate',0,'account_id',(select id from public.accounting_accounts where code='5102')))) as id;
create temporary table retention as select public.create_withholding_document(gen_random_uuid(),(select payable_id from public.purchase_documents where id=(select id from purchase)),'be270100-0000-4000-8000-000000000002',current_date,'[{"description":"Retención prueba","base":100,"rate":1}]') as id;
select pg_temp.expect_error($c$select public.reverse_supplier_payment((select id from public.pagos_proveedor where withholding_document_id=(select id from retention)),'Directo')$c$,'aprobada por Contabilidad');
insert into requests values('retention',public.request_fiscal_void('withholding_documents',(select id from retention),gen_random_uuid(),'Corregir retención'));
select public.review_fiscal_void((select id from requests where name='retention'),true,'Retención revisada',true);
select pg_temp.assert_true((select status='Anulada' and cancellation_request_id=(select id from requests where name='retention') from public.withholding_documents where id=(select id from retention)),'Retención queda vinculada a su autorización');
select pg_temp.assert_true((select status='Reversado' from public.pagos_proveedor where withholding_document_id=(select id from retention)),'Reverso de retención restaura saldo proveedor');
select pg_temp.expect_error($c$select public.cancel_supplier_payable((select payable_id from public.purchase_documents where id=(select id from purchase)),'Directo')$c$,'aprobada por Contabilidad');
insert into requests values('purchase',public.request_fiscal_void('purchase_documents',(select id from purchase),gen_random_uuid(),'Corregir boleta'));
select public.review_fiscal_void((select id from requests where name='purchase'),true,'Boleta revisada',true);
select pg_temp.assert_true((select status='Anulada' and cancellation_request_id=(select id from requests where name='purchase') from public.purchase_documents where id=(select id from purchase)),'Boleta anulada conserva CAI, documento y autorización');
select pg_temp.assert_true((select count(*)=2 from public.fiscal_void_requests where id in(select id from requests where name in('retention','purchase')) and accounting_result='Reversado'),'Compras y retenciones con partida conservan reverso');
-- NC y ND conservan su CAI y sus reversos; no se anula una factura con notas activas.
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number)
values('be270300-0000-4000-8000-000000000006','TEST-TGU-ND','TGU','Nota de Débito','002-001-07-00000001','002-001-07-00000100',current_date+30,false,null);
select public.activate_cai_range('be270300-0000-4000-8000-000000000006');
insert into docs select 'parent',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Factura de notas","quantity":1,"unit_price":100,"isv_rate":15}]');
update public.invoices set status='Aprobada' where id=(select id from docs where name='parent');
insert into docs select 'credit',invoice_id from public.create_manual_invoice_with_items(jsonb_build_object('invoice_type','Nota de Crédito','parent_invoice_id',(select id from docs where name='parent'),'cliente_id','be270200-0000-4000-8000-000000000001','currency','HNL','motivo','Corrección prueba'),'[{"description":"Ajuste crédito","quantity":1,"unit_price":20,"isv_rate":15}]');
insert into docs select 'debit',invoice_id from public.create_manual_invoice_with_items(jsonb_build_object('invoice_type','Nota de Débito','parent_invoice_id',(select id from docs where name='parent'),'cliente_id','be270200-0000-4000-8000-000000000001','currency','HNL','motivo','Corrección prueba'),'[{"description":"Ajuste débito","quantity":1,"unit_price":20,"isv_rate":15}]');
update public.invoices set status='Aprobada' where id in (select id from docs where name in('credit','debit'));
insert into requests values('parent',public.request_fiscal_void('invoices',(select id from docs where name='parent'),gen_random_uuid(),'Error con notas activas'));
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='parent'),true,'Autorizar',true)$c$,'notas');
insert into requests values('credit',public.request_fiscal_void('invoices',(select id from docs where name='credit'),gen_random_uuid(),'Error NC'));
insert into requests values('debit',public.request_fiscal_void('invoices',(select id from docs where name='debit'),gen_random_uuid(),'Error ND'));
select public.review_fiscal_void((select id from requests where name='credit'),true,'NC revisada',true);
select pg_temp.assert_true((select balance=138 from public.invoice_receivables where invoice_id=(select id from docs where name='parent')),'Anular NC restaura saldo correcto');
select public.review_fiscal_void((select id from requests where name='debit'),true,'ND revisada',true);
select pg_temp.assert_true((select balance=115 from public.invoice_receivables where invoice_id=(select id from docs where name='parent')),'Anular ND restaura saldo correcto');
select pg_temp.assert_true((select count(*)=2 from public.fiscal_void_requests where id in (select id from requests where name in('credit','debit')) and accounting_result='Reversado'),'NC y ND conservan reverso de su propia partida');
insert into docs select 'converted',invoice_id from public.create_manual_invoice_with_items('{"invoice_type":"Proforma","cliente_id":"be270200-0000-4000-8000-000000000001","currency":"HNL"}','[{"description":"Proforma convertible","quantity":1,"unit_price":20,"isv_rate":0}]');
insert into requests values('converted',public.request_fiscal_void('invoices',(select id from docs where name='converted'),gen_random_uuid(),'Revisión pendiente'));
select public.convert_proforma_to_invoice((select id from docs where name='converted'),'{"fiscal_mode":"Exenta"}');
select pg_temp.expect_error($c$select public.review_fiscal_void((select id from requests where name='converted'),true,'Autorizar',false)$c$,'convertida conserva');
set constraints all immediate;
rollback;

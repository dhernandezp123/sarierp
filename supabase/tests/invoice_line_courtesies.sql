\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$ begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$ begin
 begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
insert into public.tenants(id,slug,name) values('dd280000-0000-4000-8000-000000000100','drafts28','Empresa ficticia'),('dd280000-0000-4000-8000-000000000200','drafts28-other','Otra empresa ficticia');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values
('dd280000-0000-4000-8000-000000000001','authenticated','authenticated','draft-admin@test.local','{}'),
('dd280000-0000-4000-8000-000000000002','authenticated','authenticated','draft-master@test.local','{}'),
('dd280000-0000-4000-8000-000000000003','authenticated','authenticated','draft-finance@test.local','{}'),
('dd280000-0000-4000-8000-000000000004','authenticated','authenticated','draft-other@test.local','{}');
update public.profiles set rol='Admin',status='Aprobado',is_active=true,tenant_id='dd280000-0000-4000-8000-000000000100' where id='dd280000-0000-4000-8000-000000000001';
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,tenant_id='dd280000-0000-4000-8000-000000000100' where id='dd280000-0000-4000-8000-000000000002';
update public.profiles set rol='Finanzas',status='Aprobado',is_active=true,tenant_id='dd280000-0000-4000-8000-000000000100' where id='dd280000-0000-4000-8000-000000000003';
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,tenant_id='dd280000-0000-4000-8000-000000000200' where id='dd280000-0000-4000-8000-000000000004';
select pg_temp.expect_error($c$insert into public.invoice_master_settings(tenant_id,profile_id) values('dd280000-0000-4000-8000-000000000100','dd280000-0000-4000-8000-000000000002')$c$,'check constraint');
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) values('dd280000-0000-4000-8000-000000000100','dd280000-0000-4000-8000-000000000002','Despliegue autorizado');
insert into public.invoice_workflow_events(tenant_id,actor_name,action,reason,snapshot) values('dd280000-0000-4000-8000-000000000100','Despliegue administrativo','Master designado','Prueba de aprovisionamiento sin suplantar usuarios','{"origin":"Despliegue autorizado","database_role":"postgres"}');
select pg_temp.expect_error($c$insert into public.invoice_workflow_events(tenant_id,actor_name,action,snapshot) values('dd280000-0000-4000-8000-000000000100','Despliegue administrativo','Master designado','{}')$c$,'check constraint');
delete from public.invoice_master_settings where tenant_id='dd280000-0000-4000-8000-000000000100';
insert into public.company_settings(tenant_id,legal_name,rtn,address,billing_points_of_sale) values('dd280000-0000-4000-8000-000000000100','Empresa ficticia','08019999123456','Domicilio de prueba',array['SPS']);
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values('dd280100-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','SPS','Oficina ficticia','00000000','office@test.local','001','001');
-- Finance can issue from this explicitly authorized office without becoming master.
insert into public.billing_user_office_access(tenant_id,profile_id,office_ids,revision,updated_by) values('dd280000-0000-4000-8000-000000000100','dd280000-0000-4000-8000-000000000003',array['dd280100-0000-4000-8000-000000000001']::uuid[],1,'dd280000-0000-4000-8000-000000000002');
insert into public.clientes(id,nombre,rtn,condicion_pago,tenant_id,billing_office_id) values('dd280200-0000-4000-8000-000000000001','Cliente ficticio','08019999123456','Contado','dd280000-0000-4000-8000-000000000100','dd280100-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select pg_temp.assert_true(public.is_invoice_master(),'Admin tiene autoridad financiera en su empresa');
select pg_temp.expect_error($c$select public.set_invoice_master('dd280000-0000-4000-8000-000000000004','Ajeno')$c$,'esta empresa');
select public.set_invoice_master('dd280000-0000-4000-8000-000000000002','Designación de prueba');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values('dd280300-0000-4000-8000-000000000001','TEST-DRAFT-CAI','SPS','Factura','001-001-01-00000001','001-001-01-00000100',current_date+30,false,null);
select public.activate_cai_range('dd280300-0000-4000-8000-000000000001');
select public.save_accounting_alert_settings(0,'{"internal_enabled":true,"portal_enabled":false,"email_enabled":false,"before_days":[7,3,0],"overdue_days":7,"inactivity_days":[30,60,90]}','Activacion explicita de avisos internos de prueba');
create temp table before_counter as select next_number from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);

create temp table payload as select jsonb_build_object('invoice_type','Factura','cliente_id','dd280200-0000-4000-8000-000000000001','currency','HNL','fiscal_mode','Exenta','issue_date',current_date) invoice,
 '[{"source_editor_item_id":"bl","description":"BL cortesia","quantity":1,"unit_price":50,"isv_rate":0,"sort_order":0},{"source_editor_item_id":"freight","description":"Flete","quantity":2,"unit_price":100,"isv_rate":0,"sort_order":1}]'::jsonb items,
 '{"items":[{"id":"bl"},{"id":"freight"}]}'::jsonb editor;
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000001',0,gen_random_uuid(),(select invoice from payload),(select items from payload),(select editor from payload));
create temp table requested as select (public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000001',1,'bl','Inconveniente con el BL')->>'id')::uuid id;
reset role;
select pg_temp.assert_true((select count(*)=1 from public.notifications where user_id='dd280000-0000-4000-8000-000000000002' and title='Cortesia pendiente de aprobacion'),'Revisor recibe aviso inmediato');
set local role authenticated;
select public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000001',1,'bl','Inconveniente con el BL');
select pg_temp.assert_true((select count(*)=1 from public.invoice_courtesy_requests),'Solicitud idempotente');
select pg_temp.assert_true((select (line_snapshot->>'total')::numeric=50 and (line_snapshot->>'tax_amount')::numeric=0 from public.invoice_courtesy_requests where id=(select id from requested)),'Snapshot del importe fiscal revisado');
select pg_temp.expect_error($q$select public.review_invoice_courtesy((select id from requested),'Aprobar','Auto aprobacion')$q$,'autorizador');
select pg_temp.expect_error($q$update public.invoice_courtesy_requests set status='Aprobada'$q$,'permission denied');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.review_invoice_courtesy((select id from requested),'Aprobar','Gerencia autoriza el BL');
select pg_temp.assert_true((select count(*)=0 from public.accounting_alert_events where active and kind='courtesy'),'Decision resuelve aviso del revisor');
select public.review_invoice_courtesy((select id from requested),'Aprobar','Gerencia autoriza el BL');
select pg_temp.assert_true((public.get_invoice_courtesies('dd280400-0000-4000-8000-000000000001')->'requests'->0->>'approval_effective')::boolean,'Aprobacion efectiva');
select pg_temp.assert_true((select next_number=(select next_number from before_counter) from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001'),'Pedir y aprobar no consume numeracion');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
create temp table issued as select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000001',1);
select pg_temp.assert_true((select total=200 from public.invoices where id=(select invoice_id from issued)),'Solo el flete se factura');
select pg_temp.assert_true((select count(*)=1 and min(sort_order)=0 and min(description)='Flete' from public.invoice_items where invoice_id=(select invoice_id from issued)),'Orden continuo tras cortesia manual');
select pg_temp.assert_true((select status='Aplicada' and invoice_id=(select invoice_id from issued) from public.invoice_courtesy_requests where id=(select id from requested)),'Aplicacion auditada');
select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000001',1);
select pg_temp.assert_true((select count(*)=1 from public.invoices),'Emision idempotente');
select pg_temp.expect_error($q$select public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000001',1,'freight','Documento emitido')$q$,'no disponible');
select pg_temp.expect_error($q$select * from public.create_manual_invoice_with_items((select invoice from payload),'[{"description":"Descuento total","quantity":1,"unit_price":50,"discount_amount":50,"isv_rate":0},{"description":"Otro","quantity":1,"unit_price":10,"isv_rate":0}]')$q$,'descuento completo');
-- Guardar cambios invalida la aprobacion, sin alterar la factura anterior.
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000002',0,gen_random_uuid(),(select invoice from payload),(select items from payload),(select editor from payload));
create temp table stale as select (public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000002',1,'bl','Segundo caso de cortesia')->>'id')::uuid id;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.review_invoice_courtesy((select id from stale),'Aprobar','Aprobada segunda cortesia');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000002',1,gen_random_uuid(),(select invoice from payload),(select items from payload),(select editor||'{"notes":"Cambio"}'::jsonb from payload));
select pg_temp.assert_true((select status='Revocada' from public.invoice_courtesy_requests where id=(select id from stale)),'Nueva revision invalida decision');
select pg_temp.expect_error($q$select public.review_invoice_courtesy((select id from stale),'Aprobar','No se puede renovar')$q$,'cambio');
create temp table self_request as select (public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000002',2,'bl','Solicitud del mismo master')->>'id')::uuid id;
select pg_temp.expect_error($q$select public.review_invoice_courtesy((select id from self_request),'Aprobar','Auto aprobacion master')$q$,'Otra persona');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_invoice_courtesy_approver('dd280000-0000-4000-8000-000000000001',true,'Autorizador para revision independiente');
select public.review_invoice_courtesy((select id from self_request),'Rechazar','No procede la cortesia solicitada');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
create temp table rejected_invoice as select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000002',2);
select pg_temp.assert_true((select total=250 from public.invoices where id=(select invoice_id from rejected_invoice)),'Rechazo conserva ambos conceptos facturables');
select pg_temp.assert_true((select status='Rechazada' from public.invoice_courtesy_requests where id=(select id from self_request)),'Rechazo permanece auditado tras emitir');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.invoice_courtesy_requests),'RLS otra empresa');
select pg_temp.assert_true((public.get_invoice_courtesies()->>'total')::int=0,'RPC otra empresa');
select pg_temp.expect_error($q$select public.review_invoice_courtesy((select id from self_request),'Aprobar','Ajeno al tenant')$q$,'no disponible');
select set_config('request.jwt.claims','{}',true);
reset role;
-- Fixture de una cotizacion previamente conciliada; no se prueba aqui el cierre operativo.
set local session_replication_role=replica;
insert into public.quotations(id,cliente_id,created_by,tenant_id,status,financial_validation_status,service_product,quote_type,tipo_transporte)
values('dd280800-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000002','dd280000-0000-4000-8000-000000000100','Ganada','Validado','other_origin_fcl','FCL','Marítimo');
insert into public.pricing_items(id,quotation_id,tenant_id,description,item_type,quantity,cost_amount,sale_amount,total_amount,currency,taxable,tax_rate)
select ('dd280900-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'dd280800-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','Concepto '||n,'Flete',1,25,n*100,n*100,'HNL',true,15 from generate_series(1,3)n;
insert into public.shipping_instructions(id,tenant_id,routing_number,quotation_id,client_id,created_by)
values('dd281000-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','TEST-COURTESY-SI','dd280800-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000002');
insert into public.shipments(id,tenant_id,shipment_number,quotation_id,shipping_instruction_id,client_id,operational_status,closed_at)
values('dd281100-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','TEST-COURTESY-SHIP','dd280800-0000-4000-8000-000000000001','dd281000-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','Finalizado',now());
insert into public.accounting_accounts(id,tenant_id,code,name,kind,postable,active,account_level) values('dd281200-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','4199001','Ingreso de flete ficticio','Ingreso',true,true,'Auxiliar');
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000003',0,gen_random_uuid(),(select invoice||'{"fiscal_mode":"Gravada","line_accounts":{"dd280900-0000-4000-8000-000000000003":"dd281200-0000-4000-8000-000000000001"}}' from payload),'[]','{}','dd280800-0000-4000-8000-000000000001');
create temp table quoted_request as select (public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000003',1,'dd280900-0000-4000-8000-000000000002','Cortesia de linea intermedia')->>'id')::uuid id;
select pg_temp.assert_true((select (line_snapshot->>'total')::numeric=230 and (line_snapshot->>'tax_amount')::numeric=30 from public.invoice_courtesy_requests where id=(select id from quoted_request)),'Revision incluye ISV del concepto');
select pg_temp.expect_error($q$select * from public.create_invoice_with_items((select invoice||'{"quotation_id":"dd280800-0000-4000-8000-000000000001","fiscal_mode":"Gravada"}' from payload),'[{"source_pricing_item_id":"dd280900-0000-4000-8000-000000000001","description":"Concepto 1","quantity":1,"unit_price":100,"isv_rate":15}]')$q$,'permission denied');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.review_invoice_courtesy((select id from quoted_request),'Aprobar','Gerencia autoriza concepto intermedio');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
create temp table quoted_invoice as select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000003',1);
select pg_temp.assert_true((select total=460 and tax_amount=60 from public.invoices where id=(select invoice_id from quoted_invoice)),'Impuesto solo sobre las lineas facturadas');
select pg_temp.assert_true((select count(*)=2 and min(sort_order)=0 and max(sort_order)=1 from public.invoice_items where invoice_id=(select invoice_id from quoted_invoice)),'Orden continuo tras omitir linea intermedia');
select pg_temp.assert_true((select source_pricing_item_id='dd280900-0000-4000-8000-000000000003'::uuid and description='Concepto 3' from public.invoice_items where invoice_id=(select invoice_id from quoted_invoice) and sort_order=1),'Preserva origen de linea desplazada');
select pg_temp.assert_true((select income_account_id='dd281200-0000-4000-8000-000000000001'::uuid from public.invoice_items where invoice_id=(select invoice_id from quoted_invoice) and sort_order=1),'Preserva cuenta contable de linea desplazada');
select pg_temp.assert_true(not exists(select 1 from public.get_billing_work_queue() where quotation_id='dd280800-0000-4000-8000-000000000001'),'Factura emitida resuelve listo para facturar');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000004',0,gen_random_uuid(),(select invoice from payload),(select items from payload),(select editor from payload));
create temp table revoked_authority as select (public.request_invoice_courtesy('dd280400-0000-4000-8000-000000000004',1,'bl','Caso sujeto a permiso vigente')->>'id')::uuid id;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.review_invoice_courtesy((select id from revoked_authority),'Aprobar','Aprobacion antes de cambio master');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_invoice_master('dd280000-0000-4000-8000-000000000001','Nuevo master de prueba');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.expect_error($q$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000004',1)$q$,'ya no es vigente');
reset role;
select pg_temp.assert_true((select count(*)=3 and sum(sale_amount)=600 from public.pricing_items where quotation_id='dd280800-0000-4000-8000-000000000001'),'Cotizacion original intacta');
select pg_temp.assert_true(not has_function_privilege('anon','public.request_invoice_courtesy(uuid,integer,text,text)','EXECUTE'),'Anon bloqueado');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.invoice_courtesy_exclusions_internal(jsonb,uuid)','EXECUTE'),'Helper privado');
rollback;

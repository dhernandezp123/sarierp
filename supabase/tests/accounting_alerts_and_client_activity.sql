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
create temp table before_counter as select next_number from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);


create temp table payload as select jsonb_build_object('invoice_type','Factura','cliente_id','dd280200-0000-4000-8000-000000000001','currency','HNL','fiscal_mode','Exenta','issue_date',current_date,'due_date',current_date+3) invoice;
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000001',0,gen_random_uuid(),(select invoice from payload),'[{"description":"Servicio ficticio","quantity":1,"unit_price":100,"isv_rate":0}]','{}');
create temp table issued as select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000001',1);
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=0,'Empresa sin activacion explicita no recibe avisos');
select pg_temp.expect_error($q$select public.process_accounting_alerts()$q$,'permission denied');
select pg_temp.expect_error($q$select public.save_accounting_alert_settings(0,'{}','No tiene permiso')$q$,'Solo Administracion');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_accounting_alert_settings(0,'{"internal_enabled":true,"portal_enabled":false,"email_enabled":false,"before_days":[7,3,0],"overdue_days":7,"inactivity_days":[30,60,90]}','Configuracion inicial controlada');
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=1,'Activacion explicita habilita avisos internos');
select pg_temp.expect_error($q$select public.save_accounting_alert_settings(0,'{"internal_enabled":true,"portal_enabled":false,"email_enabled":false,"before_days":[7,3,0],"overdue_days":7,"inactivity_days":[30,60,90]}','Revision obsoleta')$q$,'cambio');
select pg_temp.expect_error($q$select public.save_accounting_alert_settings(1,'{"internal_enabled":true,"portal_enabled":false,"email_enabled":false,"before_days":[-1],"overdue_days":0,"inactivity_days":[30]}','Intervalos invalidos')$q$,'intervalos');
select set_config('request.jwt.claims','{}',true);reset role;
update public.platform_environment set environment='production',verified_at=now(),verified_by='GOV alerts isolated rollback test';
update public.clientes set email_1='Collect@Test.Local',email_2='collect@test.local' where id='dd280200-0000-4000-8000-000000000001';
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('dd280000-0000-4000-8000-000000000005','authenticated','authenticated','portal-collect@test.local','{}');
update public.profiles set tenant_id='dd280000-0000-4000-8000-000000000100',rol='Cliente',status='Aprobado',is_active=true,cliente_id='dd280200-0000-4000-8000-000000000001' where id='dd280000-0000-4000-8000-000000000005';
select public.process_accounting_alerts();
select pg_temp.assert_true((select count(*)=3 from public.accounting_alert_events where kind='due'),'Admin, master y Finanzas notificados');
select pg_temp.assert_true((select count(*)=0 from public.accounting_customer_reminders),'Correo desactivado por defecto');
select pg_temp.assert_true((select count(*)=0 from public.accounting_portal_reminders),'Portal desactivado por defecto');
create temp table notification_count as select count(*) n from public.notifications;
select public.process_accounting_alerts();
select pg_temp.assert_true((select count(*)=(select n from notification_count) from public.notifications),'Scheduler idempotente');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.save_collections_contacts('dd280200-0000-4000-8000-000000000001',0,array['email_1','email_2'],true,'Seleccion explicita de contactos');
select pg_temp.assert_true((select cardinality(approved_emails)=1 from public.collections_contact_preferences),'Correos duplicados normalizados');
select public.save_accounting_alert_settings(1,'{"internal_enabled":true,"portal_enabled":true,"email_enabled":true,"before_days":[7,3,0],"overdue_days":7,"inactivity_days":[30,60,90]}','Canales de prueba con datos ficticios');
select set_config('request.jwt.claims','{}',true);reset role;
select public.process_accounting_alerts();
select public.process_accounting_alerts();
select pg_temp.assert_true((select count(*)=1 from public.accounting_customer_reminders),'Un solo correo en cola, sin transporte');
select pg_temp.assert_true((select count(*)=1 from public.accounting_portal_reminders),'Una notificacion de portal por etapa');
select pg_temp.assert_true(public.get_accounting_email_dispatch((select id from public.accounting_customer_reminders))->>'balance'='100.00','Revalida saldo al entregar');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_portal_invoice_balance((select invoice_id from issued))->>'balance')::numeric=100,'Portal consulta solo su saldo');
select pg_temp.expect_error($q$select public.get_client_activity()$q$,'Sin permiso');
select pg_temp.expect_error($q$select public.get_accounting_alerts()$q$,'Sin permiso');
select pg_temp.expect_error($q$select public.get_portal_invoice_balance(gen_random_uuid())$q$,'no disponible');
select set_config('request.jwt.claims','{}',true);reset role;
update public.clientes set email_1='new@test.local',email_2=null where id='dd280200-0000-4000-8000-000000000001';
select pg_temp.assert_true(public.get_accounting_email_dispatch((select id from public.accounting_customer_reminders)) is null,'Correo cambiado no hereda opt-in');
select public.process_accounting_alerts();
select pg_temp.assert_true((select status='skipped' and attempts=0 from public.accounting_customer_reminders),'Cancela correo pendiente obsoleto');
-- Fechas y etapas, incluidos dos dias consecutivos vencidos dentro de la misma semana.
select pg_temp.assert_true(public.accounting_due_stage_internal(current_date+3,current_date,array[7,3,0],7)=((current_date+3)::text||':before:3'),'Etapa tres dias');
select pg_temp.assert_true(public.accounting_due_stage_internal(current_date+8,current_date,array[7,3,0],7) is null,'Fuera del horizonte');
select pg_temp.assert_true(public.accounting_due_stage_internal(current_date,current_date,array[7,3,0],7)=(current_date::text||':before:0'),'Dia de vencimiento');
select pg_temp.assert_true(public.accounting_due_stage_internal(current_date-1,current_date,array[7,3,0],7)=public.accounting_due_stage_internal(current_date-1,current_date+5,array[7,3,0],7),'No repite durante la semana');
select pg_temp.assert_true(public.accounting_due_stage_internal(current_date-1,current_date,array[7,3,0],7)<>public.accounting_due_stage_internal(current_date-1,current_date+7,array[7,3,0],7),'Nueva etapa semanal');
-- La consulta privada de billing conserva la clasificacion canonica.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.get_billing_work_queue()),'Cola canonica vacia despues de factura manual sin cotizacion');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=0,'No filtra avisos ajenos');
select pg_temp.assert_true((select count(*)=0 from public.accounting_alert_settings),'RLS configuracion de otra empresa');
select pg_temp.expect_error($q$select public.get_portal_invoice_balance((select invoice_id from issued))$q$,'Sin permiso');
reset role;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.accounting_document_balances_internal(uuid)','EXECUTE'),'Saldo privado no invocable');
select pg_temp.assert_true(not has_function_privilege('anon','public.get_accounting_alerts(integer,integer)','EXECUTE'),'Anon bloqueado');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.accounting_customer_reminders','INSERT'),'Outbox solo servidor');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.register_customer_receipt(gen_random_uuid(),'dd280200-0000-4000-8000-000000000001',30,'HNL',current_date,'Transferencia','TEST-PARTIAL','',jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from issued),'amount',30)));
select pg_temp.assert_true((public.get_accounting_alerts()->'rows'->0->>'body') like '%70.00','Pago parcial actualiza saldo comunicado');
select public.register_customer_receipt(gen_random_uuid(),'dd280200-0000-4000-8000-000000000001',70,'HNL',current_date,'Transferencia','TEST-FINAL','',jsonb_build_array(jsonb_build_object('document_id',(select invoice_id from issued),'amount',70)));
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=0,'Pago completo resuelve aviso en vivo');
select set_config('request.jwt.claims','{}',true);reset role;
select public.process_accounting_alerts();
select pg_temp.assert_true((select count(*)=0 from public.accounting_alert_events where active),'Scheduler resuelve avisos liquidados');
select pg_temp.assert_true((select bool_and(n.is_read) from public.notifications n join public.accounting_alert_events a on a.notification_id=n.id),'Badge de avisos resueltos actualizado');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('dd280000-0000-4000-8000-000000000006','authenticated','authenticated','seller-activity@test.local','{}');
update public.profiles set tenant_id='dd280000-0000-4000-8000-000000000100',rol='Ventas',status='Aprobado',is_active=true where id='dd280000-0000-4000-8000-000000000006';
insert into public.clientes(id,tenant_id,nombre,vendedor_asignado,created_at) values('dd280200-0000-4000-8000-000000000002','dd280000-0000-4000-8000-000000000100','Cliente inactivo ficticio','dd280000-0000-4000-8000-000000000006',now()-interval '100 days');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_client_activity()->>'total')::int=1 and (public.get_client_activity()->'rows'->0->>'inactivity_days')::int=100,'Ventas solo ve actividad de su cartera');
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=1,'Vendedor recibe alerta de cliente inactivo');
select set_config('request.jwt.claims','{}',true);reset role;
update public.clientes set nombre=nombre||' editado' where id='dd280200-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_client_activity()->'rows'->0->>'inactivity_days')::int=100,'Editar perfil no reinicia inactividad');
select set_config('request.jwt.claims','{}',true);reset role;
insert into public.quotations(cliente_id,tenant_id,created_by,status,service_product,quote_type,tipo_transporte) values('dd280200-0000-4000-8000-000000000002','dd280000-0000-4000-8000-000000000100','dd280000-0000-4000-8000-000000000006','Borrador','other_origin_fcl','FCL','Marítimo');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_client_activity()->'rows'->0->>'inactivity_days')::int=0,'Cotizar reinicia actividad comercial');
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=0,'Cotizar resuelve alerta comercial');
select set_config('request.jwt.claims','{}',true);reset role;
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('dd280000-0000-4000-8000-000000000007','authenticated','authenticated','operations-alert@test.local','{}');
update public.profiles set tenant_id='dd280000-0000-4000-8000-000000000100',rol='Operaciones',status='Aprobado',is_active=true where id='dd280000-0000-4000-8000-000000000007';
-- Fixture operativo cerrado/conciliado; los candidatos usan la cola canonica real.
set local session_replication_role=replica;
insert into public.quotations(id,cliente_id,created_by,tenant_id,status,financial_validation_status,service_product,quote_type,tipo_transporte)
values('dd280800-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000002','dd280000-0000-4000-8000-000000000100','Ganada','Validado','other_origin_fcl','FCL','Marítimo');
insert into public.pricing_items(id,quotation_id,tenant_id,description,item_type,quantity,cost_amount,sale_amount,total_amount,currency,taxable,tax_rate)
values('dd280900-0000-4000-8000-000000000001','dd280800-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','Flete de prueba','Flete',1,50,100,100,'HNL',false,0);
insert into public.shipping_instructions(id,tenant_id,routing_number,quotation_id,client_id,created_by)
values('dd281000-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','TEST-ALERT-SI','dd280800-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000002');
insert into public.shipments(id,tenant_id,shipment_number,quotation_id,shipping_instruction_id,client_id,operational_status,closed_at,assigned_to)
values('dd281100-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','TEST-ALERT-SHIP','dd280800-0000-4000-8000-000000000001','dd281000-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','Finalizado',now(),'dd280000-0000-4000-8000-000000000007');
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true((select readiness_code='READY_TO_INVOICE' from public.get_billing_work_queue() where quotation_id='dd280800-0000-4000-8000-000000000001'),'Cola canonica conserva listo para facturar');
select pg_temp.assert_true((public.get_accounting_alerts()->'rows'->0->>'kind')='ready','Contabilidad recibe embarque listo');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=1,'Operaciones recibe solo embarque asignado');
select set_config('request.jwt.claims','{}',true);reset role;
set local session_replication_role=replica;
update public.shipments set closed_at=null where id='dd281100-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select pg_temp.assert_true((public.get_accounting_alerts()->>'total')::int=0,'Retirar cierre resuelve alerta de listo');
rollback;

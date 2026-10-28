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
select pg_temp.assert_true(not public.is_invoice_master(),'Admin no es master por defecto');
select pg_temp.expect_error($c$select public.set_invoice_master('dd280000-0000-4000-8000-000000000004','Ajeno')$c$,'esta empresa');
select public.set_invoice_master('dd280000-0000-4000-8000-000000000002','Designación de prueba');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.cai_ranges(id,cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values('dd280300-0000-4000-8000-000000000001','TEST-DRAFT-CAI','SPS','Factura','001-001-01-00000001','001-001-01-00000100',current_date+30,false,null);
select public.activate_cai_range('dd280300-0000-4000-8000-000000000001');
create temp table before_counter as select next_number from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.expect_error($c$select public.set_invoice_master('dd280000-0000-4000-8000-000000000003','Autoasignación')$c$,'Solo Administración');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000001',0,'dd280500-0000-4000-8000-000000000001','{"invoice_type":"Factura"}','[]','{}');
select pg_temp.assert_true((select next_number=(select next_number from before_counter) from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001'),'Borrador incompleto no consume CAI');
select pg_temp.assert_true((select count(*)=0 from public.invoices),'Borrador no crea factura ni saldo');
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000001',1)$c$,'fecha de emisión');
select pg_temp.expect_error($c$update public.invoice_drafts set invoice_payload='{}'$c$,'permission denied');
select pg_temp.expect_error($c$insert into public.invoice_master_settings(tenant_id,profile_id,assigned_by) values('dd280000-0000-4000-8000-000000000100','dd280000-0000-4000-8000-000000000003','dd280000-0000-4000-8000-000000000003')$c$,'permission denied');
create temp table payload as select jsonb_build_object('invoice_type','Factura','cliente_id','dd280200-0000-4000-8000-000000000001','currency','HNL','fiscal_mode','Exenta','issue_date',current_date) invoice,
 '[{"description":"Servicio de prueba","quantity":1,"unit_price":100,"isv_rate":0}]'::jsonb items;
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000001',1,'dd280500-0000-4000-8000-000000000002',(select invoice from payload),(select items from payload),'{}');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000001',1,'dd280500-0000-4000-8000-000000000002',(select invoice from payload),(select items from payload),'{}');
select pg_temp.assert_true((select revision=2 from public.invoice_drafts where id='dd280400-0000-4000-8000-000000000001'),'Reintento no duplica revisión');
select pg_temp.expect_error($c$select public.save_invoice_draft('dd280400-0000-4000-8000-000000000001',1,'dd280500-0000-4000-8000-000000000003',(select invoice from payload),(select items from payload),'{}')$c$,'cambió');
create temp table issued as select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000001',2);
select pg_temp.assert_true((select i.status='Aprobada' and i.total=100 and i.invoice_number='001-001-01-00000001' from public.invoices i where i.id=(select invoice_id from issued)),'Emisión valida, asigna CAI y estado final');
select pg_temp.assert_true((select count(*)=1 and max(balance)=100 from public.invoice_receivables where invoice_id=(select invoice_id from issued)),'Solo emisión genera saldo');
select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000001',2);
select pg_temp.assert_true((select count(*)=1 from public.invoices),'Doble emisión idempotente');
select pg_temp.expect_error($c$update public.invoices set notes='Edición directa' where id=(select invoice_id from issued)$c$,'corrección aprobada');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000002',0,'dd280500-0000-4000-8000-000000000004',(select invoice from payload),'[{"description":"Servicio corregido","quantity":2,"unit_price":100,"isv_rate":0}]','{}',null,(select invoice_id from issued));
select public.submit_invoice_correction('dd280400-0000-4000-8000-000000000002',1,'Cantidad corregida');
select pg_temp.expect_error($c$select public.review_invoice_correction('dd280400-0000-4000-8000-000000000002',1,true,'Sin permiso')$c$,'Solo el usuario master');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(public.is_invoice_master(),'Master designado autorizado');
select public.review_invoice_correction('dd280400-0000-4000-8000-000000000002',1,true,'Revisión aprobada');
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000002',1)$c$,'anulación del original');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000002',1,'dd280500-0000-4000-8000-000000000005',(select invoice from payload),'[{"description":"Servicio corregido","quantity":2,"unit_price":100,"isv_rate":0}]','{"changed":true}',null,(select invoice_id from issued));
select pg_temp.assert_true((select status='Borrador' and reviewed_revision is null from public.invoice_drafts where id='dd280400-0000-4000-8000-000000000002'),'Editar invalida aprobación');
select public.submit_invoice_correction('dd280400-0000-4000-8000-000000000002',2,'Cantidad confirmada');
select public.review_invoice_correction('dd280400-0000-4000-8000-000000000002',2,true,'Confirmación final');
update public.clientes set rtn='08019999123457' where id='dd280200-0000-4000-8000-000000000001';
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000002',2)$c$,'datos del cliente o emisor cambiaron');
update public.clientes set rtn='08019999123456' where id='dd280200-0000-4000-8000-000000000001';
create temp table void_request as select public.request_fiscal_void('invoices',(select invoice_id from issued),'dd280500-0000-4000-8000-000000000006','Corrección aprobada del documento') id;
select public.review_fiscal_void((select id from void_request),true,'Original y copia resguardados',true);
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000002',2)$c$,'Solo el usuario master');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
create temp table replacement as select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000002',2);
select pg_temp.assert_true((select total=200 and invoice_number='001-001-01-00000002' and correction_reference->>'invoice_id'=(select invoice_id::text from issued) from public.invoices where id=(select invoice_id from replacement)),'Sustitución con nuevo correlativo y referencia');
select pg_temp.assert_true((select status='Anulada' and total=100 and notes is null from public.invoices where id=(select invoice_id from issued)),'Original permanece íntegro');
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000003',0,'dd280500-0000-4000-8000-000000000007',(select invoice||'{"currency":"USD","exchange_rate":null}'::jsonb from payload),(select items from payload),'{}');
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000003',1)$c$,'tipo de cambio USD');
reset role;
insert into public.quotations(id,cliente_id,created_by,tenant_id,status,financial_validation_status,service_product,quote_type,tipo_transporte)
values('dd280800-0000-4000-8000-000000000001','dd280200-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000002','dd280000-0000-4000-8000-000000000100','Ganada','Pendiente','other_origin_fcl','FCL','Marítimo');
insert into public.pricing_items(id,quotation_id,tenant_id,description,item_type,quantity,cost_amount,sale_amount,total_amount,currency,taxable,tax_rate)
values('dd280900-0000-4000-8000-000000000001','dd280800-0000-4000-8000-000000000001','dd280000-0000-4000-8000-000000000100','Flete de prueba','Flete',1,50,100,100,'HNL',false,0);
set local role authenticated;
select public.save_invoice_draft('dd280400-0000-4000-8000-000000000004',0,'dd280500-0000-4000-8000-000000000008',(select invoice from payload),(select items from payload),'{}','dd280800-0000-4000-8000-000000000001');
create temp table after_numbers as select next_number from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001';
reset role;
update public.pricing_items set sale_amount=120,total_amount=120 where id='dd280900-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000004',1)$c$,'cotización cambiaron');
select pg_temp.assert_true((select next_number=(select next_number from after_numbers) from public.cai_ranges where id='dd280300-0000-4000-8000-000000000001'),'Emisión fallida por tarifa obsoleta no consume CAI');
select pg_temp.expect_error($c$update public.invoice_workflow_events set action='Alteración'$c$,'permission denied');
select pg_temp.assert_true((select count(*)>=8 from public.invoice_workflow_events),'Auditoría de revisiones y decisiones');
select set_config('request.jwt.claims','{"sub":"dd280000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true(not public.is_invoice_master() and (select count(*)=0 from public.invoice_drafts) and (select count(*)=0 from public.invoice_workflow_events),'Aislamiento tenant');
select pg_temp.expect_error($c$select * from public.issue_invoice_draft('dd280400-0000-4000-8000-000000000002',2)$c$,'no disponible');
select pg_temp.assert_true(not has_function_privilege('anon','public.issue_invoice_draft(uuid,integer)','execute'),'Emisión no anónima');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.invoice_workflow_event_internal(uuid,text,text,jsonb)','execute'),'Auditoría interna no invocable');
rollback;

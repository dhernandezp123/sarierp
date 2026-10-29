\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
insert into public.tenants(id,slug,name) values('ca280000-0000-4000-8000-000000000100','cai-master28','Empresa ficticia'),('ca280000-0000-4000-8000-000000000200','cai-master28-other','Otra empresa ficticia');
insert into auth.users(id,aud,role,email,raw_user_meta_data) select ('ca280000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','cai-master-'||n||'@test.local','{}'::jsonb from generate_series(1,4) n;
update public.profiles set rol=case when right(id::text,1)='3' then 'Admin'::public.user_role else 'Contabilidad'::public.user_role end,status='Aprobado',is_active=true,
 tenant_id=case when right(id::text,1)='4' then 'ca280000-0000-4000-8000-000000000200'::uuid else 'ca280000-0000-4000-8000-000000000100'::uuid end where id::text like 'ca280000-%';
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) values('ca280000-0000-4000-8000-000000000100','ca280000-0000-4000-8000-000000000001','Despliegue autorizado'),('ca280000-0000-4000-8000-000000000200','ca280000-0000-4000-8000-000000000004','Despliegue autorizado');
insert into public.company_settings(tenant_id,legal_name,rtn,address,billing_points_of_sale) values('ca280000-0000-4000-8000-000000000100','Empresa ficticia','08019999123456','Domicilio ficticio',array['SPS','TGU']);
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values
 ('ca280100-0000-4000-8000-000000000001','ca280000-0000-4000-8000-000000000100','SPS','Domicilio SPS','00000000','sps@test.local','001','001'),
 ('ca280100-0000-4000-8000-000000000002','ca280000-0000-4000-8000-000000000100','TGU','Domicilio TGU','00000000','tgu@test.local','002','001');
insert into public.billing_offices(id,tenant_id,name,establishment_code,emission_point_code) values('ca280100-0000-4000-8000-000000000099','ca280000-0000-4000-8000-000000000200','Ajena','099','001');
insert into public.clientes(id,nombre,rtn,condicion_pago,tenant_id,billing_office_id) values
 ('ca280200-0000-4000-8000-000000000001','Cliente SPS','08019999123456','Contado','ca280000-0000-4000-8000-000000000100','ca280100-0000-4000-8000-000000000001'),
 ('ca280200-0000-4000-8000-000000000002','Cliente TGU','08019999123456','Contado','ca280000-0000-4000-8000-000000000100','ca280100-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temp table ranges(office text,id uuid,payload jsonb);
insert into ranges select o.name,public.save_cai_range(null,0,v.payload,'Autorización ficticia ingresada con fecha errónea'),v.payload from public.billing_offices o
 cross join lateral (select jsonb_build_object('cai','TEST-MASTER-'||o.name,'point_of_sale',o.name,'document_type','Factura','rango_desde',o.establishment_code||'-001-01-00000001','rango_hasta',o.establishment_code||'-001-01-00000100','fecha_limite_emision','2017-08-20') payload) v;
select pg_temp.expect_error($c$select public.set_cai_range_active((select id from ranges where office='SPS'),1,true,'Intento vencido')$c$,'vencido');
select public.save_cai_range(r.id,c.revision,r.payload||'{"fecha_limite_emision":"2099-08-20"}','Corrección documentada de fecha de digitación') from ranges r join public.cai_ranges c on c.id=r.id;
select pg_temp.assert_true((select bool_and(fecha_limite_emision='2099-08-20' and next_number=1 and not is_active) from public.cai_ranges),'Corregir fecha no activa ni consume numeración');
select pg_temp.expect_error($c$select public.save_cai_range((select id from ranges where office='SPS'),1,(select payload from ranges where office='SPS'),'Formulario antiguo')$c$,'cambió');
select public.set_cai_range_active(id,revision,true,'Habilitar serie corregida') from public.cai_ranges;
select pg_temp.assert_true((select count(*)=2 from public.cai_ranges where is_active),'Dos oficinas activas simultáneas');
-- Accounting without the personal assignment cannot manage CAI; Admin can.
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(not public.is_invoice_master(),'Contabilidad no es master por rol');
select pg_temp.expect_error($c$select public.save_cai_range(null,0,'{}','Intento ajeno')$c$,'máster');
select pg_temp.expect_error($c$select public.set_cai_range_active((select id from ranges where office='SPS'),3,false,'Intento')$c$,'máster');
select pg_temp.expect_error($c$select public.activate_cai_range((select id from ranges where office='SPS'))$c$,'máster');
select pg_temp.expect_error($c$insert into public.cai_ranges(cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision) values('FORBIDDEN','SPS','Factura','001-001-01-00000101','001-001-01-00000200','2099-08-20')$c$,'row-level security');
update public.cai_ranges set fecha_limite_emision='2099-08-21';
select pg_temp.assert_true((select bool_and(fecha_limite_emision='2099-08-20') from public.cai_ranges),'UPDATE directo sin master afecta cero filas');
select pg_temp.expect_error($c$delete from public.cai_ranges$c$,'permission denied');
select pg_temp.expect_error($c$select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000002',0,'{}','Autoasignación')$c$,'máster');
-- Denied issuance rolls back the counter and the accounting/cash side effects.
select pg_temp.expect_error($c$select * from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"ca280200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exenta"}','[{"description":"Servicio ficticio","quantity":1,"unit_price":100,"isv_rate":0}]')$c$,'autorización');
select pg_temp.assert_true((select count(*)=0 from public.invoices) and (select bool_and(next_number=1) from public.cai_ranges),'Bloqueo sin documento ni consumo de correlativo');
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true(public.is_invoice_master(),'Admin tiene autoridad fiscal en su empresa');
select public.set_cai_range_active(c.id,c.revision,false,'Admin desactiva con auditoria') from public.cai_ranges c join ranges r on r.id=c.id where r.office='SPS';
select pg_temp.assert_true((select not is_active from public.cai_ranges where point_of_sale='SPS'),'Admin puede desactivar');
select public.set_cai_range_active(c.id,c.revision,true,'Admin reactiva con auditoria') from public.cai_ranges c join ranges r on r.id=c.id where r.office='SPS';
select pg_temp.assert_true((select is_active from public.cai_ranges where point_of_sale='SPS'),'Admin puede reactivar');
insert into public.proveedores(id,nombre,tipo,moneda,terminos_pago) values('ca280400-0000-4000-8000-000000000001','Proveedor ficticio Admin','Otro','HNL',0);
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.proveedores set telefono='99990000' where id='ca280400-0000-4000-8000-000000000001';
select pg_temp.assert_true((select telefono='99990000' from public.proveedores where id='ca280400-0000-4000-8000-000000000001'),'Master Contabilidad puede modificar proveedores');
select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000002',0,array['ca280100-0000-4000-8000-000000000001']::uuid[],'Apoyo autorizado para SPS');
select pg_temp.expect_error($c$select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000002',0,'{}','Versión obsoleta')$c$,'cambiaron');
select pg_temp.expect_error($c$select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000004',0,'{}','Usuario ajeno')$c$,'esta empresa');
select pg_temp.expect_error($c$select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000002',1,array['ca280100-0000-4000-8000-000000000099']::uuid[],'Oficina ajena')$c$,'no pertenece');
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(public.can_issue_from_office('ca280100-0000-4000-8000-000000000001') and not public.can_issue_from_office('ca280100-0000-4000-8000-000000000002'),'Autorización individual para SPS, no TGU');
create temp table issued as select * from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"ca280200-0000-4000-8000-000000000001","currency":"HNL","fiscal_mode":"Exenta"}','[{"description":"Apoyo SPS","quantity":1,"unit_price":100,"isv_rate":0}]');
select pg_temp.expect_error($c$select * from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"ca280200-0000-4000-8000-000000000002","currency":"HNL","fiscal_mode":"Exenta"}','[{"description":"TGU sin permiso","quantity":1,"unit_price":100,"isv_rate":0}]')$c$,'autorización');
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000002',1,array['ca280100-0000-4000-8000-000000000001','ca280100-0000-4000-8000-000000000002']::uuid[],'Apoyo entre ambas sedes');
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into issued select * from public.create_manual_invoice_with_items('{"invoice_type":"Factura","cliente_id":"ca280200-0000-4000-8000-000000000002","currency":"HNL","fiscal_mode":"Exenta"}','[{"description":"Apoyo TGU","quantity":1,"unit_price":100,"isv_rate":0}]');
select pg_temp.assert_true((select array_agg(invoice_number order by invoice_number)=array['001-001-01-00000001','002-001-01-00000001'] from issued),'Mismo usuario apoya ambas oficinas, cada cliente conserva su serie');
select pg_temp.assert_true((select bool_and(ever_used and next_number=2) from public.cai_ranges),'Ambos consumos se conservan separados');
-- Corrections preserve the issued snapshot and the consumed serial.
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temp table invoice_before as select to_jsonb(i) data from public.invoices i;
select public.save_cai_range(c.id,c.revision,r.payload||'{"fecha_limite_emision":"2099-12-31","rango_hasta":"001-001-01-00000200","next_number":"1"}','Corregir fecha y rango con autorización') from public.cai_ranges c join ranges r on r.id=c.id where r.office='SPS';
select pg_temp.assert_true((select next_number=2 and range_end=200 from public.cai_ranges where point_of_sale='SPS'),'Editar rango no retrocede próximo correlativo');
select pg_temp.assert_true(not exists((select data from invoice_before) except (select to_jsonb(i) from public.invoices i)),'Snapshots de documentos emitidos permanecen idénticos');
select pg_temp.expect_error($c$select public.save_cai_range(c.id,c.revision,r.payload||'{"cai":"OTRO-CAI","fecha_limite_emision":"2099-12-31"}','Cambio indebido') from public.cai_ranges c join ranges r on r.id=c.id where r.office='SPS'$c$,'números utilizados');
select pg_temp.expect_error($c$update public.cai_ranges set next_number=1 where point_of_sale='SPS'$c$,'permission denied');
select pg_temp.expect_error($c$update public.cai_ranges set rango_desde='001-001-01-00000002' where point_of_sale='SPS'$c$,'números utilizados');
select public.set_cai_range_active(id,revision,false,'Retirar serie de uso') from public.cai_ranges where point_of_sale='SPS';
select public.archive_cai_range(id,revision,'CAI utilizado sustituido; conservar historial') from public.cai_ranges where point_of_sale='SPS';
select pg_temp.assert_true((select archived_at is not null and not is_active and ever_used and next_number=2 from public.cai_ranges where point_of_sale='SPS'),'Eliminación conserva registro, consumo y estado inactivo');
select pg_temp.assert_true((select is_active and next_number=2 from public.cai_ranges where point_of_sale='TGU'),'Retirar SPS no cambia TGU');
select pg_temp.expect_error($c$select public.set_cai_range_active(id,revision,true,'Reactivar eliminado') from public.cai_ranges where point_of_sale='SPS'$c$,'eliminado');
select pg_temp.expect_error($c$update public.cai_ranges set archived_at=null where point_of_sale='SPS'$c$,'permission denied');
select pg_temp.assert_true((select count(*)>=7 and bool_and(actor_id is not null and reason<>'') from public.cai_range_events),'Historial auditable con actor, motivo y valores');
select pg_temp.assert_true((select count(*)=2 from public.billing_office_access_events),'Cambios de oficinas quedan auditados');
-- Revocation applies immediately without promoting the supporting user to master.
select public.save_billing_user_office_access('ca280000-0000-4000-8000-000000000002',2,'{}','Fin del apoyo');
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.assert_true(not public.can_issue_from_office('ca280100-0000-4000-8000-000000000002') and not public.is_invoice_master(),'Revocación no modifica rol ni permiso master');
-- Reproduce a legacy active-but-expired CAI, not a state the new UI creates.
reset role;
alter table public.cai_ranges disable trigger zz_cai_history_guard;
update public.cai_ranges set fecha_limite_emision='2017-08-20' where tenant_id='ca280000-0000-4000-8000-000000000100' and point_of_sale='TGU';
alter table public.cai_ranges enable trigger zz_cai_history_guard;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_cai_range_active(id,revision,false,'Desactivar CAI histórico vencido') from public.cai_ranges where point_of_sale='TGU';
select pg_temp.assert_true((select not is_active and next_number=2 from public.cai_ranges where point_of_sale='TGU'),'CAI histórico vencido se puede desactivar sin perder consumo');
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=0 from public.cai_ranges) and (select count(*)=0 from public.cai_range_events) and (select count(*)=0 from public.billing_office_access_events),'Master ajeno no ve configuración ni historial');
select pg_temp.expect_error($c$select public.set_cai_range_active((select id from ranges where office='TGU'),1,false,'Ajeno')$c$,'no existe');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.activate_cai_range_trusted(uuid)','execute') and not has_function_privilege('anon','public.save_cai_range(uuid,integer,jsonb,text)','execute'),'Sin rutas públicas para saltar permisos');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set is_active=false where id='ca280000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.assert_true(not public.is_invoice_master(),'Admin inactivo no obtiene autoridad');
select pg_temp.assert_true((select count(*)=0 from public.proveedores),'Admin inactivo no ve proveedores');
reset role;
set constraints all immediate;
rollback;

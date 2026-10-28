\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,m text) returns void language plpgsql as $$begin if not coalesce(v,false) then raise exception 'ASSERTION FAILED: %',m;end if;end $$;
create function pg_temp.expect_error(c text,m text) returns void language plpgsql as $$begin begin execute c;exception when others then if position(m in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected error: %',m;end $$;
insert into public.tenants(id,slug,name) values('ca280000-0000-4000-8000-000000000100','cai28','Empresa ficticia CAI');
insert into auth.users(id,aud,role,email,raw_user_meta_data) values('ca280000-0000-4000-8000-000000000001','authenticated','authenticated','cai28@test.local','{}');
update public.profiles set rol='Contabilidad',status='Aprobado',is_active=true,tenant_id='ca280000-0000-4000-8000-000000000100' where id='ca280000-0000-4000-8000-000000000001';
insert into public.company_settings(tenant_id,legal_name,rtn,address,billing_points_of_sale) values('ca280000-0000-4000-8000-000000000100','Empresa ficticia CAI','08019999123456','Domicilio ficticio',array['SPS','TGU']);
insert into public.billing_offices(id,tenant_id,name,address,phone,email,establishment_code,emission_point_code) values
 ('ca280100-0000-4000-8000-000000000001','ca280000-0000-4000-8000-000000000100','SPS','Oficina ficticia SPS','00000000','sps@test.local','001','001'),
 ('ca280100-0000-4000-8000-000000000002','ca280000-0000-4000-8000-000000000100','TGU','Oficina ficticia TGU','00000000','tgu@test.local','002','001');
insert into public.clientes(id,nombre,rtn,condicion_pago,tenant_id,billing_office_id) values
 ('ca280200-0000-4000-8000-000000000001','Cliente ficticio SPS','08019999123456','Contado','ca280000-0000-4000-8000-000000000100','ca280100-0000-4000-8000-000000000001'),
 ('ca280200-0000-4000-8000-000000000002','Cliente ficticio TGU','08019999123456','Contado','ca280000-0000-4000-8000-000000000100','ca280100-0000-4000-8000-000000000002');
insert into public.proveedores(id,tenant_id,nombre,tipo,rtn,moneda,telefono) values('ca280600-0000-4000-8000-000000000001','ca280000-0000-4000-8000-000000000100','Proveedor ficticio','Otro','08019999123456','HNL','00000000');
-- The CAI setup persona is explicitly designated; financial roles alone cannot configure CAI.
insert into public.invoice_master_settings(tenant_id,profile_id,assignment_source) select tenant_id,id,'Despliegue autorizado' from public.profiles where id='ca280000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca280000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_accounting_account('{"code":"5101","name":"Servicio ficticio","kind":"Gasto"}');
-- Each office/type can start at the same serial without sharing its counter.
insert into public.cai_ranges(cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number)
 select 'TEST-'||o.name||'-'||d.code,o.name,d.kind,o.establishment_code||'-001-'||d.code||'-00000010',o.establishment_code||'-001-'||d.code||'-00000012',current_date+30,false,10
 from public.billing_offices o cross join (values('Factura','01'),('Nota de Crédito','06'),('Nota de Débito','07'),('Boleta de Compra','11'),('Comprobante de Retención','05'),('Guía de Remisión','08')) d(kind,code);
select public.activate_cai_range(id) from public.cai_ranges order by point_of_sale,document_type;
select pg_temp.assert_true((select count(*)=12 from public.cai_ranges where is_active),'Dos oficinas por seis tipos, todos activos simultáneamente');
create temp table issued(office text,kind text,id uuid,number text);
do $$declare o record;r record;note record;purchase uuid;retention uuid;begin
 for o in select * from public.billing_offices order by name loop
  select * into r from public.create_manual_invoice_with_items(jsonb_build_object('invoice_type','Factura','cliente_id',(select id from public.clientes where billing_office_id=o.id),'currency','HNL','fiscal_mode','Exenta'),'[{"description":"Servicio ficticio","quantity":1,"unit_price":100,"isv_rate":0}]');
  insert into issued values(o.name,'Factura',r.invoice_id,r.invoice_number);
  update public.invoices set status='Aprobada' where id=r.invoice_id;
  select * into note from public.create_manual_invoice_with_items(jsonb_build_object('invoice_type','Nota de Crédito','parent_invoice_id',r.invoice_id,'cliente_id',(select id from public.clientes where billing_office_id=o.id),'currency','HNL','fiscal_mode','Exenta','motivo','Ajuste ficticio'),'[{"description":"Ajuste ficticio","quantity":1,"unit_price":1,"isv_rate":0}]');
  insert into issued values(o.name,'Nota de Crédito',note.invoice_id,note.invoice_number);
  select * into note from public.create_manual_invoice_with_items(jsonb_build_object('invoice_type','Nota de Débito','parent_invoice_id',r.invoice_id,'cliente_id',(select id from public.clientes where billing_office_id=o.id),'currency','HNL','fiscal_mode','Exenta','motivo','Cargo ficticio'),'[{"description":"Cargo ficticio","quantity":1,"unit_price":1,"isv_rate":0}]');
  insert into issued values(o.name,'Nota de Débito',note.invoice_id,note.invoice_number);
  purchase:=public.create_purchase_document(gen_random_uuid(),jsonb_build_object('document_type','Boleta de Compra','supplier_id','ca280600-0000-4000-8000-000000000001','office_id',o.id,'currency','HNL','issue_date',current_date,'supplier_address','Domicilio ficticio'),jsonb_build_array(jsonb_build_object('description','Servicio ficticio','quantity',1,'unit_price',100,'tax_rate',0,'account_id',(select id from public.accounting_accounts where code='5101'))));
  insert into issued select o.name,'Boleta de Compra',purchase,document_number from public.purchase_documents where id=purchase;
  retention:=public.create_withholding_document(gen_random_uuid(),(select payable_id from public.purchase_documents where id=purchase),o.id,current_date,'[{"description":"Retención ficticia","base":100,"rate":1}]');
  insert into issued select o.name,'Comprobante de Retención',retention,document_number from public.withholding_documents where id=retention;
 end loop;
end $$;
select pg_temp.assert_true((select count(*)=10 and count(distinct number)=10 and bool_and(right(number,8)='00000010') from issued),'Cinco documentos emitidos por oficina con correlativo inicial independiente');
select pg_temp.assert_true((select bool_and(next_number=11) from public.cai_ranges where document_type<>'Guía de Remisión'),'Cada emisión consume solo su propio contador');
select pg_temp.assert_true((select bool_and(next_number=10) from public.cai_ranges where document_type='Guía de Remisión'),'Serie reservada de guía no se consume con otros documentos');
-- Changing the customer's current office cannot move a note of the old invoice.
update public.clientes set billing_office_id='ca280100-0000-4000-8000-000000000002' where id='ca280200-0000-4000-8000-000000000001';
insert into issued select 'SPS','Nota de Crédito',invoice_id,invoice_number from public.create_manual_invoice_with_items(jsonb_build_object('invoice_type','Nota de Crédito','parent_invoice_id',(select id from issued where office='SPS' and kind='Factura'),'cliente_id','ca280200-0000-4000-8000-000000000001','currency','HNL','fiscal_mode','Exenta','motivo','Ajuste posterior'),'[{"description":"Ajuste","quantity":1,"unit_price":1,"isv_rate":0}]');
select pg_temp.assert_true((select next_number=12 from public.cai_ranges where point_of_sale='SPS' and document_type='Nota de Crédito') and (select next_number=11 from public.cai_ranges where point_of_sale='TGU' and document_type='Nota de Crédito'),'NC conserva oficina del documento original y deja intacta la otra serie');
-- Rotation only affects the selected office and document type.
insert into public.cai_ranges(cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision,is_active,next_number) values('TEST-SPS-NEW','SPS','Factura','001-001-01-00000013','001-001-01-00000014',current_date+60,false,13);
select public.activate_cai_range(id) from public.cai_ranges where cai='TEST-SPS-NEW';
select pg_temp.assert_true((select count(*)=12 from public.cai_ranges where is_active) and (select is_active and next_number=11 from public.cai_ranges where point_of_sale='TGU' and document_type='Factura'),'Rotar factura SPS no cambia TGU ni otros tipos');
-- Existing guard fails here: a TGU range with the SPS prefix is accepted.
select pg_temp.expect_error($c$insert into public.cai_ranges(cai,point_of_sale,document_type,rango_desde,rango_hasta,fecha_limite_emision) values('TEST-WRONG','TGU','Factura','001-001-01-00000100','001-001-01-00000110',current_date+30)$c$,'prefijo SAR');
select pg_temp.expect_error($c$insert into public.billing_offices(name,establishment_code,emission_point_code) values('Duplicada','001','001')$c$,'ya pertenece a otra oficina');
select pg_temp.expect_error($c$update public.billing_offices set establishment_code='003' where name='SPS'$c$,'rangos CAI registrados');
select pg_temp.expect_error($c$update public.cai_ranges set rango_desde='002-001-01-00000013',rango_hasta='002-001-01-00000014' where cai='TEST-SPS-NEW'$c$,'prefijo SAR');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.allocate_additional_fiscal_number(uuid,text,date)','execute'),'Nadie consume correlativos fuera de una emisión atómica');
reset role;
set constraints all immediate;
rollback;

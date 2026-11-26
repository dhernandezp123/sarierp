\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'ASSERTION FAILED: %',message;end if;end $$;
create function pg_temp.denied(command text) returns void language plpgsql as $$
begin begin execute command;exception when insufficient_privilege then return;end;raise exception 'ASSERTION FAILED: se esperaba denegacion';end $$;
create function pg_temp.fails(command text,fragment text) returns void language plpgsql as $$
begin begin execute command;exception when others then if position(fragment in sqlerrm)>0 then return;end if;raise;end;raise exception 'ASSERTION FAILED: se esperaba error %',fragment;end $$;
create function pg_temp.as_user(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','e4060000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true);end $$;
insert into public.tenants(id,slug,name) values('e4060000-0000-4000-8000-000000000100','hr06-a','Empresa A'),('e4060000-0000-4000-8000-000000000200','hr06-b','Empresa B');
insert into auth.users(id,aud,role,email,raw_user_meta_data)
select ('e4060000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','hr06-'||n||'@test.local','{}'::jsonb from generate_series(1,5)n;
update public.profiles set rol=(case right(id::text,3) when '001' then 'Admin' when '003' then 'Admin' when '004' then 'Cliente' else 'Ventas' end)::public.user_role,
 status='Aprobado',is_active=right(id::text,3)<>'005',is_platform_admin=false,
 tenant_id=case when right(id::text,3)='003' then 'e4060000-0000-4000-8000-000000000200'::uuid else 'e4060000-0000-4000-8000-000000000100'::uuid end where id::text like 'e4060000-%';
create temp table ids(name text primary key,id uuid) on commit drop;
grant all on ids to authenticated,service_role;
set local role authenticated;
select pg_temp.as_user(1);
insert into ids select 'employee',public.hr_save_employee(null,null,jsonb_build_object('employee_code','D1','first_name','Ana','last_name','Original','hire_date',current_date-interval '4 years','contract_type','Indefinido','profile_id','e4060000-0000-4000-8000-000000000002'));
insert into ids select 'request',public.hr_request_leave(gen_random_uuid(),(select id from ids where name='employee'),'Vacaciones',date_trunc('week',current_date)::date+7,date_trunc('week',current_date)::date+11,'Constancia');
select public.hr_review_leave((select id from ids where name='request'),'Aprobada','');
insert into ids select 'certificate',id from public.hr_certificates where request_id=(select id from ids where name='request');
select pg_temp.ok((select count(*)=1 and bool_and(snapshot->'employee'->>'name'='Ana Original') from public.hr_certificates),'concesion genera snapshot congelado');
select public.hr_save_employee((select id from ids where name='employee'),1,jsonb_build_object('employee_code','D1','first_name','Ana','last_name','Modificada','hire_date',current_date-interval '4 years','contract_type','Indefinido','profile_id','e4060000-0000-4000-8000-000000000002'));
select pg_temp.ok((select snapshot->'employee'->>'name'='Ana Original' and snapshot->'company'->>'legal_name'='Empresa A' from public.hr_certificates where id=(select id from ids where name='certificate')),'editar ficha no cambia constancia ni inventa empresa');
select public.hr_authorize_accumulation((select id from ids where name='employee'),3,4,'Direccion de dificil reemplazo');
select public.hr_suspend_leave((select id from ids where name='request'),date_trunc('week',current_date)::date+9,'Urgencia');
select pg_temp.ok((select count(*)=3 from public.hr_certificates),'concesion acumulacion suspension separadas');
select pg_temp.denied(format($$select * from public.hr_prepare_document_upload(gen_random_uuid(),%L,'firma.pdf','application/pdf',16,repeat('a',64),current_date,'e4060000-0000-4000-8000-000000000001')$$,(select id from ids where name='certificate')));
select pg_temp.as_user(2);
select pg_temp.ok((select count(*)=3 from public.hr_certificates),'empleado lee solo constancias propias');
select pg_temp.denied($$insert into public.hr_certificates(tenant_id,employee_id,kind,source_key,certificate_number,snapshot,created_by) values('e4060000-0000-4000-8000-000000000100',gen_random_uuid(),'Concesión','x','x','{}',auth.uid())$$);
select pg_temp.as_user(3);
select pg_temp.ok((select count(*)=0 from public.hr_certificates),'tenant B no lee constancias A');
select pg_temp.as_user(4);
select pg_temp.ok((select count(*)=0 from public.hr_certificates),'cliente no lee constancias');
select pg_temp.as_user(5);
select pg_temp.ok((select count(*)=0 from public.hr_certificates),'inactivo no lee constancias');

set local role service_role;
select pg_temp.fails(format($$select * from public.hr_prepare_document_upload(gen_random_uuid(),%L,'firma.pdf','application/pdf',16,repeat('a',64),current_date,'e4060000-0000-4000-8000-000000000003')$$,(select id from ids where name='certificate')),'no disponible');
select pg_temp.fails(format($$select * from public.hr_prepare_document_upload(gen_random_uuid(),%L,'firma.pdf','application/pdf',16,repeat('a',64),current_date,'e4060000-0000-4000-8000-000000000005')$$,(select id from ids where name='certificate')),'No autorizado');
insert into ids select 'upload',upload_id from public.hr_prepare_document_upload('e406aaaa-0000-4000-8000-000000000001',(select id from ids where name='certificate'),'firma.pdf','application/pdf',16,repeat('a',64),current_date,'e4060000-0000-4000-8000-000000000001');
select pg_temp.fails($$select public.hr_finalize_document_upload('e406aaaa-0000-4000-8000-000000000001','e4060000-0000-4000-8000-000000000001')$$,'pendiente');
insert into storage.objects(bucket_id,name,metadata) select 'hr-signed-documents',storage_path,jsonb_build_object('size',16,'mimetype','application/pdf') from public.hr_document_uploads where id=(select id from ids where name='upload');
insert into ids select 'document',public.hr_finalize_document_upload((select id from ids where name='upload'),'e4060000-0000-4000-8000-000000000001');
select pg_temp.ok(public.hr_finalize_document_upload((select id from ids where name='upload'),'e4060000-0000-4000-8000-000000000001')=(select id from ids where name='document'),'finalizacion idempotente');
select pg_temp.ok((select document_id=(select id from ids where name='document') from public.hr_prepare_document_upload('e406aaaa-0000-4000-8000-000000000001',(select id from ids where name='certificate'),'firma.pdf','application/pdf',16,repeat('a',64),current_date,'e4060000-0000-4000-8000-000000000001')),'reintento conserva documento confirmado');
select pg_temp.fails(format($$select * from public.hr_prepare_document_upload('e406aaaa-0000-4000-8000-000000000001',%L,'otro.pdf','application/pdf',16,repeat('b',64),current_date,'e4060000-0000-4000-8000-000000000001')$$,(select id from ids where name='certificate')),'otros datos');
insert into ids select 'upload2',upload_id from public.hr_prepare_document_upload('e406aaaa-0000-4000-8000-000000000002',(select id from ids where name='certificate'),'firma2.pdf','application/pdf',16,repeat('b',64),current_date,'e4060000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name,metadata) select 'hr-signed-documents',storage_path,jsonb_build_object('size',16,'mimetype','application/pdf') from public.hr_document_uploads where id=(select id from ids where name='upload2');
select public.hr_finalize_document_upload((select id from ids where name='upload2'),'e4060000-0000-4000-8000-000000000001');
select pg_temp.ok((select count(*)=2 and max(version)=2 from public.hr_signed_documents),'nueva carga conserva ambas versiones');
select pg_temp.ok((select public=false from storage.buckets where id='hr-signed-documents'),'bucket privado');

set local role authenticated;
select pg_temp.as_user(2);
select pg_temp.ok((select count(*)=2 from public.hr_signed_documents),'empleado lee versiones propias');
select pg_temp.ok((select count(*)=2 from storage.objects where bucket_id='hr-signed-documents'),'empleado puede descargar versiones propias');
select pg_temp.denied($$insert into storage.objects(bucket_id,name) values('hr-signed-documents','arbitrary.pdf')$$);
select pg_temp.as_user(3);
select pg_temp.ok((select count(*)=0 from public.hr_signed_documents),'tenant B no lee versiones A');
select pg_temp.ok((select count(*)=0 from storage.objects where bucket_id='hr-signed-documents'),'tenant B no lee Storage A');
select pg_temp.as_user(1);
update storage.objects set metadata='{}' where bucket_id='hr-signed-documents';
select pg_temp.ok((select bool_and(metadata->>'size'='16') from storage.objects where bucket_id='hr-signed-documents'),'ni Admin puede reemplazar objeto firmado');
select pg_temp.denied($$update public.hr_signed_documents set sha256=repeat('c',64)$$);
rollback;

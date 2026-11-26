-- HR-06: constancias congeladas y versiones firmadas privadas. No firma electrónica.
create table public.hr_certificate_sequences (
 tenant_id uuid not null references public.tenants(id),year integer not null,last_number integer not null,
 primary key(tenant_id,year)
);
alter table public.hr_certificate_sequences enable row level security;
revoke all on public.hr_certificate_sequences from public,anon,authenticated;
create table public.hr_certificates (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 employee_id uuid not null references public.hr_employees(id),request_id uuid references public.hr_leave_requests(id),
 kind text not null check(kind in ('Concesión','Acumulación','Suspensión')),source_key text not null,
 certificate_number text not null,snapshot jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(tenant_id,kind,source_key),unique(tenant_id,certificate_number)
);
alter table public.hr_certificates enable row level security;
create index hr_certificates_tenant_date on public.hr_certificates(tenant_id,created_at desc,id);
create index hr_certificates_employee on public.hr_certificates(employee_id);
revoke all on public.hr_certificates from public,anon,authenticated;
grant select on public.hr_certificates to authenticated;
create policy hr_certificates_read on public.hr_certificates for select to authenticated
 using(tenant_id=public.current_tenant_id() and public.hr_can_read_employee(employee_id));

create function public.hr_issue_certificate_internal(p_employee uuid,p_request uuid,p_kind text,p_source text,p_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare e public.hr_employees%rowtype;company jsonb;v_year integer:=extract(year from now() at time zone 'America/Tegucigalpa');v_number integer;
begin
 if not public.hr_is_manager() then raise exception 'No autorizado' using errcode='42501';end if;
 select * into e from public.hr_employees where id=p_employee and tenant_id=public.current_tenant_id();
 if not found then raise exception 'Empleado no disponible' using errcode='42501';end if;
 if exists(select 1 from public.hr_certificates where tenant_id=e.tenant_id and kind=p_kind and source_key=p_source) then return;end if;
 select jsonb_build_object('legal_name',coalesce(nullif(c.legal_name,''),t.name),'trade_name',coalesce(nullif(c.trade_name,''),t.name),'rtn',c.rtn,'address',c.address)
 into company from public.tenants t left join public.company_settings c on c.tenant_id=t.id where t.id=e.tenant_id;
 insert into public.hr_certificate_sequences values(e.tenant_id,v_year,1)
 on conflict(tenant_id,year) do update set last_number=hr_certificate_sequences.last_number+1 returning last_number into v_number;
 insert into public.hr_certificates(tenant_id,employee_id,request_id,kind,source_key,certificate_number,snapshot,created_by)
 values(e.tenant_id,e.id,p_request,p_kind,p_source,'RH-'||v_year||'-'||lpad(v_number::text,greatest(6,length(v_number::text)),'0'),
 jsonb_build_object('company',company,'employee',jsonb_build_object('employee_code',e.employee_code,'name',btrim(e.first_name||' '||e.last_name),
 'national_id',e.national_id,'hire_date',e.hire_date,'department',e.department,'job_title',e.job_title,'work_schedule',e.work_schedule),'act',p_data),auth.uid());
end $$;
revoke all on function public.hr_issue_certificate_internal(uuid,uuid,text,text,jsonb) from public,anon,authenticated;

create function public.hr_certificate_leave_internal() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status and new.status='Aprobada' then
  perform public.hr_issue_certificate_internal(new.employee_id,new.id,'Concesión',new.id::text,
   jsonb_build_object('leave_type',new.leave_type,'start_date',new.start_date,'end_date',new.end_date,'days',new.business_days,
   'is_advance',new.is_advance,'is_fractioned',new.is_fractioned,'review_notes',new.review_notes,'counted_dates',new.counted_dates));
 elsif old.suspended_at is distinct from new.suspended_at and new.suspended_at is not null then
  perform public.hr_issue_certificate_internal(new.employee_id,new.id,'Suspensión',new.id::text||':'||new.suspended_at::text,
   jsonb_build_object('leave_type',new.leave_type,'start_date',new.start_date,'end_date',new.end_date,'original_end_date',new.original_end_date,
   'return_date',new.end_date+1,'days',new.business_days,'reason',new.suspension_notes,'counted_dates',new.counted_dates));
 end if;
 return new;
end $$;
create trigger hr_certificate_leave after update on public.hr_leave_requests for each row execute function public.hr_certificate_leave_internal();
revoke all on function public.hr_certificate_leave_internal() from public,anon,authenticated;
create function public.hr_certificate_accumulation_internal() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.hr_issue_certificate_internal(new.employee_id,null,'Acumulación',new.employee_id::text,
 jsonb_build_object('from_period',new.from_period,'to_period',new.to_period,'reason',new.reason));
 return new;
end $$;
create trigger hr_certificate_accumulation after insert on public.hr_vacation_accumulations for each row execute function public.hr_certificate_accumulation_internal();
revoke all on function public.hr_certificate_accumulation_internal() from public,anon,authenticated;

create table public.hr_document_uploads (
 id uuid primary key,tenant_id uuid not null references public.tenants(id),certificate_id uuid not null references public.hr_certificates(id),
 uploaded_by uuid not null references auth.users(id),storage_path text not null unique,file_name text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 signed_on date not null,expires_at timestamptz not null default now()+interval '1 hour',created_at timestamptz not null default now()
);
alter table public.hr_document_uploads enable row level security;
revoke all on public.hr_document_uploads from public,anon,authenticated;
create table public.hr_signed_documents (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),certificate_id uuid not null references public.hr_certificates(id),
 upload_id uuid not null unique references public.hr_document_uploads(id),version integer not null check(version>0),
 storage_path text not null unique,file_name text not null,mime_type text not null,size_bytes integer not null,sha256 text not null,
 signed_on date not null,uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(certificate_id,version)
);
alter table public.hr_signed_documents enable row level security;
revoke all on public.hr_signed_documents from public,anon,authenticated;
grant select on public.hr_signed_documents to authenticated;
create policy hr_signed_documents_read on public.hr_signed_documents for select to authenticated using(
 tenant_id=public.current_tenant_id() and exists(select 1 from public.hr_certificates c where c.id=certificate_id and public.hr_can_read_employee(c.employee_id)));

create function public.hr_prepare_document_upload(p_request_id uuid,p_certificate_id uuid,p_file_name text,p_mime text,p_size integer,p_sha256 text,p_signed_on date,p_actor uuid)
returns table(upload_id uuid,storage_path text,document_id uuid) language plpgsql security definer set search_path=public as $$
declare c public.hr_certificates%rowtype;u public.hr_document_uploads%rowtype;document uuid;extension text;actor_tenant uuid;
begin
 select tenant_id into actor_tenant from public.profiles where id=p_actor and rol='Admin' and status='Aprobado' and is_active;
 if not found then raise exception 'No autorizado' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Identificador requerido';end if;
 select * into c from public.hr_certificates where id=p_certificate_id and tenant_id=actor_tenant;
 if not found then raise exception 'Constancia no disponible' using errcode='42501';end if;
 if p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg') or p_size is null or p_size not between 1 and 10485760
 or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or nullif(btrim(p_file_name),'') is null or length(p_file_name)>180
 or p_signed_on is null or p_signed_on>(now() at time zone 'America/Tegucigalpa')::date then raise exception 'Archivo o fecha de firma inválidos';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-upload:'||p_request_id,0));
 select * into u from public.hr_document_uploads where id=p_request_id;
 if found then
  if u.tenant_id<>c.tenant_id or u.certificate_id<>c.id or u.uploaded_by<>p_actor or u.sha256<>p_sha256 or u.size_bytes<>p_size
  or u.mime_type<>p_mime or u.file_name<>p_file_name or u.signed_on<>p_signed_on then raise exception 'Identificador usado con otros datos';end if;
  select d.id into document from public.hr_signed_documents d where d.upload_id=u.id;
  if document is null and u.expires_at<now() then raise exception 'Carga vencida: vuelve a seleccionar el archivo';end if;
  return query select u.id,u.storage_path,document;return;
 end if;
 extension:=case p_mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
 insert into public.hr_document_uploads(id,tenant_id,certificate_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,sha256,signed_on)
 values(p_request_id,c.tenant_id,c.id,p_actor,c.tenant_id||'/'||c.employee_id||'/'||c.id||'/'||p_request_id||extension,p_file_name,p_mime,p_size,p_sha256,p_signed_on)
 returning * into u;
 return query select u.id,u.storage_path,null::uuid;
end $$;

create function public.hr_finalize_document_upload(p_upload_id uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare u public.hr_document_uploads%rowtype;existing uuid;result uuid;next_version integer;meta jsonb;actor_tenant uuid;
begin
 select tenant_id into actor_tenant from public.profiles where id=p_actor and rol='Admin' and status='Aprobado' and is_active;
 if not found then raise exception 'No autorizado' using errcode='42501';end if;
 select * into u from public.hr_document_uploads where id=p_upload_id and tenant_id=actor_tenant and uploaded_by=p_actor;
 if not found then raise exception 'Carga no disponible' using errcode='42501';end if;
 perform 1 from public.hr_certificates where id=u.certificate_id for update;
 select id into existing from public.hr_signed_documents where upload_id=u.id;
 if found then return existing;end if;
 if u.expires_at<now() then raise exception 'Carga vencida';end if;
 select metadata into meta from storage.objects where bucket_id='hr-signed-documents' and name=u.storage_path;
 if not found or (meta->>'size')::bigint is distinct from u.size_bytes::bigint or meta->>'mimetype' is distinct from u.mime_type then raise exception 'Archivo pendiente o metadatos inválidos';end if;
 select coalesce(max(version),0)+1 into next_version from public.hr_signed_documents where certificate_id=u.certificate_id;
 insert into public.hr_signed_documents(tenant_id,certificate_id,upload_id,version,storage_path,file_name,mime_type,size_bytes,sha256,signed_on,uploaded_by)
 values(u.tenant_id,u.certificate_id,u.id,next_version,u.storage_path,u.file_name,u.mime_type,u.size_bytes,u.sha256,u.signed_on,u.uploaded_by) returning id into result;
 return result;
end $$;
revoke all on function public.hr_prepare_document_upload(uuid,uuid,text,text,integer,text,date,uuid),public.hr_finalize_document_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hr_prepare_document_upload(uuid,uuid,text,text,integer,text,date,uuid),public.hr_finalize_document_upload(uuid,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hr-signed-documents','hr-signed-documents',false,10485760,array['application/pdf','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;


create function public.hr_can_read_document(p_path text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.hr_signed_documents d join public.hr_certificates c on c.id=d.certificate_id
 where d.storage_path=p_path and d.tenant_id=public.current_tenant_id() and public.hr_can_read_employee(c.employee_id));
$$;
revoke all on function public.hr_can_read_document(text) from public,anon,authenticated;
grant execute on function public.hr_can_read_document(text) to authenticated;
create policy hr_documents_read on storage.objects for select to authenticated using(bucket_id='hr-signed-documents' and public.hr_can_read_document(name));
-- Solo el servidor autenticado de carga escribe archivos; ningún usuario puede sustituir una versión.
create policy hr_documents_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'hr-signed-documents' or public.hr_can_read_document(name));
create policy hr_documents_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'hr-signed-documents');
create policy hr_documents_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'hr-signed-documents') with check(bucket_id<>'hr-signed-documents');
create policy hr_documents_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'hr-signed-documents');
create policy hr_documents_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'hr-signed-documents') with check(bucket_id<>'hr-signed-documents');

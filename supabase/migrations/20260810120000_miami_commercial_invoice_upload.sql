-- Facturas comerciales aportadas por clientes para paquetes Miami.
-- Los archivos permanecen privados y el acceso se resuelve por cliente/paquete.

create table if not exists public.miami_package_documents (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.miami_packages(id) on delete cascade,
  document_type text not null default 'Commercial Invoice',
  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  status text not null default 'Recibida',
  review_notes text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint miami_package_documents_type_check
    check (document_type = 'Commercial Invoice'),
  constraint miami_package_documents_mime_check
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint miami_package_documents_size_check
    check (file_size > 0 and file_size <= 10485760),
  constraint miami_package_documents_status_check
    check (status in ('Recibida', 'Requiere corrección', 'Reemplazada'))
);

create index if not exists miami_package_documents_package_created_idx
  on public.miami_package_documents (package_id, created_at desc);

alter table public.miami_package_documents enable row level security;

create or replace function public.can_access_miami_package_document(
  p_package_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.miami_packages mp
    where mp.id = p_package_id
      and (
        public.is_admin_or_operations()
        or (
          public.is_cliente()
          and mp.cliente_id = public.current_user_cliente_id()
        )
      )
  )
$$;

revoke all on function public.can_access_miami_package_document(uuid)
  from public, anon;
grant execute on function public.can_access_miami_package_document(uuid)
  to authenticated, service_role;

drop policy if exists miami_package_documents_select_policy
  on public.miami_package_documents;
create policy miami_package_documents_select_policy
on public.miami_package_documents
for select
to authenticated
using (public.can_access_miami_package_document(package_id));

drop policy if exists miami_package_documents_insert_policy
  on public.miami_package_documents;
create policy miami_package_documents_insert_policy
on public.miami_package_documents
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and status = 'Recibida'
  and review_notes is null
  and reviewed_by is null
  and reviewed_at is null
  and public.can_access_miami_package_document(package_id)
);

drop policy if exists miami_package_documents_review_policy
  on public.miami_package_documents;
create policy miami_package_documents_review_policy
on public.miami_package_documents
for update
to authenticated
using (
  public.is_admin_or_operations()
  and public.can_access_miami_package_document(package_id)
)
with check (
  public.is_admin_or_operations()
  and public.can_access_miami_package_document(package_id)
);

drop policy if exists miami_package_documents_delete_policy
  on public.miami_package_documents;
create policy miami_package_documents_delete_policy
on public.miami_package_documents
for delete
to authenticated
using (
  public.is_admin()
  and public.can_access_miami_package_document(package_id)
);

revoke all on table public.miami_package_documents from anon;
grant select, insert, update, delete on table public.miami_package_documents
  to authenticated;
grant all on table public.miami_package_documents to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'miami-package-documents',
  'miami-package-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.miami_package_id_from_document_path(
  p_object_name text
)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if split_part(p_object_name, '/', 2)
     !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  then
    return null;
  end if;

  return split_part(p_object_name, '/', 2)::uuid;
end;
$$;

create or replace function public.can_access_miami_package_document_object(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.miami_packages mp
    where mp.id = public.miami_package_id_from_document_path(p_object_name)
      and split_part(p_object_name, '/', 1) = mp.cliente_id::text
      and public.can_access_miami_package_document(mp.id)
  )
$$;

create or replace function public.can_delete_orphan_miami_package_document_object(
  p_object_name text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_owner_id = auth.uid()::text
    and public.can_access_miami_package_document_object(p_object_name)
    and not exists (
      select 1
      from public.miami_package_documents mpd
      where mpd.file_path = p_object_name
    )
$$;

revoke all on function public.miami_package_id_from_document_path(text)
  from public, anon;
revoke all on function public.can_access_miami_package_document_object(text)
  from public, anon;
revoke all on function public.can_delete_orphan_miami_package_document_object(text, text)
  from public, anon;
grant execute on function public.miami_package_id_from_document_path(text)
  to authenticated, service_role;
grant execute on function public.can_access_miami_package_document_object(text)
  to authenticated, service_role;
grant execute on function public.can_delete_orphan_miami_package_document_object(text, text)
  to authenticated, service_role;

drop policy if exists miami_package_documents_storage_select_policy
  on storage.objects;
create policy miami_package_documents_storage_select_policy
on storage.objects
for select
to authenticated
using (
  bucket_id = 'miami-package-documents'
  and public.can_access_miami_package_document_object(name)
);

drop policy if exists miami_package_documents_storage_insert_policy
  on storage.objects;
create policy miami_package_documents_storage_insert_policy
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'miami-package-documents'
  and owner_id = auth.uid()::text
  and public.can_access_miami_package_document_object(name)
);

drop policy if exists miami_package_documents_storage_delete_policy
  on storage.objects;
create policy miami_package_documents_storage_delete_policy
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'miami-package-documents'
  and (
    (
      public.is_admin()
      and public.can_access_miami_package_document_object(name)
    )
    or public.can_delete_orphan_miami_package_document_object(name, owner_id)
  )
);

-- Auditoría e idempotencia del aviso transaccional enviado por Resend.
create table if not exists public.client_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.miami_packages(id) on delete cascade,
  event_type text not null,
  recipient_email text not null,
  status text not null default 'processing',
  attempts integer not null default 1,
  resend_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint client_email_deliveries_event_check
    check (event_type = 'miami_package_assigned'),
  constraint client_email_deliveries_status_check
    check (status in ('processing', 'sent', 'failed')),
  constraint client_email_deliveries_attempts_check
    check (attempts between 1 and 5),
  unique (package_id, event_type)
);

create index if not exists client_email_deliveries_status_idx
  on public.client_email_deliveries (status, updated_at);

alter table public.client_email_deliveries enable row level security;

drop policy if exists client_email_deliveries_staff_select_policy
  on public.client_email_deliveries;
create policy client_email_deliveries_staff_select_policy
on public.client_email_deliveries
for select
to authenticated
using (public.is_admin_or_operations());

revoke all on table public.client_email_deliveries from anon, authenticated;
grant select on table public.client_email_deliveries to authenticated;
grant all on table public.client_email_deliveries to service_role;

comment on table public.miami_package_documents is
  'Documentos privados aportados por clientes o personal para paquetes Miami.';
comment on table public.client_email_deliveries is
  'Auditoría e idempotencia de correos transaccionales enviados al contacto principal.';

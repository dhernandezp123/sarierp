-- Fase 6 SaaS: rutas nuevas tenant_id/recurso/... y compatibilidad de lectura
-- para objetos históricos vinculados a un registro del tenant actual.

create or replace function public.storage_path_uuid(p_name text, p_position integer)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_segment text;
begin
  v_segment := nullif(split_part(coalesce(p_name, ''), '/', p_position), '');
  if v_segment is null then return null; end if;
  return v_segment::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.storage_path_has_tenant_prefix(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants
    where id = public.storage_path_uuid(p_name, 1)
  )
$$;

create or replace function public.storage_path_tenant_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when public.storage_path_has_tenant_prefix(p_name)
    then public.storage_path_uuid(p_name, 1)
    else null
  end
$$;

create or replace function public.booking_id_from_storage_object_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when public.storage_path_has_tenant_prefix(p_name)
    then public.storage_path_uuid(p_name, 2)
    else public.storage_path_uuid(p_name, 1)
  end
$$;

create or replace function public.can_access_booking_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bookings booking
    where booking.id = public.booking_id_from_storage_object_name(p_name)
      and booking.tenant_id = public.current_tenant_id()
      and public.can_select_booking(booking.id)
      and (
        not public.storage_path_has_tenant_prefix(p_name)
        or public.storage_path_tenant_id(p_name) = booking.tenant_id
      )
  )
$$;

create or replace function public.can_access_supplier_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved_active_user()
    and public.is_role(array['Admin', 'Finanzas', 'Contabilidad'])
    and exists (
      select 1
      from public.cuentas_pagar payable
      where payable.tenant_id = public.current_tenant_id()
        and payable.proveedor_id = case when public.storage_path_has_tenant_prefix(p_name)
          then public.storage_path_uuid(p_name, 2)
          else public.storage_path_uuid(p_name, 1)
        end
        and payable.id = case when public.storage_path_has_tenant_prefix(p_name)
          then public.storage_path_uuid(p_name, 3)
          else public.storage_path_uuid(p_name, 2)
        end
        and (
          not public.storage_path_has_tenant_prefix(p_name)
          or public.storage_path_tenant_id(p_name) = payable.tenant_id
        )
    )
$$;

create or replace function public.can_access_miami_package_document_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.miami_packages package
    where package.id = public.storage_path_uuid(p_object_name, 2)
      and public.can_access_miami_package_document(package.id)
      and (
        public.storage_path_tenant_id(p_object_name) = package.tenant_id
        or (
          not public.storage_path_has_tenant_prefix(p_object_name)
          and split_part(p_object_name, '/', 1) = package.cliente_id::text
        )
      )
  )
$$;

create or replace function public.miami_photo_package_id_from_path(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when public.storage_path_has_tenant_prefix(p_name)
    then public.storage_path_uuid(p_name, 2)
    else public.storage_path_uuid(p_name, 1)
  end
$$;

create or replace function public.can_access_miami_photo_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miami_packages package
    where package.id = public.miami_photo_package_id_from_path(p_name)
      and package.tenant_id = public.current_tenant_id()
      and public.can_access_miami_package_document(package.id)
      and (
        not public.storage_path_has_tenant_prefix(p_name)
        or public.storage_path_tenant_id(p_name) = package.tenant_id
      )
  )
$$;

create or replace function public.support_ticket_id_from_storage_path(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when public.storage_path_has_tenant_prefix(p_name)
    then public.storage_path_uuid(p_name, 2)
    else public.storage_path_uuid(p_name, 1)
  end
$$;

create or replace function public.can_upload_support_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_tickets ticket
    where ticket.id = public.support_ticket_id_from_storage_path(p_name)
      and public.storage_path_tenant_id(p_name) = ticket.tenant_id
      and public.storage_path_uuid(p_name, 3) = auth.uid()
      and public.can_view_support_ticket(ticket.id)
  )
$$;

create or replace function public.can_delete_support_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_ticket_attachments attachment
    where attachment.file_path = p_name
      and (
        attachment.uploaded_by = auth.uid()
        or public.is_platform_admin()
      )
      and public.can_view_support_ticket(attachment.ticket_id)
  ) or (
    public.can_upload_support_attachment_object(p_name)
    and not exists (
      select 1 from public.support_ticket_attachments where file_path = p_name
    )
  )
$$;

revoke all on function public.storage_path_uuid(text, integer) from public, anon;
revoke all on function public.storage_path_has_tenant_prefix(text) from public, anon;
revoke all on function public.storage_path_tenant_id(text) from public, anon;
revoke all on function public.booking_id_from_storage_object_name(text) from public, anon;
revoke all on function public.can_access_booking_storage_object(text) from public, anon;
revoke all on function public.can_access_supplier_storage_object(text) from public, anon;
revoke all on function public.can_access_miami_package_document_object(text) from public, anon;
revoke all on function public.miami_photo_package_id_from_path(text) from public, anon;
revoke all on function public.can_access_miami_photo_object(text) from public, anon;
revoke all on function public.support_ticket_id_from_storage_path(text) from public, anon;
revoke all on function public.can_upload_support_attachment_object(text) from public, anon;
revoke all on function public.can_delete_support_attachment_object(text) from public, anon;

grant execute on function public.storage_path_uuid(text, integer) to authenticated;
grant execute on function public.storage_path_has_tenant_prefix(text) to authenticated;
grant execute on function public.storage_path_tenant_id(text) to authenticated;
grant execute on function public.booking_id_from_storage_object_name(text) to authenticated;
grant execute on function public.can_access_booking_storage_object(text) to authenticated;
grant execute on function public.can_access_supplier_storage_object(text) to authenticated;
grant execute on function public.can_access_miami_package_document_object(text) to authenticated;
grant execute on function public.miami_photo_package_id_from_path(text) to authenticated;
grant execute on function public.can_access_miami_photo_object(text) to authenticated;
grant execute on function public.support_ticket_id_from_storage_path(text) to authenticated;
grant execute on function public.can_upload_support_attachment_object(text) to authenticated;
grant execute on function public.can_delete_support_attachment_object(text) to authenticated;

drop policy if exists support_attachments_insert_authorized on public.support_ticket_attachments;
create policy support_attachments_insert_authorized
on public.support_ticket_attachments
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (tenant_id = public.current_tenant_id() or public.is_platform_admin())
  and public.can_view_support_ticket(ticket_id)
  and public.storage_path_uuid(file_path, 1) = tenant_id
  and public.storage_path_uuid(file_path, 2) = ticket_id
  and public.storage_path_uuid(file_path, 3) = auth.uid()
  and (
    message_id is null
    or exists (
      select 1 from public.support_ticket_messages message
      where message.id = support_ticket_attachments.message_id
        and message.ticket_id = support_ticket_attachments.ticket_id
        and message.tenant_id = support_ticket_attachments.tenant_id
        and message.author_id = auth.uid()
    )
  )
);

-- Booking documents: nuevas cargas con prefijo; rutas antiguas solo si el
-- booking relacionado sigue siendo visible para el tenant actual.
drop policy if exists booking_documents_storage_select_policy on storage.objects;
drop policy if exists booking_documents_storage_insert_policy on storage.objects;
drop policy if exists booking_documents_storage_update_policy on storage.objects;
drop policy if exists booking_documents_storage_delete_policy on storage.objects;
create policy booking_documents_storage_select_policy on storage.objects
for select to authenticated using (
  bucket_id = 'booking-documents' and public.can_access_booking_storage_object(name)
);
create policy booking_documents_storage_insert_policy on storage.objects
for insert to authenticated with check (
  bucket_id = 'booking-documents'
  and public.is_admin_or_operations()
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.can_access_booking_storage_object(name)
);
create policy booking_documents_storage_update_policy on storage.objects
for update to authenticated
using (bucket_id = 'booking-documents' and public.is_admin_or_operations() and public.can_access_booking_storage_object(name))
with check (bucket_id = 'booking-documents' and public.is_admin_or_operations() and public.can_access_booking_storage_object(name));
create policy booking_documents_storage_delete_policy on storage.objects
for delete to authenticated using (
  bucket_id = 'booking-documents'
  and public.is_admin_or_operations()
  and public.can_access_booking_storage_object(name)
);

drop policy if exists proveedor_docs_select on storage.objects;
drop policy if exists proveedor_docs_insert on storage.objects;
drop policy if exists proveedor_docs_update on storage.objects;
drop policy if exists proveedor_docs_delete on storage.objects;
create policy proveedor_docs_select on storage.objects
for select to authenticated using (
  bucket_id = 'proveedor-docs' and public.can_access_supplier_storage_object(name)
);
create policy proveedor_docs_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'proveedor-docs'
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.can_access_supplier_storage_object(name)
);
create policy proveedor_docs_update on storage.objects
for update to authenticated
using (bucket_id = 'proveedor-docs' and public.can_access_supplier_storage_object(name))
with check (bucket_id = 'proveedor-docs' and public.can_access_supplier_storage_object(name));
create policy proveedor_docs_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'proveedor-docs' and public.can_access_supplier_storage_object(name)
);

drop policy if exists miami_package_documents_storage_select_policy on storage.objects;
drop policy if exists miami_package_documents_storage_insert_policy on storage.objects;
drop policy if exists miami_package_documents_storage_delete_policy on storage.objects;
create policy miami_package_documents_storage_select_policy on storage.objects
for select to authenticated using (
  bucket_id = 'miami-package-documents'
  and public.can_access_miami_package_document_object(name)
);
create policy miami_package_documents_storage_insert_policy on storage.objects
for insert to authenticated with check (
  bucket_id = 'miami-package-documents'
  and owner_id = auth.uid()::text
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.can_access_miami_package_document_object(name)
);
create policy miami_package_documents_storage_delete_policy on storage.objects
for delete to authenticated using (
  bucket_id = 'miami-package-documents'
  and (
    (public.is_admin() and public.can_access_miami_package_document_object(name))
    or public.can_delete_orphan_miami_package_document_object(name, owner_id)
  )
);

drop policy if exists miami_package_photos_select_active on storage.objects;
drop policy if exists miami_package_photos_insert_internal on storage.objects;
drop policy if exists miami_package_photos_update_internal on storage.objects;
drop policy if exists miami_package_photos_delete_internal on storage.objects;
create policy miami_package_photos_select_active on storage.objects
for select to authenticated using (
  bucket_id = 'miami-package-photos'
  and public.is_approved_active_user()
  and public.can_access_miami_photo_object(name)
);
create policy miami_package_photos_insert_internal on storage.objects
for insert to authenticated with check (
  bucket_id = 'miami-package-photos'
  and public.is_approved_active_user()
  and public.is_role(array['Admin', 'Operaciones'])
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.can_access_miami_photo_object(name)
);
create policy miami_package_photos_update_internal on storage.objects
for update to authenticated
using (
  bucket_id = 'miami-package-photos'
  and public.is_approved_active_user()
  and public.is_role(array['Admin', 'Operaciones'])
  and public.can_access_miami_photo_object(name)
)
with check (
  bucket_id = 'miami-package-photos'
  and public.is_approved_active_user()
  and public.is_role(array['Admin', 'Operaciones'])
  and public.can_access_miami_photo_object(name)
);
create policy miami_package_photos_delete_internal on storage.objects
for delete to authenticated using (
  bucket_id = 'miami-package-photos'
  and public.is_approved_active_user()
  and public.is_role(array['Admin', 'Operaciones'])
  and public.can_access_miami_photo_object(name)
);

drop policy if exists support_attachments_storage_select on storage.objects;
drop policy if exists support_attachments_storage_insert on storage.objects;
drop policy if exists support_attachments_storage_delete on storage.objects;
create policy support_attachments_storage_select on storage.objects
for select to authenticated using (
  bucket_id = 'support-attachments'
  and public.can_view_support_attachment_path(name)
);
create policy support_attachments_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'support-attachments'
  and public.is_approved_active_user()
  and public.can_upload_support_attachment_object(name)
);
create policy support_attachments_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'support-attachments'
  and public.can_delete_support_attachment_object(name)
);

-- Avatares siguen siendo activos públicos deliberadamente; se limita toda
-- mutación a la ruta tenant_id/auth.uid/... para evitar reemplazos cruzados.
drop policy if exists avatars_insert_own_tenant on storage.objects;
drop policy if exists avatars_update_own_tenant on storage.objects;
drop policy if exists avatars_delete_own_tenant on storage.objects;
create policy avatars_insert_own_tenant on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars'
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.storage_path_uuid(name, 2) = auth.uid()
);
create policy avatars_update_own_tenant on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.storage_path_uuid(name, 2) = auth.uid()
)
with check (
  bucket_id = 'avatars'
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.storage_path_uuid(name, 2) = auth.uid()
);
create policy avatars_delete_own_tenant on storage.objects
for delete to authenticated using (
  bucket_id = 'avatars'
  and public.storage_path_tenant_id(name) = public.current_tenant_id()
  and public.storage_path_uuid(name, 2) = auth.uid()
);

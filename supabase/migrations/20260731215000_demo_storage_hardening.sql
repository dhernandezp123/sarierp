-- Hardening reproducible de los buckets utilizados por la UI.
-- El guard general instalado por el reset demo sigue bloqueando todo Storage
-- en ese ambiente. Estas reglas eliminan el acceso anonimo historico, fijan
-- limites de carga y agregan una defensa explicita contra escrituras demo.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'miami-package-photos',
    'miami-package-photos',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
  ),
  (
    'booking-documents',
    'booking-documents',
    false,
    15728640,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
  ),
  (
    'proveedor-docs',
    'proveedor-docs',
    false,
    10485760,
    array['application/pdf']::text[]
  ),
  (
    'avatars',
    'avatars',
    not public.is_demo_environment(),
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Estas politicas del baseline concedian SELECT/INSERT a public con solo el
-- bucket_id como condicion.
drop policy if exists "authenticated-select 1jwhfh0_0" on storage.objects;
drop policy if exists "staff-upload 1jwhfh0_0" on storage.objects;

drop policy if exists miami_package_photos_select_active on storage.objects;
create policy miami_package_photos_select_active
on storage.objects
for select
to authenticated
using (
  bucket_id = 'miami-package-photos'
  and public.is_demo_access_active()
);

drop policy if exists miami_package_photos_insert_internal on storage.objects;
create policy miami_package_photos_insert_internal
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'miami-package-photos'
  and public.is_demo_access_active()
  and public.current_user_role() in ('Admin', 'Operaciones')
);

drop policy if exists miami_package_photos_update_internal on storage.objects;
create policy miami_package_photos_update_internal
on storage.objects
for update
to authenticated
using (
  bucket_id = 'miami-package-photos'
  and public.is_demo_access_active()
  and public.current_user_role() in ('Admin', 'Operaciones')
)
with check (
  bucket_id = 'miami-package-photos'
  and public.is_demo_access_active()
  and public.current_user_role() in ('Admin', 'Operaciones')
);

drop policy if exists miami_package_photos_delete_internal on storage.objects;
create policy miami_package_photos_delete_internal
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'miami-package-photos'
  and public.is_demo_access_active()
  and public.current_user_role() in ('Admin', 'Operaciones')
);

-- Defensa adicional por bucket. La policy restrictiva general del ambiente
-- demo prevalece tambien para SELECT; estas tres conservan el bloqueo de
-- escritura si en el futuro cambia la estrategia de lectura del sandbox.
drop policy if exists demo_sensitive_storage_insert_guard on storage.objects;
create policy demo_sensitive_storage_insert_guard
on storage.objects
as restrictive
for insert
to public
with check (
  bucket_id not in (
    'miami-package-photos',
    'booking-documents',
    'proveedor-docs',
    'avatars'
  )
  or not public.is_restricted_demo_context()
);

drop policy if exists demo_sensitive_storage_update_guard on storage.objects;
create policy demo_sensitive_storage_update_guard
on storage.objects
as restrictive
for update
to public
using (
  bucket_id not in (
    'miami-package-photos',
    'booking-documents',
    'proveedor-docs',
    'avatars'
  )
  or not public.is_restricted_demo_context()
)
with check (
  bucket_id not in (
    'miami-package-photos',
    'booking-documents',
    'proveedor-docs',
    'avatars'
  )
  or not public.is_restricted_demo_context()
);

drop policy if exists demo_sensitive_storage_delete_guard on storage.objects;
create policy demo_sensitive_storage_delete_guard
on storage.objects
as restrictive
for delete
to public
using (
  bucket_id not in (
    'miami-package-photos',
    'booking-documents',
    'proveedor-docs',
    'avatars'
  )
  or not public.is_restricted_demo_context()
);

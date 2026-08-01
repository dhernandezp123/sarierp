\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'authenticated-select 1jwhfh0_0',
        'staff-upload 1jwhfh0_0'
      )
  ),
  'Las policies publicas historicas de Miami deben eliminarse'
);

select pg_temp.assert_true(
  (
    select count(*) = 4
      and bool_and(
        case
          when id = 'avatars'
            then public = (not public.is_demo_environment())
          else public is false
        end
      )
    from storage.buckets
    where id in (
      'miami-package-photos',
      'booking-documents',
      'proveedor-docs',
      'avatars'
    )
  ),
  'Los cuatro buckets UI deben existir y avatars debe ser privado en demo'
);

select pg_temp.assert_true(
  (
    select file_size_limit = 10485760
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
    from storage.buckets
    where id = 'miami-package-photos'
  ),
  'Miami photos debe limitar tamano y tipos de imagen'
);

select pg_temp.assert_true(
  (
    select file_size_limit = 15728640
      and allowed_mime_types @> array['application/pdf', 'image/jpeg']::text[]
      and not (allowed_mime_types && array['text/html', 'image/svg+xml']::text[])
    from storage.buckets
    where id = 'booking-documents'
  ),
  'Booking documents debe excluir HTML/SVG y limitar tamano'
);

select pg_temp.assert_true(
  (
    select file_size_limit = 10485760
      and allowed_mime_types = array['application/pdf']::text[]
    from storage.buckets
    where id = 'proveedor-docs'
  ),
  'Proveedor docs debe aceptar unicamente PDF de hasta 10 MB'
);

select pg_temp.assert_true(
  (
    select file_size_limit = 5242880
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
      and not (allowed_mime_types && array['image/svg+xml', 'text/html']::text[])
    from storage.buckets
    where id = 'avatars'
  ),
  'Avatars debe aceptar unicamente imagenes raster seguras y pequenas'
);

select pg_temp.assert_true(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'miami_package_photos_select_active'
      and cmd = 'SELECT'
      and 'authenticated' = any (roles)
  ),
  'Miami photos debe requerir una cuenta autenticada activa'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
      and bool_and(permissive = 'RESTRICTIVE')
      and bool_and('public' = any (roles))
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'demo_sensitive_storage_insert_guard',
        'demo_sensitive_storage_update_guard',
        'demo_sensitive_storage_delete_guard'
      )
  ),
  'Las escrituras de buckets sensibles deben tener guards restrictivos demo para todos los roles'
);

select pg_temp.assert_true(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'demo_environment_storage_guard'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
  ),
  'El guard fail-closed general del ambiente demo debe permanecer activo'
);

rollback;

\echo 'demo_storage_hardening.sql: OK'

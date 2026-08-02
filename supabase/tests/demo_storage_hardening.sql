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

create or replace function pg_temp.expect_rls_denied(command text, message text)
returns void
language plpgsql
as $$
declare
  caught_message text;
begin
  begin
    execute command;
  exception when sqlstate '42501' then
    get stacked diagnostics caught_message = message_text;
    if position('row-level security' in lower(caught_message)) = 0 then
      raise exception 'ASSERTION FAILED: % (error inesperado: %)',
        message,
        caught_message;
    end if;
    return;
  end;

  raise exception 'ASSERTION FAILED: %', message;
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

update public.platform_environment
set environment = 'demo',
    project_ref = 'wlssekvxpfxhwedsjhpz',
    reset_enabled = false,
    reset_armed_at = null,
    dataset_version = null,
    dataset_seeded_at = null,
    dataset_client_id = null
where singleton is true;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.assert_true(
  public.is_demo_environment(),
  'anon debe poder evaluar el helper usado por el guard general de Storage'
);
select pg_temp.assert_true(
  public.is_restricted_demo_context(),
  'anon debe poder evaluar el helper usado por los guards sensibles de Storage'
);
select pg_temp.expect_rls_denied(
  $$insert into storage.objects (bucket_id, name)
    values ('avatars', 'demo-anon-test.png')$$,
  'Storage anonimo debe fallar por RLS y no por permisos del helper'
);

reset role;

rollback;

\echo 'demo_storage_hardening.sql: OK'

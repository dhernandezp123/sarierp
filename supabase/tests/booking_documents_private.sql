\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(value, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

create temporary table booking_documents_bucket_before as
select file_size_limit, allowed_mime_types
from storage.buckets
where id = 'booking-documents';

update storage.buckets
set public = true
where id = 'booking-documents';

\ir ../migrations/20260803121500_booking_documents_private.sql

select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(name = 'booking-documents')
      and bool_and(public is false)
    from storage.buckets
    where id = 'booking-documents'
  ),
  'booking-documents debe existir una sola vez y ser privado'
);

select pg_temp.assert_true(
  (
    select b.file_size_limit is not distinct from previous.file_size_limit
      and b.allowed_mime_types is not distinct from previous.allowed_mime_types
    from storage.buckets b
    cross join booking_documents_bucket_before previous
    where b.id = 'booking-documents'
  ),
  'La migracion no debe cambiar limites ni tipos MIME existentes'
);

\ir ../migrations/20260803121500_booking_documents_private.sql

select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(public is false)
    from storage.buckets
    where id = 'booking-documents'
  ),
  'La migracion debe ser idempotente'
);

rollback;

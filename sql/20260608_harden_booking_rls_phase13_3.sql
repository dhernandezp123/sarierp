-- Fase 13.3 - Hardening RLS operativo para bookings/documentos.
-- Ejecutar en Supabase SQL Editor o pipeline de migraciones.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.rol
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.is_admin_or_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('Admin', 'Operaciones'), false)
$$;

create or replace function public.is_sales_owner_of_shipping_instruction(
  p_shipping_instruction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shipping_instructions si
    where si.id = p_shipping_instruction_id
      and si.created_by = auth.uid()
      and public.current_user_role() = 'Ventas'
  )
$$;

create or replace function public.can_select_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        public.is_admin_or_operations()
        or public.is_sales_owner_of_shipping_instruction(b.shipping_instruction_id)
      )
  )
$$;

create or replace function public.booking_id_from_storage_object_name(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := nullif(split_part(coalesce(p_name, ''), '/', 1), '');

  if first_segment is null then
    return null;
  end if;

  begin
    return first_segment::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;

alter table public.bookings enable row level security;
alter table public.booking_containers enable row level security;
alter table public.booking_documents enable row level security;

drop policy if exists "bookings_select_policy"
on public.bookings;

create policy "bookings_select_policy"
on public.bookings
for select
to authenticated
using (
  public.is_admin_or_operations()
  or public.is_sales_owner_of_shipping_instruction(shipping_instruction_id)
);

drop policy if exists "bookings_insert_policy"
on public.bookings;

create policy "bookings_insert_policy"
on public.bookings
for insert
to authenticated
with check (public.is_admin_or_operations());

drop policy if exists "bookings_update_policy"
on public.bookings;

create policy "bookings_update_policy"
on public.bookings
for update
to authenticated
using (public.is_admin_or_operations())
with check (public.is_admin_or_operations());

drop policy if exists "bookings_delete_policy"
on public.bookings;

create policy "bookings_delete_policy"
on public.bookings
for delete
to authenticated
using (public.is_admin_or_operations());

drop policy if exists "booking_containers_select_policy"
on public.booking_containers;

create policy "booking_containers_select_policy"
on public.booking_containers
for select
to authenticated
using (public.can_select_booking(booking_id));

drop policy if exists "booking_containers_insert_policy"
on public.booking_containers;

create policy "booking_containers_insert_policy"
on public.booking_containers
for insert
to authenticated
with check (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
);

drop policy if exists "booking_containers_update_policy"
on public.booking_containers;

create policy "booking_containers_update_policy"
on public.booking_containers
for update
to authenticated
using (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
)
with check (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
);

drop policy if exists "booking_containers_delete_policy"
on public.booking_containers;

create policy "booking_containers_delete_policy"
on public.booking_containers
for delete
to authenticated
using (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
);

drop policy if exists "booking_documents_select_policy"
on public.booking_documents;

create policy "booking_documents_select_policy"
on public.booking_documents
for select
to authenticated
using (public.can_select_booking(booking_id));

drop policy if exists "booking_documents_insert_policy"
on public.booking_documents;

create policy "booking_documents_insert_policy"
on public.booking_documents
for insert
to authenticated
with check (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
  and uploaded_by = auth.uid()
);

drop policy if exists "booking_documents_update_policy"
on public.booking_documents;

create policy "booking_documents_update_policy"
on public.booking_documents
for update
to authenticated
using (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
)
with check (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
);

drop policy if exists "booking_documents_delete_policy"
on public.booking_documents;

create policy "booking_documents_delete_policy"
on public.booking_documents
for delete
to authenticated
using (
  public.is_admin_or_operations()
  and public.can_select_booking(booking_id)
);

drop policy if exists "booking_documents_storage_select_policy"
on storage.objects;

drop policy if exists "booking_documents_storage_select"
on storage.objects;

create policy "booking_documents_storage_select_policy"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'booking-documents'
  and public.can_select_booking(public.booking_id_from_storage_object_name(name))
);

drop policy if exists "booking_documents_storage_insert_policy"
on storage.objects;

drop policy if exists "booking_documents_storage_insert"
on storage.objects;

create policy "booking_documents_storage_insert_policy"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'booking-documents'
  and public.is_admin_or_operations()
  and public.can_select_booking(public.booking_id_from_storage_object_name(name))
);

drop policy if exists "booking_documents_storage_update_policy"
on storage.objects;

drop policy if exists "booking_documents_storage_update"
on storage.objects;

create policy "booking_documents_storage_update_policy"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'booking-documents'
  and public.is_admin_or_operations()
  and public.can_select_booking(public.booking_id_from_storage_object_name(name))
)
with check (
  bucket_id = 'booking-documents'
  and public.is_admin_or_operations()
  and public.can_select_booking(public.booking_id_from_storage_object_name(name))
);

drop policy if exists "booking_documents_storage_delete_policy"
on storage.objects;

drop policy if exists "booking_documents_storage_delete"
on storage.objects;

create policy "booking_documents_storage_delete_policy"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'booking-documents'
  and public.is_admin_or_operations()
  and public.can_select_booking(public.booking_id_from_storage_object_name(name))
);

notify pgrst, 'reload schema';

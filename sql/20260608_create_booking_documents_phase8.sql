create table if not exists public.booking_documents (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,

  document_type text not null,
  file_name text not null,
  file_url text not null,
  notes text,
  uploaded_by uuid,
  created_at timestamptz default now()
);

create index if not exists idx_booking_documents_booking_id
on public.booking_documents (booking_id);

create index if not exists idx_booking_documents_created_at
on public.booking_documents (created_at);

alter table public.booking_documents enable row level security;

-- Bucket esperado en Supabase Storage: booking-documents
-- Este bucket debe crearse/configurarse desde Supabase, no desde el frontend.

-- TODO: reforzar estas policies por roles cuando Gestion Documental salga del MVP.
drop policy if exists "booking_documents_select_policy"
on public.booking_documents;

create policy "booking_documents_select_policy"
on public.booking_documents
for select
to authenticated
using (true);

drop policy if exists "booking_documents_insert_policy"
on public.booking_documents;

create policy "booking_documents_insert_policy"
on public.booking_documents
for insert
to authenticated
with check (true);

drop policy if exists "booking_documents_update_policy"
on public.booking_documents;

create policy "booking_documents_update_policy"
on public.booking_documents
for update
to authenticated
using (true)
with check (true);

drop policy if exists "booking_documents_delete_policy"
on public.booking_documents;

create policy "booking_documents_delete_policy"
on public.booking_documents
for delete
to authenticated
using (true);

-- Storage policies MVP para el bucket esperado.
drop policy if exists "booking_documents_storage_select_policy"
on storage.objects;

create policy "booking_documents_storage_select_policy"
on storage.objects
for select
to authenticated
using (bucket_id = 'booking-documents');

drop policy if exists "booking_documents_storage_insert_policy"
on storage.objects;

create policy "booking_documents_storage_insert_policy"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'booking-documents');

drop policy if exists "booking_documents_storage_update_policy"
on storage.objects;

create policy "booking_documents_storage_update_policy"
on storage.objects
for update
to authenticated
using (bucket_id = 'booking-documents')
with check (bucket_id = 'booking-documents');

drop policy if exists "booking_documents_storage_delete_policy"
on storage.objects;

create policy "booking_documents_storage_delete_policy"
on storage.objects
for delete
to authenticated
using (bucket_id = 'booking-documents');

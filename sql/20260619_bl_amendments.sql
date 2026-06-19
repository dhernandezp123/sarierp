-- ============================================================
-- FASE 13: BL Amendments
-- Historial de cambios y registro de envios de draft al cliente
-- ============================================================

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

create or replace function public.is_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(p_roles), false)
$$;

create table if not exists public.bl_amendments (
  id uuid primary key default gen_random_uuid(),
  bl_id uuid not null references public.bills_of_lading(id) on delete cascade,
  amendment_number integer not null default 1,
  notes text,
  changed_fields jsonb,
  status_before text,
  status_after text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists bl_amendments_bl_id_idx on public.bl_amendments(bl_id);

alter table public.bl_amendments enable row level security;

drop policy if exists "authenticated_full_access" on public.bl_amendments;
drop policy if exists bl_amendments_operations_read on public.bl_amendments;
drop policy if exists bl_amendments_operations_write on public.bl_amendments;

create policy bl_amendments_operations_read on public.bl_amendments
  for select to authenticated
  using (public.is_role(array['Admin', 'Operaciones']));

create policy bl_amendments_operations_write on public.bl_amendments
  for all to authenticated
  using (public.is_role(array['Admin', 'Operaciones']))
  with check (public.is_role(array['Admin', 'Operaciones']));

create table if not exists public.bl_draft_sends (
  id uuid primary key default gen_random_uuid(),
  bl_id uuid not null references public.bills_of_lading(id) on delete cascade,
  sent_to text not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references auth.users(id) on delete set null,
  notes text
);

create index if not exists bl_draft_sends_bl_id_idx on public.bl_draft_sends(bl_id);

alter table public.bl_draft_sends enable row level security;

drop policy if exists "authenticated_full_access" on public.bl_draft_sends;
drop policy if exists bl_draft_sends_operations_read on public.bl_draft_sends;
drop policy if exists bl_draft_sends_operations_write on public.bl_draft_sends;

create policy bl_draft_sends_operations_read on public.bl_draft_sends
  for select to authenticated
  using (public.is_role(array['Admin', 'Operaciones']));

create policy bl_draft_sends_operations_write on public.bl_draft_sends
  for all to authenticated
  using (public.is_role(array['Admin', 'Operaciones']))
  with check (public.is_role(array['Admin', 'Operaciones']));

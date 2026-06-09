-- =========================================================
-- FASE 13.5
-- RLS para agent_quotes y pricing_items
-- =========================================================

-- Asegurar RLS
alter table public.agent_quotes enable row level security;
alter table public.pricing_items enable row level security;

-- =========================================================
-- Helpers
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.rol = 'Admin'
      and coalesce(p.is_active, true) = true
      and coalesce(p.status, 'Aprobado') = 'Aprobado'
  );
$$;

create or replace function public.is_approved_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, true) = true
      and coalesce(p.status, 'Aprobado') = 'Aprobado'
  );
$$;

-- =========================================================
-- agent_quotes policies
-- =========================================================

drop policy if exists "agent_quotes_select_policy" on public.agent_quotes;
drop policy if exists "agent_quotes_insert_policy" on public.agent_quotes;
drop policy if exists "agent_quotes_update_policy" on public.agent_quotes;
drop policy if exists "agent_quotes_delete_policy" on public.agent_quotes;

create policy "agent_quotes_select_policy"
on public.agent_quotes
for select
to authenticated
using (public.is_approved_active_user());

create policy "agent_quotes_insert_policy"
on public.agent_quotes
for insert
to authenticated
with check (public.is_approved_active_user());

create policy "agent_quotes_update_policy"
on public.agent_quotes
for update
to authenticated
using (public.is_approved_active_user())
with check (public.is_approved_active_user());

create policy "agent_quotes_delete_policy"
on public.agent_quotes
for delete
to authenticated
using (
  public.is_admin()
);

-- =========================================================
-- pricing_items policies
-- =========================================================

drop policy if exists "pricing_items_select_policy" on public.pricing_items;
drop policy if exists "pricing_items_insert_policy" on public.pricing_items;
drop policy if exists "pricing_items_update_policy" on public.pricing_items;
drop policy if exists "pricing_items_delete_policy" on public.pricing_items;

create policy "pricing_items_select_policy"
on public.pricing_items
for select
to authenticated
using (public.is_approved_active_user());

create policy "pricing_items_insert_policy"
on public.pricing_items
for insert
to authenticated
with check (public.is_approved_active_user());

create policy "pricing_items_update_policy"
on public.pricing_items
for update
to authenticated
using (public.is_approved_active_user())
with check (public.is_approved_active_user());

create policy "pricing_items_delete_policy"
on public.pricing_items
for delete
to authenticated
using (
  public.is_admin()
);

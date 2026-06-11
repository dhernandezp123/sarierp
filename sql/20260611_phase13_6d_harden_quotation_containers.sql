-- =========================================================
-- FASE 13.6D
-- RLS para quotation_containers
-- =========================================================

alter table public.quotation_containers enable row level security;

drop policy if exists "Allow manage quotation containers" on public.quotation_containers;
drop policy if exists "Allow read quotation containers" on public.quotation_containers;

drop policy if exists "quotation_containers_select_policy" on public.quotation_containers;
drop policy if exists "quotation_containers_insert_policy" on public.quotation_containers;
drop policy if exists "quotation_containers_update_policy" on public.quotation_containers;
drop policy if exists "quotation_containers_delete_policy" on public.quotation_containers;

create policy "quotation_containers_select_policy"
on public.quotation_containers
for select
to authenticated
using (
  public.can_select_quotation(quotation_id)
);

create policy "quotation_containers_insert_policy"
on public.quotation_containers
for insert
to authenticated
with check (
  public.can_select_quotation(quotation_id)
);

create policy "quotation_containers_update_policy"
on public.quotation_containers
for update
to authenticated
using (
  public.can_select_quotation(quotation_id)
)
with check (
  public.can_select_quotation(quotation_id)
);

create policy "quotation_containers_delete_policy"
on public.quotation_containers
for delete
to authenticated
using (
  public.is_admin()
  or public.can_select_quotation(quotation_id)
);

notify pgrst, 'reload schema';

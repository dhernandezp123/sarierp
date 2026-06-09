-- =========================================================
-- FASE 13.6B
-- RLS para quotation_cargo_lines
-- =========================================================

alter table public.quotation_cargo_lines enable row level security;

drop policy if exists "quotation_cargo_lines_select" on public.quotation_cargo_lines;
drop policy if exists "quotation_cargo_lines_insert" on public.quotation_cargo_lines;
drop policy if exists "quotation_cargo_lines_update" on public.quotation_cargo_lines;
drop policy if exists "quotation_cargo_lines_delete" on public.quotation_cargo_lines;

drop policy if exists "quotation_cargo_lines_select_policy" on public.quotation_cargo_lines;
drop policy if exists "quotation_cargo_lines_insert_policy" on public.quotation_cargo_lines;
drop policy if exists "quotation_cargo_lines_update_policy" on public.quotation_cargo_lines;
drop policy if exists "quotation_cargo_lines_delete_policy" on public.quotation_cargo_lines;

create policy "quotation_cargo_lines_select_policy"
on public.quotation_cargo_lines
for select
to authenticated
using (
  public.can_select_quotation(quotation_id)
);

create policy "quotation_cargo_lines_insert_policy"
on public.quotation_cargo_lines
for insert
to authenticated
with check (
  public.can_select_quotation(quotation_id)
);

create policy "quotation_cargo_lines_update_policy"
on public.quotation_cargo_lines
for update
to authenticated
using (
  public.can_select_quotation(quotation_id)
)
with check (
  public.can_select_quotation(quotation_id)
);

create policy "quotation_cargo_lines_delete_policy"
on public.quotation_cargo_lines
for delete
to authenticated
using (
  public.is_admin()
);

notify pgrst, 'reload schema';

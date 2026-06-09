-- =========================================================
-- HOTFIX
-- Permitir reemplazo de lineas de carga en edicion de cotizaciones
-- =========================================================

drop policy if exists "quotation_cargo_lines_delete_policy" on public.quotation_cargo_lines;

create policy "quotation_cargo_lines_delete_policy"
on public.quotation_cargo_lines
for delete
to authenticated
using (
  public.is_admin()
  or public.can_select_quotation(quotation_id)
);

notify pgrst, 'reload schema';

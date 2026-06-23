-- Fix: pricing_items DELETE policy era solo is_admin().
--
-- El flujo de guardado Miami (miami_lcl / miami_air) en la página de edición
-- de cotizaciones hace:
--   1. DELETE FROM pricing_items WHERE quotation_id = ?
--   2. INSERT INTO pricing_items (nuevo set calculado)
--
-- La política anterior solo permitía DELETE a Admin. Para Pricing/Ventas, el
-- DELETE "tenía éxito" (Supabase no retorna error cuando RLS filtra filas) pero
-- no borraba nada. El INSERT sí se ejecutaba, acumulando un set nuevo en cada
-- guardado sin reemplazar el anterior.
--
-- El patrón correcto coincide con quotation_cargo_lines_delete_policy y
-- quotation_containers_delete_policy: Admin OR can_select_quotation(quotation_id).

drop policy if exists "pricing_items_delete_policy" on public.pricing_items;

create policy "pricing_items_delete_policy"
  on public.pricing_items
  for delete
  to authenticated
  using (
    public.is_role(array['Admin', 'Pricing', 'Ventas', 'Operaciones'])
    and public.can_select_quotation(quotation_id)
  );

-- Ejecutar en Supabase SQL Editor antes de habilitar índices únicos de Fase 2.
-- Solo devuelve conteos agregados; no modifica datos.

select 'selected_agent_quote_conflicts' as check_name, count(*) as conflict_groups
from (
  select quotation_id
  from public.agent_quotes
  where is_selected is true and deleted_at is null
  group by quotation_id
  having count(*) > 1
) conflicts
union all
select 'duplicate_si_per_quotation', count(*)
from (
  select quotation_id
  from public.shipping_instructions
  where quotation_id is not null and deleted_at is null
  group by quotation_id
  having count(*) > 1
) conflicts
union all
select 'duplicate_supplier_invoice_number', count(*)
from (
  select proveedor_id, lower(trim(numero_factura_proveedor))
  from public.cuentas_pagar
  where tipo = 'AP'
    and numero_factura_proveedor is not null
    and trim(numero_factura_proveedor) <> ''
    and status <> 'Anulada'
  group by proveedor_id, lower(trim(numero_factura_proveedor))
  having count(*) > 1
) conflicts
union all
select 'duplicate_provider_invoice_item', count(*)
from (
  select quotation_id, lower(trim(coalesce(supplier, ''))), lower(trim(invoice_number))
  from public.provider_invoice_items
  where invoice_number is not null
    and trim(invoice_number) <> ''
    and deleted_at is null
  group by quotation_id, lower(trim(coalesce(supplier, ''))), lower(trim(invoice_number))
  having count(*) > 1
) conflicts
union all
select 'invalid_tipo_carga', count(*)
from public.miami_packages
where tipo_carga not in ('Paquetería', 'LCL', 'Aéreo Consolidado')
union all
select 'invalid_cargo_status', count(*)
from public.miami_packages
where cargo_status not in (
  'Recibido en Miami',
  'En Consolidación',
  'En Tránsito',
  'Llegado Honduras',
  'Entregado'
)
union all
select 'negative_package_measurements', count(*)
from public.miami_packages
where weight_lbs < 0
   or weight_kg < 0
   or length_in < 0
   or width_in < 0
   or height_in < 0
   or ft3 < 0
   or cbm < 0
union all
select 'duplicate_tracking_groups', count(*)
from (
  select lower(trim(tracking_number))
  from public.miami_packages
  where trim(tracking_number) <> ''
  group by lower(trim(tracking_number))
  having count(*) > 1
) conflicts;

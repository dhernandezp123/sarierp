-- AUDITORÍA NO DESTRUCTIVA: posibles pricing_items acumulados por FLOW-010.
--
-- Este archivo NO elimina datos. Una descripción repetida puede representar
-- cargos legítimos distintos; cualquier limpieza requiere revisar primero cada
-- cotización y respaldar los IDs aprobados por Pricing/Contabilidad.

-- 1. Grupos con descripciones repetidas.
select
  quotation_id,
  item_type,
  description,
  count(*) as filas,
  min(created_at) as primer_guardado,
  max(created_at) as ultimo_guardado,
  round(sum(coalesce(sale_amount, 0) * coalesce(quantity, 1))::numeric, 2)
    as venta_acumulada
from public.pricing_items
where deleted_at is null
group by quotation_id, item_type, description
having count(*) > 1
order by filas desc, quotation_id, item_type, description;

-- 2. Candidatos de duplicación exacta. Incluso estas filas deben revisarse:
-- rate_code, importes, proveedor, impuestos y notas forman la huella completa.
with ranked as (
  select
    id,
    quotation_id,
    item_type,
    description,
    rate_code,
    cost_amount,
    sale_amount,
    currency,
    supplier,
    notes,
    quantity,
    taxable,
    tax_rate,
    tax_amount,
    total_amount,
    created_at,
    row_number() over (
      partition by
        quotation_id,
        item_type,
        description,
        coalesce(rate_code, ''),
        coalesce(cost_amount, 0),
        coalesce(sale_amount, 0),
        coalesce(currency, ''),
        coalesce(supplier, ''),
        coalesce(notes, ''),
        coalesce(quantity, 1),
        coalesce(taxable, false),
        coalesce(tax_rate, 0),
        coalesce(tax_amount, 0),
        coalesce(total_amount, 0)
      order by created_at desc, id desc
    ) as duplicate_rank
  from public.pricing_items
  where deleted_at is null
)
select *
from ranked
where duplicate_rank > 1
order by quotation_id, item_type, description, created_at desc;

-- Procedimiento recomendado si se aprueba una limpieza:
-- 1. Exportar las filas candidatas.
-- 2. Confirmar los IDs con Pricing/Contabilidad.
-- 3. Ejecutar un DELETE por lista explícita de UUID dentro de BEGIN/ROLLBACK.
-- 4. Verificar PDF, total de venta, costo y GP antes de COMMIT.

-- Fase 5A: clasificación read-only del backfill SI -> shipment.
-- Ejecutar con un rol de mantenimiento. No modifica datos.

with routing_counts as (
  select
    nullif(btrim(routing_number), '') as routing_number,
    count(*) as occurrences
  from public.shipping_instructions
  group by nullif(btrim(routing_number), '')
),
classified as (
  select
    si.id as shipping_instruction_id,
    si.routing_number,
    si.quotation_id,
    coalesce(si.client_id, q.cliente_id) as resolved_client_id,
    coalesce(si.operational_status, si.shipment_status, '') as legacy_status,
    case
      when si.quotation_id is null then 'B_SI_WITHOUT_QUOTATION'
      when coalesce(si.client_id, q.cliente_id) is null
        then 'C_SI_WITHOUT_RESOLVABLE_CLIENT'
      when nullif(btrim(si.routing_number), '') is null
        or coalesce(rc.occurrences, 0) > 1
        then 'D_ROUTING_EXCEPTION'
      when coalesce(si.operational_status, si.shipment_status, '')
        in ('Finalizado', 'Cancelada')
        then 'F_HISTORICAL_CLOSED'
      when coalesce(si.operational_status, si.shipment_status, '')
        not in (
          'Pendiente Validación', 'Validada', 'Asignado',
          'Listo para Booking', 'En Booking', 'Booking Solicitado',
          'Booking Confirmado', 'Documentación Pendiente',
          'Listo para Embarque', 'Embarcado', 'En Tránsito',
          'Arribado', 'Finalizado', 'Cancelada'
        )
        then 'E_UNKNOWN_STATUS'
      else 'A_COMPLETE'
    end as expected_classification,
    shipment.id as shipment_id,
    shipment.shipment_number,
    shipment.metadata ->> 'migration_classification' as stored_classification,
    shipment.metadata -> 'migration_notes' as migration_notes
  from public.shipping_instructions si
  left join public.quotations q on q.id = si.quotation_id
  left join routing_counts rc
    on rc.routing_number is not distinct from nullif(btrim(si.routing_number), '')
  left join public.shipments shipment
    on shipment.shipping_instruction_id = si.id
)
select
  expected_classification,
  count(*) as source_rows,
  count(*) filter (where shipment_id is not null) as migrated_rows,
  count(*) filter (
    where stored_classification is distinct from expected_classification
  ) as classification_differences
from classified
group by expected_classification
order by expected_classification;

select
  si.id as shipping_instruction_id,
  si.routing_number,
  shipment.id as shipment_id,
  shipment.shipment_number,
  shipment.metadata ->> 'migration_classification' as classification,
  shipment.metadata -> 'migration_notes' as migration_notes
from public.shipping_instructions si
left join public.shipments shipment
  on shipment.shipping_instruction_id = si.id
where shipment.id is null
   or coalesce(
     shipment.metadata ->> 'migration_classification',
     'A_COMPLETE'
   ) <> 'A_COMPLETE'
order by si.created_at, si.id;

\pset pager off

-- Toda fila es un hallazgo.
select 'vgm_booking_shipment_mismatch' as finding,
       vgm.id as entity_id,
       jsonb_build_object(
         'vgm_shipment_id', vgm.shipment_id,
         'booking_shipment_id', booking.shipment_id
       ) as details
from public.container_vgm_records vgm
join public.bookings booking on booking.id = vgm.booking_id
where vgm.shipment_id is distinct from booking.shipment_id
union all
select 'vgm_container_booking_mismatch',
       vgm.id,
       jsonb_build_object(
         'vgm_booking_id', vgm.booking_id,
         'container_booking_id', container.booking_id
       )
from public.container_vgm_records vgm
join public.booking_containers container
  on container.id = vgm.booking_container_id
where vgm.booking_id is distinct from container.booking_id
union all
select 'vgm_invalid_mass',
       vgm.id,
       jsonb_build_object(
         'gross_mass', vgm.gross_mass,
         'unit', vgm.unit
       )
from public.container_vgm_records vgm
where vgm.gross_mass <= 0
   or vgm.unit not in ('KG', 'LB')
union all
select 'vgm_non_physical_container_row',
       vgm.id,
       jsonb_build_object('container_quantity', container.quantity)
from public.container_vgm_records vgm
join public.booking_containers container
  on container.id = vgm.booking_container_id
where coalesce(container.quantity, 0) <> 1
union all
select 'vgm_document_booking_mismatch',
       vgm.id,
       jsonb_build_object(
         'vgm_booking_id', vgm.booking_id,
         'document_booking_id', document.booking_id
       )
from public.container_vgm_records vgm
join public.booking_documents document on document.id = vgm.document_id
where vgm.booking_id is distinct from document.booking_id
union all
select 'vgm_on_non_fcl_booking',
       vgm.id,
       jsonb_build_object(
         'mode', public.booking_operational_mode(vgm.booking_id)
       )
from public.container_vgm_records vgm
where public.booking_operational_mode(vgm.booking_id) <> 'SEA_FCL'
order by finding, entity_id;

select 'duplicate_active_vgm' as finding,
       booking_container_id,
       count(*) as total
from public.container_vgm_records
where status in ('DRAFT', 'VERIFIED', 'SUBMITTED', 'ACCEPTED')
group by booking_container_id
having count(*) > 1
order by booking_container_id;

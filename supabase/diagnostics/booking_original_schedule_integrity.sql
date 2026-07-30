-- Fase 5B: fechas originales que no coinciden con la primera evidencia.

select
  b.id as booking_id,
  b.shipment_id,
  b.original_etd,
  initial.etd as initial_etd,
  b.original_eta,
  initial.eta as initial_eta,
  case
    when initial.source <> 'phase_5b_backfill'
      and b.original_etd is distinct from initial.etd
      and initial.etd is not null then 'ORIGINAL_ETD_MISMATCH'
    when initial.source <> 'phase_5b_backfill'
      and b.original_eta is distinct from initial.eta
      and initial.eta is not null then 'ORIGINAL_ETA_MISMATCH'
    when b.original_etd is null and b.etd is not null
      then 'ORIGINAL_ETD_MISSING'
    when b.original_eta is null and b.eta is not null
      then 'ORIGINAL_ETA_MISSING'
  end as finding
from public.bookings b
left join lateral (
  select r.etd, r.eta, r.source
  from public.booking_schedule_revisions r
  where r.booking_id = b.id
  order by r.revision_number
  limit 1
) initial on true
where (
    initial.source <> 'phase_5b_backfill'
    and
    b.original_etd is distinct from initial.etd
    and initial.etd is not null
  )
  or (
    initial.source <> 'phase_5b_backfill'
    and
    b.original_eta is distinct from initial.eta
    and initial.eta is not null
  )
  or (b.original_etd is null and b.etd is not null)
  or (b.original_eta is null and b.eta is not null)
order by b.shipment_id, b.id;

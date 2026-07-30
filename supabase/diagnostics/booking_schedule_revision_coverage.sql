-- Fase 5B: bookings con schedule conocido sin revision inicial y secuencias rotas.

with schedule_bookings as (
  select b.id, b.shipment_id
  from public.bookings b
  where nullif(btrim(coalesce(b.carrier, '')), '') is not null
     or nullif(btrim(coalesce(b.booking_number, '')), '') is not null
     or nullif(btrim(coalesce(b.carrier_booking, '')), '') is not null
     or nullif(btrim(coalesce(b.vessel_name, '')), '') is not null
     or nullif(btrim(coalesce(b.voyage, '')), '') is not null
     or b.etd is not null
     or b.eta is not null
     or nullif(btrim(coalesce(b.routing_summary, '')), '') is not null
),
revision_stats as (
  select
    r.booking_id,
    count(*) as revision_count,
    count(*) filter (
      where r.revision_number = 1
        and r.revision_type = 'INITIAL'
    ) as initial_count,
    min(r.revision_number) as min_revision,
    max(r.revision_number) as max_revision,
    count(distinct r.revision_number) as distinct_revision_count
  from public.booking_schedule_revisions r
  group by r.booking_id
)
select
  b.id as booking_id,
  b.shipment_id,
  coalesce(stats.revision_count, 0) as revision_count,
  coalesce(stats.initial_count, 0) as initial_count,
  case
    when stats.booking_id is null then 'MISSING_ALL_REVISIONS'
    when stats.initial_count <> 1 then 'INVALID_INITIAL_REVISION'
    when stats.min_revision <> 1 then 'SEQUENCE_DOES_NOT_START_AT_ONE'
    when stats.max_revision <> stats.distinct_revision_count
      then 'REVISION_SEQUENCE_GAP'
  end as finding
from schedule_bookings b
left join revision_stats stats on stats.booking_id = b.id
where stats.booking_id is null
   or stats.initial_count <> 1
   or stats.min_revision <> 1
   or stats.max_revision <> stats.distinct_revision_count
order by b.shipment_id, b.id;

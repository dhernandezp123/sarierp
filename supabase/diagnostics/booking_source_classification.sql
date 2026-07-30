-- Solo diagnostico. No modifica datos.
with booking_stats as (
  select
    si.id as shipping_instruction_id,
    count(b.id)::integer as booking_count,
    (min(b.id::text) filter (where b.id is not null))::uuid as only_booking_id,
    bool_or(
      nullif(btrim(b.booking_number), '') is not null
      or nullif(btrim(b.carrier_booking), '') is not null
    ) as child_has_identifier
  from public.shipping_instructions si
  left join public.bookings b
    on b.shipping_instruction_id = si.id
  group by si.id
),
base as (
  select
    si.*,
    bs.booking_count,
    bs.only_booking_id,
    coalesce(bs.child_has_identifier, false) as child_has_identifier,
    (
      nullif(btrim(si.booking_number), '') is not null
      or nullif(btrim(si.carrier_booking), '') is not null
      or nullif(btrim(si.master_bl), '') is not null
      or nullif(btrim(si.house_bl), '') is not null
      or nullif(btrim(si.vessel_name), '') is not null
      or nullif(btrim(si.voyage), '') is not null
      or nullif(btrim(si.tracking_url), '') is not null
      or si.original_eta is not null
      or si.actual_etd is not null
      or si.actual_eta is not null
      or si.eir_date is not null
      or si.real_transit_days is not null
      or si.remaining_free_days is not null
      or nullif(btrim(si.operational_comments), '') is not null
    ) as legacy_payload_present
  from public.shipping_instructions si
  join booking_stats bs on bs.shipping_instruction_id = si.id
),
compared as (
  select
    x.*,
    b.id as booking_id,
    (
      (nullif(lower(btrim(x.booking_number)), '') is not null
       and nullif(lower(btrim(b.booking_number)), '') is not null
       and lower(btrim(x.booking_number)) <> lower(btrim(b.booking_number)))::integer
      +
      (nullif(lower(btrim(x.carrier_booking)), '') is not null
       and nullif(lower(btrim(b.carrier_booking)), '') is not null
       and lower(btrim(x.carrier_booking)) <> lower(btrim(b.carrier_booking)))::integer
      +
      (x.etd is not null and b.etd is not null and x.etd <> b.etd)::integer
      +
      (x.eta is not null and b.eta is not null and x.eta <> b.eta)::integer
      +
      (x.actual_etd is not null and b.actual_etd is not null
       and x.actual_etd <> b.actual_etd)::integer
      +
      (x.actual_eta is not null and b.actual_eta is not null
       and x.actual_eta <> b.actual_eta)::integer
      +
      (x.original_eta is not null and b.original_eta is not null
       and x.original_eta <> b.original_eta)::integer
      +
      (x.estimated_transit_days is not null
       and b.estimated_transit_days is not null
       and x.estimated_transit_days <> b.estimated_transit_days)::integer
      +
      (x.real_transit_days is not null
       and b.real_transit_days is not null
       and x.real_transit_days <> b.real_transit_days)::integer
      +
      (x.remaining_free_days is not null
       and b.remaining_free_days is not null
       and x.remaining_free_days <> b.remaining_free_days)::integer
    ) as conflict_count
  from base x
  left join public.bookings b on b.id = x.only_booking_id
)
select
  id,
  routing_number,
  booking_id,
  primary_booking_id,
  booking_count,
  legacy_payload_present,
  conflict_count,
  case
    when coalesce(operational_status, shipment_status) in ('Finalizado', 'Cancelada')
         and (booking_count = 0 or not child_has_identifier)
      then 'G'
    when booking_count > 1 then 'F'
    when not legacy_payload_present and booking_count = 0 then 'A'
    when legacy_payload_present and booking_count = 0 then 'B'
    when not legacy_payload_present and booking_count = 1 then 'C'
    when legacy_payload_present and booking_count = 1 and conflict_count = 0 then 'D'
    when legacy_payload_present and booking_count = 1 and conflict_count > 0 then 'E'
    else 'REVISAR'
  end as migration_class
from compared
order by migration_class, created_at;

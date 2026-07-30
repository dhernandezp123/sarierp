-- Solo diagnostico. Reporta diferencias sin decidir cual valor es correcto.
select
  si.id as shipping_instruction_id,
  si.routing_number,
  b.id as booking_id,
  diff.field_name as field,
  diff.legacy_value,
  diff.booking_value,
  case
    when diff.legacy_value is null then 'KEEP_BOOKING'
    when diff.booking_value is null then 'CANDIDATE_BACKFILL'
    when diff.normalized_legacy = diff.normalized_booking then 'CONSISTENT'
    else 'MANUAL_REVIEW'
  end as proposed_rule,
  (
    diff.legacy_value is not null
    and diff.booking_value is not null
    and diff.normalized_legacy <> diff.normalized_booking
  ) as requires_manual_review
from public.shipping_instructions si
join public.bookings b
  on b.shipping_instruction_id = si.id
join (
  select shipping_instruction_id
  from public.bookings
  group by shipping_instruction_id
  having count(*) = 1
) singleton on singleton.shipping_instruction_id = si.id
cross join lateral (
  values
    ('booking_number', nullif(btrim(si.booking_number), ''), nullif(btrim(b.booking_number), ''),
      lower(nullif(btrim(si.booking_number), '')), lower(nullif(btrim(b.booking_number), ''))),
    ('carrier_booking', nullif(btrim(si.carrier_booking), ''), nullif(btrim(b.carrier_booking), ''),
      lower(nullif(btrim(si.carrier_booking), '')), lower(nullif(btrim(b.carrier_booking), ''))),
    ('carrier', nullif(btrim(si.carrier), ''), nullif(btrim(b.carrier), ''),
      upper(nullif(btrim(si.carrier), '')), upper(nullif(btrim(b.carrier), ''))),
    ('vessel_name', nullif(btrim(si.vessel_name), ''), nullif(btrim(b.vessel_name), ''),
      upper(nullif(btrim(si.vessel_name), '')), upper(nullif(btrim(b.vessel_name), ''))),
    ('voyage', nullif(btrim(si.voyage), ''), nullif(btrim(b.voyage), ''),
      upper(nullif(btrim(si.voyage), '')), upper(nullif(btrim(b.voyage), ''))),
    ('etd', si.etd::text, b.etd::text, si.etd::text, b.etd::text),
    ('eta', si.eta::text, b.eta::text, si.eta::text, b.eta::text),
    ('actual_etd', si.actual_etd::text, b.actual_etd::text, si.actual_etd::text, b.actual_etd::text),
    ('actual_eta', si.actual_eta::text, b.actual_eta::text, si.actual_eta::text, b.actual_eta::text),
    ('original_eta', si.original_eta::text, b.original_eta::text, si.original_eta::text, b.original_eta::text),
    ('master_bl', nullif(btrim(si.master_bl), ''), nullif(btrim(b.master_bl), ''),
      upper(nullif(btrim(si.master_bl), '')), upper(nullif(btrim(b.master_bl), ''))),
    ('house_bl', nullif(btrim(si.house_bl), ''), nullif(btrim(b.house_bl), ''),
      upper(nullif(btrim(si.house_bl), '')), upper(nullif(btrim(b.house_bl), ''))),
    ('remaining_free_days', si.remaining_free_days::text, b.remaining_free_days::text,
      si.remaining_free_days::text, b.remaining_free_days::text)
) diff(field_name, legacy_value, booking_value, normalized_legacy, normalized_booking)
where diff.legacy_value is distinct from diff.booking_value
order by si.routing_number, b.id, diff.field_name;

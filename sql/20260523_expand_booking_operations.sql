alter table public.shipping_instructions
  add column if not exists reference_number text,
  add column if not exists vessel_name text,
  add column if not exists voyage text,
  add column if not exists tracking_url text,
  add column if not exists original_eta date,
  add column if not exists actual_etd date,
  add column if not exists actual_eta date,
  add column if not exists eir_date date,
  add column if not exists estimated_transit_days integer,
  add column if not exists real_transit_days integer,
  add column if not exists remaining_free_days integer,
  add column if not exists operational_comments text;
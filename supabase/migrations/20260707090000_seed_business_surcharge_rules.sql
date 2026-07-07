insert into public.surcharge_rules (
  code,
  label,
  service_product,
  calculation_type,
  fixed_amount,
  minimum_amount,
  currency,
  is_active
)
values
  (
    'miami_air_min_small',
    'Miami Air Minimum < 22 KG',
    'miami_air',
    'fixed',
    270,
    22,
    'USD',
    true
  ),
  (
    'miami_air_min_large',
    'Miami Air Minimum 22-40 KG',
    'miami_air',
    'fixed',
    375,
    40,
    'USD',
    true
  ),
  (
    'bank_transfer_fee',
    'Bank Transfer Fee',
    'other_origin_fcl',
    'fixed',
    25,
    0,
    'USD',
    true
  )
on conflict (code) do update
set
  label = excluded.label,
  service_product = excluded.service_product,
  calculation_type = excluded.calculation_type,
  fixed_amount = excluded.fixed_amount,
  minimum_amount = excluded.minimum_amount,
  currency = excluded.currency,
  is_active = excluded.is_active,
  updated_at = now();

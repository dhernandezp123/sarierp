alter table public.quotations
  add column if not exists service_product text,
  add column if not exists trade_direction text default 'import';

alter table public.quotations
drop constraint if exists quotations_trade_direction_check;

alter table public.quotations
add constraint quotations_trade_direction_check
check (
  trade_direction in ('import', 'export')
);

alter table public.quotations
drop constraint if exists quotations_service_product_check;

alter table public.quotations
add constraint quotations_service_product_check
check (
  service_product in (
    'miami_lcl',
    'miami_air',
    'other_origin_fcl',
    'other_origin_lcl',
    'usa_ltl_ftl',
    'courier'
  )
  or service_product is null
);
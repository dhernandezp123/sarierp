-- Agrega 'other_origin_air' (Aéreo Consolidado) como valor válido de service_product.
-- Se deben recrear los check constraints en quotations y surcharge_rules.

alter table public.quotations
  drop constraint if exists "quotations_service_product_check";

alter table public.quotations
  add constraint "quotations_service_product_check"
  check (
    service_product is null or
    service_product = any (array[
      'miami_lcl',
      'miami_air',
      'other_origin_fcl',
      'other_origin_lcl',
      'other_origin_air',
      'usa_ltl_ftl',
      'courier'
    ])
  );

alter table public.surcharge_rules
  drop constraint if exists "surcharge_rules_service_product_check";

alter table public.surcharge_rules
  add constraint "surcharge_rules_service_product_check"
  check (
    service_product = any (array[
      'miami_lcl',
      'miami_air',
      'other_origin_fcl',
      'other_origin_lcl',
      'other_origin_air',
      'usa_ltl_ftl',
      'courier'
    ])
  );

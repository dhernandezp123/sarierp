alter table public.company_settings
  add column if not exists insurance_excluded_service_patterns text[]
  not null default array['DTHC']::text[];

comment on column public.company_settings.insurance_excluded_service_patterns is
  'Textos que excluyen lineas de la base Full Cover al coincidir parcialmente con pricing_items.rate_code, description o item_type.';

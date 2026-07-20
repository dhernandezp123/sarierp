alter table public.company_settings
  add column if not exists insurance_included_service_patterns text[]
  not null default array[
    'Ocean Freight',
    'Origen',
    'origin_charge',
    'Documentación',
    'Aduana'
  ]::text[];

alter table public.company_settings
  alter column insurance_included_service_patterns set default array[
    'Ocean Freight',
    'Origen',
    'origin_charge',
    'Documentación',
    'Aduana'
  ]::text[];

update public.company_settings
set insurance_included_service_patterns = array[
  'Ocean Freight',
  'Origen',
  'origin_charge',
  'Documentación',
  'Aduana'
]::text[]
where insurance_included_service_patterns = array[
  'Ocean Freight',
  'Origen',
  'origin_charge'
]::text[];

alter table public.pricing_items
  add column if not exists insurance_coverage_override boolean;

comment on column public.company_settings.insurance_included_service_patterns is
  'Textos que incluyen servicios por defecto en la base del seguro al coincidir con rate_code, description o item_type.';

comment on column public.pricing_items.insurance_coverage_override is
  'TRUE fuerza la inclusion excepcional de la linea en el seguro; FALSE fuerza su exclusion; NULL aplica la politica general de empresa.';

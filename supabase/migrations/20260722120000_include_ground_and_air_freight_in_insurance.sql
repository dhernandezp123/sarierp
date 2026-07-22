alter table public.company_settings
  alter column insurance_included_service_patterns set default array[
    'Ocean Freight',
    'Flete Terrestre',
    'Air Freight',
    'Aéreo Consolidado',
    'Origen',
    'origin_charge',
    'Documentación',
    'Aduana'
  ]::text[];

update public.company_settings
set insurance_included_service_patterns =
  insurance_included_service_patterns || array['Flete Terrestre']::text[]
where not insurance_included_service_patterns @> array['Flete Terrestre']::text[];

update public.company_settings
set insurance_included_service_patterns =
  insurance_included_service_patterns || array['Air Freight']::text[]
where not insurance_included_service_patterns @> array['Air Freight']::text[];

update public.company_settings
set insurance_included_service_patterns =
  insurance_included_service_patterns || array['Aéreo Consolidado']::text[]
where not insurance_included_service_patterns @> array['Aéreo Consolidado']::text[];

comment on column public.company_settings.insurance_included_service_patterns is
  'Textos que incluyen servicios por defecto en la base del seguro al coincidir con rate_code, description o item_type. Debe incluir el flete principal marítimo, terrestre y aéreo.';

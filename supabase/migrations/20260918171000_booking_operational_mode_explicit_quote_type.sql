-- Refinamiento aditivo: service_product puede contener simultáneamente LTL y
-- FTL (por ejemplo usa_ltl_ftl). El quote_type explícito es la fuente más
-- precisa y debe evaluarse antes de los textos genéricos del servicio.

create or replace function public.booking_operational_mode(
  p_booking_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with source as (
    select
      lower(
        translate(coalesce(q.quote_type, ''), 'áéíóúüñ', 'aeiouun')
      ) as quote_type,
      lower(
        translate(
          concat_ws(
            ' ',
            q.tipo_transporte,
            q.service_product,
            s.service_type
          ),
          'áéíóúüñ',
          'aeiouun'
        )
      ) as context
    from public.bookings b
    join public.shipments s on s.id = b.shipment_id
    left join public.quotations q on q.id = s.quotation_id
    where b.id = p_booking_id
  )
  select case
    when context ~ '(aereo|air|miami_air|courier)' then 'AIR'
    when quote_type = 'ftl' then 'ROAD_FTL'
    when quote_type = 'ltl' then 'ROAD_LTL'
    when quote_type = 'lcl' then 'SEA_LCL'
    when quote_type = 'fcl' then 'SEA_FCL'
    when context ~ '(ftl)' then 'ROAD_FTL'
    when context ~ '(terrestre|road|truck|ltl)' then 'ROAD_LTL'
    when context ~ '(lcl|miami_lcl|consolidado maritimo)' then 'SEA_LCL'
    when context ~ '(fcl|maritima|maritimo|ocean)' then 'SEA_FCL'
    else 'UNKNOWN'
  end
  from source
$$;

comment on function public.booking_operational_mode(uuid) is
  'Clasifica modalidad canónica priorizando quote_type explícito sobre etiquetas compartidas del servicio.';

-- Fase de unificación operativa: FTL debe evaluarse antes de la categoría
-- terrestre genérica. De lo contrario, "FTL Terrestre" se clasifica ROAD_LTL
-- y readiness aplica reglas de carga consolidada a un embarque dedicado.

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
    select lower(
      translate(
        concat_ws(
          ' ',
          q.tipo_transporte,
          q.quote_type,
          q.service_product,
          s.service_type
        ),
        'áéíóúüñ',
        'aeiouun'
      )
    ) as value
    from public.bookings b
    join public.shipments s on s.id = b.shipment_id
    left join public.quotations q on q.id = s.quotation_id
    where b.id = p_booking_id
  )
  select case
    when value ~ '(aereo|air|miami_air|courier)' then 'AIR'
    when value ~ '(ftl)' then 'ROAD_FTL'
    when value ~ '(terrestre|road|truck|ltl)' then 'ROAD_LTL'
    when value ~ '(lcl|miami_lcl|consolidado maritimo)' then 'SEA_LCL'
    when value ~ '(fcl|maritima|maritimo|ocean)' then 'SEA_FCL'
    else 'UNKNOWN'
  end
  from source
$$;

comment on function public.booking_operational_mode(uuid) is
  'Clasifica la modalidad operativa canónica; prioriza FTL sobre transporte terrestre genérico.';

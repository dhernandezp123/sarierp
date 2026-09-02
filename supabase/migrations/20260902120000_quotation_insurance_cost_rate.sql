alter table public.quotations
  add column if not exists insurance_cost_rate_percent numeric(7, 4);

alter table public.quotations
  drop constraint if exists quotations_insurance_cost_rate_percent_check;

alter table public.quotations
  add constraint quotations_insurance_cost_rate_percent_check
  check (
    insurance_cost_rate_percent is null
    or (
      insurance_cost_rate_percent > 0
      and insurance_cost_rate_percent <= 5
    )
  );

comment on column public.quotations.insurance_cost_rate_percent is
  'Tasa de costo de seguro aplicada específicamente a la cotización. NULL usa la tasa corporativa vigente hasta que el seguro se calcula.';

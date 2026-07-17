alter table public.company_settings
  add column if not exists insurance_cost_rate_percent numeric(7, 4) not null default 0.28;

alter table public.company_settings
  drop constraint if exists company_settings_insurance_cost_rate_percent_check;

alter table public.company_settings
  add constraint company_settings_insurance_cost_rate_percent_check
  check (
    insurance_cost_rate_percent > 0
    and insurance_cost_rate_percent <= 5
  );

comment on column public.company_settings.insurance_cost_rate_percent is
  'Porcentaje de costo que cobra la aseguradora para seguro de carga Full Cover. Ejemplo: 0.28 representa 0.28%.';

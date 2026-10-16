begin;

-- Existing activities remain unclassified; do not invent execution history.
alter table public.sales_activities add column estado_ejecucion text;
alter table public.sales_activities alter column estado_ejecucion set default 'Pendiente';
alter table public.sales_activities add constraint sales_activities_execution_status_check
  check (estado_ejecucion in ('Pendiente', 'Realizada', 'Cancelada'));
comment on column public.sales_activities.estado_ejecucion is
  'Execution status explicitly recorded by the team. NULL means historical/unclassified.';

-- Existing tenant/approved-active/owner RLS policies continue to authorize access.
notify pgrst, 'reload schema';
commit;

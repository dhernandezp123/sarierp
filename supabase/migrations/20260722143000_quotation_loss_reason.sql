alter table public.quotations
  add column if not exists loss_reason text,
  add column if not exists loss_reason_detail text;

comment on column public.quotations.loss_reason is
  'Razón categorizada seleccionada al marcar la cotización como Perdida.';

comment on column public.quotations.loss_reason_detail is
  'Detalle requerido cuando la razón de pérdida seleccionada es Otra.';

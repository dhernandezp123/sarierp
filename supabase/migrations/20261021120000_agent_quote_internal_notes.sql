-- PNOTE-01: comentarios internos por tarifa, separados de las condiciones
-- comerciales y de pricing_notes de Ventas. Mantiene los permisos/RLS vigentes.
alter table public.agent_quotes
  add column internal_notes text;

comment on column public.agent_quotes.internal_notes is
  'Notas internas por opcion de tarifa: motivo de eleccion y comentarios del equipo. Excluir de PDF comercial y portal.';

notify pgrst, 'reload schema';

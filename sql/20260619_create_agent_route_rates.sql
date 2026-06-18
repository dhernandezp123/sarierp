-- ============================================================
-- TARIFAS POR RUTA DE AGENTES
-- Corre este script en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_route_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,

  -- Ruta
  origin text NOT NULL,
  destination text NOT NULL,
  carrier text,

  -- Tipo de servicio
  service_type text NOT NULL
    CHECK (service_type IN (
      'FCL 20''', 'FCL 40''', 'FCL 40HC', 'FCL 45HC',
      'LCL', 'Aéreo', 'Aéreo Consolidado', 'Terrestre LTL', 'Terrestre FTL', 'Courier'
    )),

  -- Tarifa
  base_rate numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',

  -- Detalles
  transit_time integer,
  transshipment text,
  free_days_destination integer DEFAULT 14,

  -- Vigencia
  valid_from date,
  valid_until date,

  -- Notas
  notes text,

  -- Auditoría
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS agent_route_rates_agent_id_idx ON public.agent_route_rates(agent_id);
CREATE INDEX IF NOT EXISTS agent_route_rates_origin_destination_idx ON public.agent_route_rates(origin, destination);
CREATE INDEX IF NOT EXISTS agent_route_rates_valid_until_idx ON public.agent_route_rates(valid_until);

-- RLS
ALTER TABLE public.agent_route_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.agent_route_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

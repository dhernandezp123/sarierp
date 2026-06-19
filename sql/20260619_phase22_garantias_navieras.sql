-- =========================================================
-- FASE 22 — Garantías Navieras
-- Registro de depósitos de garantía por contenedor a navieras
-- con seguimiento de recuperación y alertas de vencimiento.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.garantias_navieras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid REFERENCES public.bookings(id) ON DELETE SET NULL,

  -- Identificación
  naviera       text NOT NULL,
  contenedor    text,                   -- número de contenedor
  bl_number     text,                   -- referencia al BL/HBL

  -- Monto
  monto         numeric(12,2) NOT NULL,
  moneda        text NOT NULL DEFAULT 'USD',

  -- Fechas clave
  fecha_deposito             date NOT NULL,
  fecha_vencimiento_libre    date,       -- fecha límite para devolver el contenedor
  fecha_recuperacion         date,       -- cuando se recuperó el depósito

  -- Estado
  status        text NOT NULL DEFAULT 'Depositada'
                CHECK (status IN ('Depositada', 'Recuperada', 'Vencida')),

  -- Notas
  notas         text,

  -- Auditoría
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS garantias_navieras_booking_idx  ON public.garantias_navieras(booking_id);
CREATE INDEX IF NOT EXISTS garantias_navieras_status_idx   ON public.garantias_navieras(status);
CREATE INDEX IF NOT EXISTS garantias_navieras_naviera_idx  ON public.garantias_navieras(naviera);
CREATE INDEX IF NOT EXISTS garantias_navieras_vencimiento_idx ON public.garantias_navieras(fecha_vencimiento_libre);

-- RLS
ALTER TABLE public.garantias_navieras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "garantias_select" ON public.garantias_navieras
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

CREATE POLICY "garantias_insert" ON public.garantias_navieras
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user());

CREATE POLICY "garantias_update" ON public.garantias_navieras
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user())
  WITH CHECK (public.is_approved_active_user());

CREATE POLICY "garantias_delete" ON public.garantias_navieras
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user());

NOTIFY pgrst, 'reload schema';

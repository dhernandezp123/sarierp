-- =========================================================
-- FASE 21 — Miami: tipo de carga + cargo_status
-- Solo ADD COLUMN (nullable/default), sin tocar lógica existente.
-- El campo "status" original (asignación de cliente) se mantiene intacto.
-- El nuevo "cargo_status" rastrea la ubicación física del embarque.
-- =========================================================

-- 1. Tipo de carga (paquetería vs consolidado)
ALTER TABLE public.miami_packages
  ADD COLUMN IF NOT EXISTS tipo_carga text DEFAULT 'Paquetería'
  CHECK (tipo_carga IN ('Paquetería', 'LCL', 'Aéreo Consolidado'));

-- 2. Estado de la carga en tránsito (posición física)
ALTER TABLE public.miami_packages
  ADD COLUMN IF NOT EXISTS cargo_status text DEFAULT 'Recibido en Miami'
  CHECK (cargo_status IN (
    'Recibido en Miami',
    'En Consolidación',
    'En Tránsito',
    'Llegado Honduras',
    'Entregado'
  ));

-- Índices para filtros de inventario
CREATE INDEX IF NOT EXISTS idx_miami_packages_tipo_carga   ON public.miami_packages(tipo_carga);
CREATE INDEX IF NOT EXISTS idx_miami_packages_cargo_status ON public.miami_packages(cargo_status);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FASE 12: FACTURACIÓN SAR HONDURAS
-- Corre este script en Supabase SQL Editor
-- ============================================================

-- 1. Tabla de rangos CAI
CREATE TABLE IF NOT EXISTS public.cai_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cai text NOT NULL,
  rango_desde text NOT NULL,   -- Ej. 000-001-01-00000001
  rango_hasta text NOT NULL,   -- Ej. 000-001-01-00000500
  fecha_limite_emision date NOT NULL,
  lugar_emision text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS cai_ranges_is_active_idx ON public.cai_ranges(is_active);

ALTER TABLE public.cai_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.cai_ranges
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Campos SAR en tabla invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cai text,
  ADD COLUMN IF NOT EXISTS rango_desde text,
  ADD COLUMN IF NOT EXISTS rango_hasta text,
  ADD COLUMN IF NOT EXISTS fecha_limite_emision date,
  ADD COLUMN IF NOT EXISTS lugar_emision text,
  ADD COLUMN IF NOT EXISTS es_exonerado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orden_compra_exenta text,
  ADD COLUMN IF NOT EXISTS no_constancia_exonerado text,
  ADD COLUMN IF NOT EXISTS no_registro_sag text,
  ADD COLUMN IF NOT EXISTS isv_18_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isv_18_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS importe_exento numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS importe_exonerado numeric(14,2) NOT NULL DEFAULT 0;

-- 3. Campos adicionales en company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS lugar_emision_defecto text,
  ADD COLUMN IF NOT EXISTS exchange_rate_usd_hnl numeric(10,4) DEFAULT 25.30;

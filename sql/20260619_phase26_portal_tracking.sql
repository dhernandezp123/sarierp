-- Phase 26: Portal cliente — rastreo de cargo_status con fecha de última actualización

ALTER TABLE public.miami_packages
  ADD COLUMN IF NOT EXISTS cargo_status_updated_at timestamptz DEFAULT now();

-- Filas existentes: usar received_at como fallback razonable
UPDATE public.miami_packages
SET cargo_status_updated_at = COALESCE(received_at, now())
WHERE cargo_status_updated_at IS NULL;

notify pgrst, 'reload schema';

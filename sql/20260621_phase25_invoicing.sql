-- Phase 25: Facturación completa
ALTER TABLE public.cuentas_pagar
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'AP',
  ADD COLUMN IF NOT EXISTS parent_ap_id UUID REFERENCES public.cuentas_pagar(id),
  ADD COLUMN IF NOT EXISTS documento_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('proveedor-docs', 'proveedor-docs', true)
ON CONFLICT (id) DO NOTHING;

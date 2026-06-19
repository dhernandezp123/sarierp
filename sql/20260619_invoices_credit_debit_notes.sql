-- ============================================================
-- Notas de Crédito y Débito — vinculación a factura original
-- Corre este script en Supabase SQL Editor
-- ============================================================

-- 1. Actualizar constraint de invoice_type para incluir NC y ND
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('Proforma', 'Factura', 'Nota de Crédito', 'Nota de Débito'));

-- 2. Referencia a la factura original (para NC y ND)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS motivo text;

CREATE INDEX IF NOT EXISTS invoices_parent_invoice_id_idx ON public.invoices(parent_invoice_id);

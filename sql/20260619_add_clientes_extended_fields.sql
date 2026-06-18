-- Contacto secundario
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS email_2 text,
  ADD COLUMN IF NOT EXISTS telefono_2 text,
  ADD COLUMN IF NOT EXISTS contacto_2 text;

-- Límite de crédito
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS limite_credito numeric(12,2),
  ADD COLUMN IF NOT EXISTS moneda_credito text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS dias_credito integer;

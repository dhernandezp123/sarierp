-- Phase 20: AWB + Carta Porte + Políticas en documentos

-- Add document conditions to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS condiciones_bl TEXT,
  ADD COLUMN IF NOT EXISTS condiciones_awb TEXT,
  ADD COLUMN IF NOT EXISTS condiciones_carta_porte TEXT;

-- Add Carta Porte specific fields to bills_of_lading
ALTER TABLE public.bills_of_lading
  ADD COLUMN IF NOT EXISTS placa_camion TEXT,
  ADD COLUMN IF NOT EXISTS nombre_operador TEXT;

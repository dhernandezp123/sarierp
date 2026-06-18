-- ============================================================
-- CONFIGURACIÓN DE EMPRESA
-- Corre este script en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Datos legales
  legal_name text,
  trade_name text,
  rtn text,

  -- Dirección
  address text,
  city text,
  country text DEFAULT 'Honduras',
  zip_code text,

  -- Contacto
  phone text,
  phone_2 text,
  email text,
  website text,

  -- Logo
  logo_url text,

  -- Configuración de facturación
  default_currency text DEFAULT 'USD',
  default_tax_rate numeric(5,2) DEFAULT 15,
  invoice_footer_note text,

  -- Auditoría
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Solo debe existir una fila. Insertamos el registro inicial.
INSERT INTO public.company_settings (legal_name, trade_name, rtn, address, city, country, phone, email)
VALUES (
  'SARI EXPRESS S DE R.L. DE C.V.',
  'Sari Express',
  '08019003239182',
  'BO. LOS ANDES 9 CALLE 12-13 AVE N.E',
  'San Pedro Sula',
  'Honduras',
  '+504 2553-0000',
  'operaciones@sariexpress.com'
)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON public.company_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_write" ON public.company_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

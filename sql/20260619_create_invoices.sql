-- ============================================================
-- MÓDULO FACTURACIÓN
-- Corre este script en Supabase SQL Editor
-- ============================================================

-- Tabla principal de facturas (proforma + factura final)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  invoice_type text NOT NULL CHECK (invoice_type IN ('Proforma', 'Factura')),
  status text NOT NULL DEFAULT 'Borrador'
    CHECK (status IN ('Borrador', 'Enviada', 'Aprobada', 'Pagada', 'Vencida', 'Anulada')),

  -- Vinculación con cotización (opcional)
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,

  -- Datos del cliente (snapshot al emitir)
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre text,
  cliente_rtn text,
  cliente_direccion text,
  cliente_email text,

  -- Fechas
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  paid_date date,

  -- Montos
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 15,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  exchange_rate numeric(10,4) NOT NULL DEFAULT 1,
  total_lps numeric(14,2),

  -- Información de pago
  payment_method text,
  payment_reference text,

  -- Notas internas y externas
  notes text,

  -- Auditoría
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Líneas de factura
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pagos registrados contra cada factura
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  payment_date date NOT NULL,
  payment_method text,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS invoices_quotation_id_idx ON public.invoices(quotation_id);
CREATE INDEX IF NOT EXISTS invoices_cliente_id_idx ON public.invoices(cliente_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_id_idx ON public.invoice_payments(invoice_id);

-- Row Level Security
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON public.invoice_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON public.invoice_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

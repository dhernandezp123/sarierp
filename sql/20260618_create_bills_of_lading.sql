-- Tabla principal de BLs (MBL y HBL)
CREATE TABLE public.bills_of_lading (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  shipping_instruction_id uuid REFERENCES public.shipping_instructions(id),

  -- Tipo y jerarquía
  bl_type text NOT NULL CHECK (bl_type IN ('MBL', 'HBL')),
  parent_bl_id uuid REFERENCES public.bills_of_lading(id),

  -- Identificadores
  bl_number text,

  -- Estado
  status text NOT NULL DEFAULT 'MBL Draft'
    CHECK (status IN (
      'MBL Draft',
      'MBL Validado',
      'HBL Draft',
      'Pendiente Aprobación Cliente',
      'Aprobado por Cliente',
      'Emitido',
      'Liberado',
      'Archivado'
    )),

  -- Términos de liberación
  release_type text CHECK (release_type IN ('Express Release', 'Original BL')),
  originals_count integer DEFAULT 3,
  copies_count integer DEFAULT 3,
  freight_terms text CHECK (freight_terms IN ('Prepaid', 'Collect')),
  hbl_freight_visibility text CHECK (hbl_freight_visibility IN ('No Freight Charges', 'As Arranged', 'Freight Amount')),

  -- Fechas
  bl_date date,
  issue_date date,
  release_date date,
  client_approved_at timestamptz,
  client_approved_by text,

  -- Partes: Shipper
  shipper text,
  shipper_address text,

  -- Partes: Consignee
  consignee text,
  consignee_address text,
  consignee_tax_id text,
  consignee_contact text,
  consignee_email text,

  -- Partes: Notify Party
  notify_party text,
  notify_party_address text,
  notify_party_tax_id text,
  notify_party_contact text,
  notify_party_email text,

  -- Ruta
  place_of_receipt text,
  port_of_loading text,
  port_of_discharge text,
  place_of_delivery text,

  -- Buque / vuelo
  carrier text,
  vessel_name text,
  voyage text,
  etd date,
  eta date,

  -- Descripción de mercancía
  description_of_goods text,
  marks_and_numbers text,
  number_of_packages integer,
  package_type text,
  gross_weight_kg numeric,
  measurement_cbm numeric,

  -- Instrucciones especiales
  special_instructions text,
  printed_at_destination boolean DEFAULT true,

  -- Archivo MBL draft del agente
  draft_file_url text,
  draft_file_name text,

  -- Auditoría
  created_by uuid REFERENCES auth.users(id),
  issued_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contenedores por BL
CREATE TABLE public.bl_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bl_id uuid NOT NULL REFERENCES public.bills_of_lading(id) ON DELETE CASCADE,
  container_number text,
  seal_number text,
  container_type text,
  quantity integer DEFAULT 1,
  gross_weight_kg numeric,
  measurement_cbm numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX ON public.bills_of_lading(booking_id);
CREATE INDEX ON public.bills_of_lading(shipping_instruction_id);
CREATE INDEX ON public.bills_of_lading(parent_bl_id);
CREATE INDEX ON public.bills_of_lading(status);
CREATE INDEX ON public.bl_containers(bl_id);

-- RLS
ALTER TABLE public.bills_of_lading ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bl_containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.bills_of_lading
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON public.bl_containers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

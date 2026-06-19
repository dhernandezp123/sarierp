-- Phase 8: Pickup requests from portal clients
CREATE TABLE IF NOT EXISTS client_pickup_requests (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id      uuid REFERENCES clientes(id) ON DELETE SET NULL,
  profile_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  pickup_address  text NOT NULL,
  contact_name    text,
  contact_phone   text,
  scheduled_date  date,
  description     text,
  status          text DEFAULT 'Pendiente'
                  CHECK (status IN ('Pendiente', 'Confirmado', 'Completado', 'Cancelado')),
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE client_pickup_requests ENABLE ROW LEVEL SECURITY;

-- Clients can insert and read their own requests
CREATE POLICY "cliente_insert_pickup" ON client_pickup_requests
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "cliente_select_pickup" ON client_pickup_requests
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR is_admin_or_operations());

-- Admin/Operaciones can update status
CREATE POLICY "staff_update_pickup" ON client_pickup_requests
  FOR UPDATE TO authenticated
  USING (is_admin_or_operations());

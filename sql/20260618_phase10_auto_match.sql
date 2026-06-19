-- Phase 10: Auto-match pre-alerts when packages are inserted
-- When a package arrives with a tracking that matches a Pendiente pre-alert,
-- automatically assign it to that client, generate WH#, update the alert, and notify.

CREATE OR REPLACE FUNCTION auto_match_pre_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_alert RECORD;
  v_wh    TEXT;
BEGIN
  -- Skip if already assigned or no tracking
  IF NEW.tracking_number IS NULL OR NEW.cliente_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find oldest pending pre-alert with same tracking
  SELECT * INTO v_alert
  FROM miami_pre_alerts
  WHERE tracking_number = NEW.tracking_number
    AND status = 'Pendiente'
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Generate warehouse number
  v_wh := next_warehouse_number();

  -- Assign to client
  NEW.cliente_id       := v_alert.cliente_id;
  NEW.warehouse_number := v_wh;
  NEW.status           := 'Asignado';
  NEW.assigned_at      := now();

  -- Close the pre-alert
  UPDATE miami_pre_alerts
  SET status = 'Recibido', matched_package_id = NEW.id
  WHERE id = v_alert.id;

  -- In-app notification to client portal profile
  INSERT INTO client_notifications (profile_id, title, body, type, entity_type, entity_id)
  SELECT p.id,
    'Paquete recibido en bodega',
    'Tu paquete ' || NEW.tracking_number || ' llegó a bodega Miami. Número asignado: ' || v_wh || '.',
    'paquete',
    'miami_packages',
    NEW.id
  FROM profiles p
  WHERE p.cliente_id = v_alert.cliente_id
    AND p.rol = 'Cliente'
  LIMIT 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to allow re-running
DROP TRIGGER IF EXISTS trg_auto_match_pre_alert ON miami_packages;

CREATE TRIGGER trg_auto_match_pre_alert
  BEFORE INSERT ON miami_packages
  FOR EACH ROW
  EXECUTE FUNCTION auto_match_pre_alert();

-- ============================================================
-- FASE 4: Módulo Miami + Portal Cliente
-- Base de datos: tablas, secuencias, funciones y RLS
-- Ejecutar en Supabase SQL Editor
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. ROL CLIENTE en profiles
-- ─────────────────────────────────────────────────────────────

-- Agregar cliente_id a profiles (vincula usuario portal → ficha de cliente)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Ampliar constraint de rol para incluir 'Cliente'
-- (usa DO block para evitar error si el constraint no existe o ya fue modificado)
DO $$
BEGIN
  ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_rol_check;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_rol_check CHECK (
      rol IN ('Admin', 'Ventas', 'Pricing', 'Operaciones', 'Contabilidad', 'Finanzas', 'Cliente')
    );
EXCEPTION WHEN others THEN
  NULL; -- si falla (constraint con otro nombre), continuar
END $$;


-- ─────────────────────────────────────────────────────────────
-- 2. SECUENCIAS Y FUNCIONES DE NUMERACIÓN
-- ─────────────────────────────────────────────────────────────

-- Secuencia global para números de warehouse (SPS-00001)
CREATE SEQUENCE IF NOT EXISTS public.miami_wh_seq START 1;

-- Genera el próximo número de warehouse
CREATE OR REPLACE FUNCTION public.next_warehouse_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'SPS-' || lpad(nextval('public.miami_wh_seq')::text, 5, '0');
END;
$$;

-- Genera el número de manifiesto del día (MAN-YYYYMMDD-NNN)
CREATE OR REPLACE FUNCTION public.next_manifest_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today    text := to_char(current_date, 'YYYYMMDD');
  day_count int;
BEGIN
  SELECT COUNT(*) INTO day_count
  FROM public.miami_manifests
  WHERE created_at::date = current_date;

  RETURN 'MAN-' || today || '-' || lpad((day_count + 1)::text, 3, '0');
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. FUNCIONES RLS HELPER
-- ─────────────────────────────────────────────────────────────

-- Retorna el cliente_id del usuario autenticado (para portal clientes)
CREATE OR REPLACE FUNCTION public.current_user_cliente_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Verdadero si el usuario autenticado tiene rol 'Cliente'
CREATE OR REPLACE FUNCTION public.is_cliente()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_user_role() = 'Cliente', false);
$$;

-- Verdadero si Admin o Operaciones (ya existe, se recrea por seguridad)
CREATE OR REPLACE FUNCTION public.is_admin_or_operations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.current_user_role() IN ('Admin', 'Operaciones'), false);
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. TABLA: miami_manifests
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.miami_manifests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_number text UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'Abierto'
    CHECK (status IN ('Abierto', 'Cerrado')),
  notes           text,
  total_packages  integer NOT NULL DEFAULT 0,
  received_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

ALTER TABLE public.miami_manifests ENABLE ROW LEVEL SECURITY;

-- Admin y Operaciones: acceso total
CREATE POLICY "miami_manifests_admin_ops_all"
  ON public.miami_manifests
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_operations())
  WITH CHECK (public.is_admin_or_operations());


-- ─────────────────────────────────────────────────────────────
-- 5. TABLA: miami_packages
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.miami_packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tracking e identificación
  tracking_number  text NOT NULL,
  carrier          text,                        -- UPS, FedEx, DHL, USPS, Amazon, Otro

  -- Peso
  weight_lbs       numeric(10,2),
  weight_kg        numeric(10,2),

  -- Dimensiones (en pulgadas)
  length_in        numeric(10,2),
  width_in         numeric(10,2),
  height_in        numeric(10,2),

  -- Volúmenes calculados
  ft3              numeric(10,4),               -- (L × W × H) / 1728
  cbm              numeric(10,6),               -- (L × W × H) × 0.0000163871

  -- Descripción
  description      text,
  photos           text[] DEFAULT '{}',         -- URLs de Supabase Storage

  -- Estado
  status           text NOT NULL DEFAULT 'Sin asignar'
    CHECK (status IN ('Sin asignar', 'Asignado', 'Entregado', 'Con incidencia')),

  -- Número de warehouse (se asigna al vincular con cliente)
  warehouse_number text UNIQUE,

  -- Vinculación
  cliente_id       uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  manifest_id      uuid REFERENCES public.miami_manifests(id) ON DELETE SET NULL,

  -- Auditoría
  received_at      timestamptz NOT NULL DEFAULT now(),
  received_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at      timestamptz,
  assigned_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  notes            text
);

ALTER TABLE public.miami_packages ENABLE ROW LEVEL SECURITY;

-- Admin y Operaciones: acceso total
CREATE POLICY "miami_packages_admin_ops_all"
  ON public.miami_packages
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_operations())
  WITH CHECK (public.is_admin_or_operations());

-- Cliente: solo ve sus propios paquetes
CREATE POLICY "miami_packages_cliente_select"
  ON public.miami_packages
  FOR SELECT
  TO authenticated
  USING (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_miami_packages_tracking     ON public.miami_packages(tracking_number);
CREATE INDEX IF NOT EXISTS idx_miami_packages_cliente       ON public.miami_packages(cliente_id);
CREATE INDEX IF NOT EXISTS idx_miami_packages_manifest      ON public.miami_packages(manifest_id);
CREATE INDEX IF NOT EXISTS idx_miami_packages_status        ON public.miami_packages(status);
CREATE INDEX IF NOT EXISTS idx_miami_packages_warehouse     ON public.miami_packages(warehouse_number);


-- ─────────────────────────────────────────────────────────────
-- 6. TABLA: miami_pre_alerts
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.miami_pre_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tracking_number  text NOT NULL,
  carrier          text,
  description      text,
  expected_date    date,
  status           text NOT NULL DEFAULT 'Pendiente'
    CHECK (status IN ('Pendiente', 'Recibido', 'Cancelado')),
  matched_package_id uuid REFERENCES public.miami_packages(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.miami_pre_alerts ENABLE ROW LEVEL SECURITY;

-- Admin y Operaciones: SELECT en todo
CREATE POLICY "miami_pre_alerts_admin_ops_select"
  ON public.miami_pre_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_operations());

-- Cliente: CRUD solo sobre sus propias pre-alertas
CREATE POLICY "miami_pre_alerts_cliente_all"
  ON public.miami_pre_alerts
  FOR ALL
  TO authenticated
  USING (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  )
  WITH CHECK (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  );

CREATE INDEX IF NOT EXISTS idx_miami_pre_alerts_cliente  ON public.miami_pre_alerts(cliente_id);
CREATE INDEX IF NOT EXISTS idx_miami_pre_alerts_tracking ON public.miami_pre_alerts(tracking_number);
CREATE INDEX IF NOT EXISTS idx_miami_pre_alerts_status   ON public.miami_pre_alerts(status);


-- ─────────────────────────────────────────────────────────────
-- 7. TABLA: client_addresses (dirección Miami de entrega)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_addresses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,

  -- Datos de la dirección
  nombre_completo text,
  company_name    text,
  address_line    text,                    -- se llena con la dirección de bodega Miami
  suite           text,                    -- casillero del cliente (ej. SPS-00123)
  city            text DEFAULT 'Miami',
  state           text DEFAULT 'FL',
  zip             text,
  country         text DEFAULT 'USA',
  phone           text,

  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY "client_addresses_admin_all"
  ON public.client_addresses
  FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'Admin')
  WITH CHECK (public.current_user_role() = 'Admin');

-- Cliente: CRUD sobre su propia dirección
CREATE POLICY "client_addresses_cliente_all"
  ON public.client_addresses
  FOR ALL
  TO authenticated
  USING (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  )
  WITH CHECK (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  );

CREATE INDEX IF NOT EXISTS idx_client_addresses_cliente ON public.client_addresses(cliente_id);


-- ─────────────────────────────────────────────────────────────
-- 8. TABLA: miami_incidencias
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.miami_incidencias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid REFERENCES public.miami_packages(id) ON DELETE SET NULL,
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo        text NOT NULL
    CHECK (tipo IN ('Dañado', 'Incompleto', 'No reconozco este paquete', 'Pérdida', 'Otro')),
  descripcion text,
  fotos       text[] DEFAULT '{}',
  status      text NOT NULL DEFAULT 'Abierta'
    CHECK (status IN ('Abierta', 'En revisión', 'Resuelta', 'Cerrada')),
  resolucion  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.miami_incidencias ENABLE ROW LEVEL SECURITY;

-- Admin y Operaciones: acceso total
CREATE POLICY "miami_incidencias_admin_ops_all"
  ON public.miami_incidencias
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_operations())
  WITH CHECK (public.is_admin_or_operations());

-- Cliente: INSERT y SELECT sobre sus propias incidencias
CREATE POLICY "miami_incidencias_cliente_select"
  ON public.miami_incidencias
  FOR SELECT
  TO authenticated
  USING (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  );

CREATE POLICY "miami_incidencias_cliente_insert"
  ON public.miami_incidencias
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_cliente()
    AND cliente_id = public.current_user_cliente_id()
  );

CREATE INDEX IF NOT EXISTS idx_miami_incidencias_cliente ON public.miami_incidencias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_miami_incidencias_package ON public.miami_incidencias(package_id);
CREATE INDEX IF NOT EXISTS idx_miami_incidencias_status  ON public.miami_incidencias(status);


-- ─────────────────────────────────────────────────────────────
-- 9. TABLA: client_notifications
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  title       text NOT NULL,
  body        text,
  type        text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info', 'paquete', 'incidencia', 'sistema')),

  -- Referencia opcional al objeto relacionado
  entity_type text,                        -- 'package', 'incidencia', etc.
  entity_id   uuid,

  read_at     timestamptz,                 -- null = no leída
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Admin: INSERT para crear notificaciones
CREATE POLICY "client_notifications_admin_insert"
  ON public.client_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'Admin');

-- Cliente: SELECT y UPDATE (marcar como leída) solo las suyas
CREATE POLICY "client_notifications_cliente_select"
  ON public.client_notifications
  FOR SELECT
  TO authenticated
  USING (
    public.is_cliente()
    AND profile_id = auth.uid()
  );

CREATE POLICY "client_notifications_cliente_update"
  ON public.client_notifications
  FOR UPDATE
  TO authenticated
  USING (
    public.is_cliente()
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    public.is_cliente()
    AND profile_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_client_notifications_profile ON public.client_notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_client_notifications_read    ON public.client_notifications(read_at);


-- ─────────────────────────────────────────────────────────────
-- 10. TABLA: push_tokens (estructura para app móvil futura)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Cliente: gestiona sus propios tokens
CREATE POLICY "push_tokens_cliente_all"
  ON public.push_tokens
  FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 11. TRIGGER: actualizar total_packages en miami_manifests
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_manifest_package_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.manifest_id IS NOT NULL THEN
    UPDATE public.miami_manifests
    SET total_packages = total_packages + 1
    WHERE id = NEW.manifest_id;

  ELSIF TG_OP = 'DELETE' AND OLD.manifest_id IS NOT NULL THEN
    UPDATE public.miami_manifests
    SET total_packages = GREATEST(total_packages - 1, 0)
    WHERE id = OLD.manifest_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Paquete movido de manifiesto
    IF OLD.manifest_id IS DISTINCT FROM NEW.manifest_id THEN
      IF OLD.manifest_id IS NOT NULL THEN
        UPDATE public.miami_manifests
        SET total_packages = GREATEST(total_packages - 1, 0)
        WHERE id = OLD.manifest_id;
      END IF;
      IF NEW.manifest_id IS NOT NULL THEN
        UPDATE public.miami_manifests
        SET total_packages = total_packages + 1
        WHERE id = NEW.manifest_id;
      END IF;
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_manifest_package_count ON public.miami_packages;
CREATE TRIGGER trg_manifest_package_count
  AFTER INSERT OR UPDATE OR DELETE ON public.miami_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_manifest_package_count();


-- ─────────────────────────────────────────────────────────────
-- 12. TRIGGER: auto-calcular ft3 y cbm al insertar/actualizar paquete
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calc_package_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.length_in IS NOT NULL AND NEW.width_in IS NOT NULL AND NEW.height_in IS NOT NULL THEN
    NEW.ft3  := round((NEW.length_in * NEW.width_in * NEW.height_in) / 1728.0, 4);
    NEW.cbm  := round((NEW.length_in * NEW.width_in * NEW.height_in) * 0.000016387064, 6);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_package_volume ON public.miami_packages;
CREATE TRIGGER trg_calc_package_volume
  BEFORE INSERT OR UPDATE OF length_in, width_in, height_in ON public.miami_packages
  FOR EACH ROW EXECUTE FUNCTION public.calc_package_volume();


-- ─────────────────────────────────────────────────────────────
-- INSTRUCCIÓN MANUAL (no ejecutar como SQL):
-- Crear bucket en Supabase Storage:
--   Nombre: miami-package-photos
--   Acceso: privado (authenticated only)
--   Carpeta sugerida por paquete: {package_id}/{filename}
-- ─────────────────────────────────────────────────────────────

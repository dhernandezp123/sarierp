-- Sales Activities: registro de visitas, llamadas y reuniones del equipo comercial

CREATE TABLE IF NOT EXISTS sales_activities (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  tipo_actividad        text NOT NULL CHECK (tipo_actividad IN ('Visita', 'Llamada', 'Reunión')),
  tipo_cliente          text NOT NULL DEFAULT 'Mantenimiento'
                          CHECK (tipo_cliente IN ('Nuevo', 'Mantenimiento')),

  -- Cuenta existente (Mantenimiento)
  cliente_id            uuid REFERENCES clientes(id) ON DELETE SET NULL,

  -- Prospecto nuevo (sin cuenta aún)
  nombre_prospecto      text,
  empresa_prospecto     text,

  -- Fecha y hora
  fecha_actividad       date NOT NULL,
  hora_inicio           text,
  hora_fin              text,

  -- Etapa del proceso de captación
  etapa_captacion       text CHECK (etapa_captacion IN (
                          'Primer Contacto',
                          'Prospecto Calificado',
                          'Cotización Enviada',
                          'En Negociación',
                          'Ganado',
                          'Perdido',
                          'Cliente Activo'
                        )),

  -- Notas de la actividad
  comentarios           text,
  resultado             text,

  -- Seguimiento
  proxima_accion        text,
  fecha_proxima_accion  date,

  -- Auditoría
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now() NOT NULL,
  updated_at            timestamptz DEFAULT now() NOT NULL,
  deleted_at            timestamptz
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS sales_activities_fecha_idx       ON sales_activities (fecha_actividad DESC);
CREATE INDEX IF NOT EXISTS sales_activities_cliente_idx     ON sales_activities (cliente_id);
CREATE INDEX IF NOT EXISTS sales_activities_created_by_idx  ON sales_activities (created_by);
CREATE INDEX IF NOT EXISTS sales_activities_etapa_idx       ON sales_activities (etapa_captacion);

-- RLS
ALTER TABLE sales_activities ENABLE ROW LEVEL SECURITY;

-- Admin y Ventas ven todo; el resto solo sus propias actividades
CREATE POLICY "sales_activities_select" ON sales_activities
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND rol IN ('Admin', 'Ventas')
      )
      OR created_by = auth.uid()
    )
  );

-- Solo Admin y Ventas crean actividades
CREATE POLICY "sales_activities_insert" ON sales_activities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rol IN ('Admin', 'Ventas')
    )
  );

-- Admin y Ventas pueden editar; Ventas solo las propias
CREATE POLICY "sales_activities_update" ON sales_activities
  FOR UPDATE USING (
    deleted_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'Admin')
      OR (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'Ventas')
        AND created_by = auth.uid()
      )
    )
  );

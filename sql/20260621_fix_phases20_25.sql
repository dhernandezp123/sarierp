-- Correcciones posteriores a las fases 20-25.
-- Ejecutar una sola vez en Supabase SQL Editor.

-- 1. Configuracion empresarial: solo Admin puede escribir.
DROP POLICY IF EXISTS "admin_write" ON public.company_settings;

CREATE POLICY "admin_write" ON public.company_settings
  FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'Admin')
  WITH CHECK (public.current_user_role() = 'Admin');

-- 2. El tutorial siempre tiene un estado definido.
UPDATE public.profiles
SET tutorial_completed = false
WHERE tutorial_completed IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN tutorial_completed SET DEFAULT false,
  ALTER COLUMN tutorial_completed SET NOT NULL;

-- 3. Integridad de ajustes de cuentas por pagar.
UPDATE public.cuentas_pagar
SET tipo = 'AP'
WHERE tipo IS NULL;

ALTER TABLE public.cuentas_pagar
  ALTER COLUMN tipo SET DEFAULT 'AP',
  ALTER COLUMN tipo SET NOT NULL;

ALTER TABLE public.cuentas_pagar
  DROP CONSTRAINT IF EXISTS cuentas_pagar_tipo_check;

ALTER TABLE public.cuentas_pagar
  ADD CONSTRAINT cuentas_pagar_tipo_check
  CHECK (tipo IN ('AP', 'NC', 'ND'));

CREATE INDEX IF NOT EXISTS cuentas_pagar_parent_ap_idx
  ON public.cuentas_pagar(parent_ap_id);

-- 4. Los documentos de proveedores contienen informacion financiera y deben ser privados.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf']::text[]
WHERE id = 'proveedor-docs';

DROP POLICY IF EXISTS "proveedor_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "proveedor_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "proveedor_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "proveedor_docs_delete" ON storage.objects;

CREATE POLICY "proveedor_docs_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'proveedor-docs'
  AND public.current_user_role() IN ('Admin', 'Finanzas', 'Contabilidad')
);

CREATE POLICY "proveedor_docs_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proveedor-docs'
  AND public.current_user_role() IN ('Admin', 'Finanzas', 'Contabilidad')
);

CREATE POLICY "proveedor_docs_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'proveedor-docs'
  AND public.current_user_role() IN ('Admin', 'Finanzas', 'Contabilidad')
)
WITH CHECK (
  bucket_id = 'proveedor-docs'
  AND public.current_user_role() IN ('Admin', 'Finanzas', 'Contabilidad')
);

CREATE POLICY "proveedor_docs_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'proveedor-docs'
  AND public.current_user_role() IN ('Admin', 'Finanzas', 'Contabilidad')
);

NOTIFY pgrst, 'reload schema';

-- Agrega "Breakbulk" al catalogo public.container_types.
--
-- Este catalogo alimenta el dropdown "Tipo de contenedor / unidad" de la
-- seccion Carga en cotizaciones FCL/FTL (quotations/new y quotations/[id]/edit),
-- que lee: select * from container_types where active = true order by name.
--
-- Idempotente: no duplica la fila si ya existe.

INSERT INTO "public"."container_types" ("name", "category", "active")
SELECT 'Breakbulk', NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."container_types" WHERE "name" = 'Breakbulk'
);

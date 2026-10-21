# Publicación de notas por tarifa FCL/LCL — 21/10/2026

El usuario autorizó commit y despliegue de PNOTE-01. Incluye únicamente las notas
de las tarifas del comparativo, su migración, pruebas y documentación.

## Preflight

- Repositorio `dhernandezp123/sarierp`, `main` local/remoto en
  `6cade0973d9ec2c2d9b9ed50899050e8052a7f50` antes del cambio.
- Supabase Production `fwspgdzvlbtbgiupvrzo`: 129 migraciones, última
  `20261020120000`, sin columna `agent_quotes.internal_notes`; RLS activo.
- Aplicar solamente `20261021120000_agent_quote_internal_notes.sql` antes de
  publicar frontend. No aplicar migraciones ajenas, incluido Outlook en standby.
- Validación local: TypeScript, build, 373 pruebas, lint sin regresiones, dos
  suites SQL/RLS aisladas y recorrido del comparativo con proveedor simulado
  a 1440/390 px. Ver [aceptación autenticada](../uat/pricing-rate-notes.md).

## Secuencia autorizada

1. Commit funcional con hardening, SQL, pruebas y documentación.
2. Migración aditiva en transacción con verificación del esquema esperado,
   registro de fuente exacta y comparación de huellas de catorce tablas de
   negocio. Para tarifas se excluye la columna nueva de la huella y se confirma
   que todas las notas existentes sean NULL. Comparar RLS, policies, ACL y
   funciones de acceso antes/después.
3. Postflight independiente de esquema, fuente, datos y permisos.
4. Publicar `main` por la integración GitHub/Vercel existente; comprobar el
   despliegue y Quality CI del commit publicado.
5. Smoke HTTP del dominio, login y rutas protegidas. No crear registros de
   negocio ni enviar mensajes de prueba a Production.

## Estado

Publicación en curso. UAT autenticado pendiente de forma independiente.
Evidencia local ignorada en `.ua/intermediate/notes-release/`.

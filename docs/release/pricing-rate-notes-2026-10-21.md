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

SQL publicado; frontend pendiente de Vercel. UAT autenticado pendiente de forma
independiente.

- Commit funcional `2736ca11203c9daf4ea7e1b3a4889db42a242f2e`, en `origin/main`.
- Aplicada exclusivamente `20261021120000`: historial de 129 a 130 migraciones.
  Fuente registrada idéntica al archivo del commit; SHA-256
  `e48538e0ed4bb6c4407814f2bf6c4c70114ca72517da4195b43808d7d1c5f527`.
- Transacción ensayada en base aislada; guardas de integridad aprobadas en
  Production y postflight independiente. Catorce tablas de negocio intactas;
  columna nueva TEXT nullable con notas históricas NULL. RLS, policies, ACL y
  funciones de acceso intactos. Outlook sigue sin aplicar.
- Quality CI: [39622724610](https://github.com/dhernandezp123/sarierp/actions/runs/39622724610).
  Aplicación y base de datos aprobadas.
- Vercel no registró despliegue automático del commit. CLI sin credenciales;
  autenticación solicitada al usuario para completar la publicación directa.
  No se ha confirmado todavía publicación del frontend.
- Smoke posterior al SQL sobre el frontend existente: login HTTP 200;
  cotización nueva y pricing HTTP 307 a login; portal de envíos HTTP 307 a su
  login. Estas respuestas confirman disponibilidad y protección, no el despliegue
  de la interfaz nueva. Sin registros ni mensajes de prueba en Production.

Evidencia local ignorada en `.ua/intermediate/notes-release/`.

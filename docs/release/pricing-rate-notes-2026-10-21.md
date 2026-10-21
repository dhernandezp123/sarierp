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

Frontend y SQL publicados en Production. UAT autenticado pendiente de forma
independiente según el recorrido documentado.

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
- Vercel Production `dpl_C9D4g2v9w2eDvzrjJ86QWBVvWUkz`, estado `READY`,
  fuente Git del commit funcional `2736ca11203c9daf4ea7e1b3a4889db42a242f2e`.
  URL inmutable:
  `https://sarierp-lclnn1llg-claudherhn-5641s-projects.vercel.app`.
- Dominio `https://sari.forwarders.app`: alias verificado contra ese despliegue.
  Sesión de Vercel autorizada por el usuario; la API permitió comprobar el commit
  y la CLI el alias de Production. No fue necesario repetir el despliegue listo.
- CI del registro posterior `cab237a`:
  [39623750879](https://github.com/dhernandezp123/sarierp/actions/runs/39623750879),
  aprobado. Sin cambios adicionales de aplicación después del commit funcional.
- Smoke final del frontend publicado: login HTTP 200; cotización nueva y pricing
  HTTP 307 a login; portal de envíos HTTP 307 a su login. Las verificaciones sin
  sesión no sustituyen UAT autenticado de creación/edición de notas. Sin registros
  ni mensajes de prueba en Production.

Evidencia local ignorada en `.ua/intermediate/notes-release/`.

# Publicación de Contabilidad y facturación por oficina — 26/10/2026

El usuario autorizó aplicar migraciones y desplegar ACC-01 / BILL-POS-01.
La publicación comprende las migraciones `20261026120000_accounting_access.sql`
y `20261026130000_billing_points_of_sale.sql`, el frontend y sus pruebas.

## Preflight confirmado

- `main` local/remoto: `4e7452cadaa3d2498017d0fa5af0a0cf66fe0565`.
- Supabase Production vinculado: `fwspgdzvlbtbgiupvrzo`, 130 migraciones,
  última `20261021120000`; columnas nuevas ausentes.
- Production no tiene rangos CAI ni facturas fiscales registrados. Ambas
  oficinas requieren cargar sus datos fiscales reales antes de emitir.
- Helpers de clientes, cotizaciones, CAI y emisión coinciden con las fuentes
  canónicas anteriores. No se sobrescriben cambios remotos desconocidos.
- Dry-run del paquete selectivo propone exactamente las dos migraciones
  autorizadas. Outlook `20261002120000_sari_outlook_intake.sql` sigue excluida.
- Validación de aplicación completada antes de publicar: 396 pruebas Node,
  TypeScript, lint sin regresiones y build completo. Dieciocho suites SQL/RLS
  aisladas y veinte emisiones concurrentes ficticias aprobadas.

## Secuencia de publicación

1. Commit funcional de código, migraciones, pruebas y hardening.
2. Aplicación conjunta en transacción con baseline, bloqueo acotado, fuente
   exacta registrada e integridad de 21 tablas de negocio. Comparar CAI,
   correlativos y documentos; conservar RLS, ACL y policies ajenas al cambio.
3. Postflight independiente: fuentes, datos, esquema y permisos. La evidencia
   detallada queda ignorada en `.ua/intermediate/accounting-release-20261026/`.
4. Push de `main` para la integración GitHub/Vercel existente. Comprobar Quality
   y Production para el SHA completo del commit funcional.
5. Smoke de dominio, login, módulos protegidos y APIs. No crear documentos ni
   usuarios de prueba ni enviar mensajes en Production.

## Estado

Publicación en proceso. Registrar aquí el commit, migraciones, CI, instancia,
dominio y postflight al finalizar. La aceptación con Contabilidad y el registro
de CAI/rango/vigencia/próximo número real de cada oficina quedan separados del
despliegue; ver [UAT](../uat/accounting-and-billing-points.md).

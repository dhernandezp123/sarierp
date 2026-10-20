# Publicación de Servicio de Aduanas — 20/10/2026

El usuario autorizó commit y despliegue. La publicación comprende exclusivamente
la migración `20261020120000_customs_only_service.sql` y el frontend asociado.
La aceptación con usuarios reales sigue el [recorrido UAT](../uat/customs-service.md).

## Preflight

- Repositorio: `dhernandezp123/sarierp`, rama `main`; HEAD local/remoto
  `538cb1ef600be5c2de273153083f9227fd5bbbca` antes del cambio.
- Production: Supabase `fwspgdzvlbtbgiupvrzo`, 128 migraciones, última
  `20261019201000`. La migración de Aduanas no está aplicada; ningún producto
  `customs_only` existe todavía. Outlook continúa en standby.
- RLS activo en cotizaciones, tarifas de agente, cargos, SI, shipments y catálogo.
- Inventario: 329 cotizaciones, 564 tarifas, 1172 cargos, 24 SI/shipments,
  10 bookings, 6 opciones y 28 líneas de opciones. Sin facturas de cliente ni
  cargos de factura de proveedor. Huellas conservadas en evidencia ignorada.
- Vercel vigente: despliegue asociado a `538cb1e`, estado success en Production;
  publicación mediante la integración GitHub/Vercel existente.
- Validación local: 371 pruebas Node, doce suites SQL/RLS, TypeScript, lint sin
  regresiones, build y navegador a 390/1440 px. No se crean cotizaciones ni se
  envían mensajes de prueba a Production.

## Secuencia autorizada

1. Commit funcional con código, SQL, pruebas y registro de hardening.
2. Aplicar únicamente la migración nueva, con registro de su fuente exacta en
   la misma transacción. Comparar huellas de negocio antes/después dentro de
   esa transacción; verificar permisos y RLS.
3. Mantener temporalmente inactivo el producto nuevo para que la versión
   anterior del frontend no ofrezca una opción que aún no reconoce.
4. Publicar `main`, comprobar Vercel Production y CI del mismo commit.
5. Habilitar el producto después de comprobar el frontend, verificar catálogo
   y rutas públicas/protegidas y documentar el resultado de publicación.

## Estado

Publicación en ejecución. El resultado, hash funcional, CI y postflight se
registrarán después de completar la secuencia. El UAT autenticado permanece
pendiente aunque las comprobaciones automáticas estén aprobadas.

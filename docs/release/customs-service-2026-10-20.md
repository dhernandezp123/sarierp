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

SQL y frontend publicados en Production; Servicio de Aduanas habilitado en el
catálogo del tenant existente. UAT autenticado pendiente.

| Comprobación | Resultado |
| --- | --- |
| Commit funcional | `196713ec2b3e352ce0b651105a30ee9db0f11b63`, en `origin/main` |
| CI | [Quality 39469345310](https://github.com/dhernandezp123/sarierp/actions/runs/39469345310), application y database success |
| Vercel | Production deployment `7207033956`, success |
| URL inmutable | `https://sarierp-jytbiy22f-claudherhn-5641s-projects.vercel.app` |
| Dominio | `https://sari.forwarders.app` |
| Supabase | 129 migraciones, última `20261020120000`; fuente registrada coincide con el archivo publicado |
| Catálogo | `customs_only`, Servicio de Aduanas, activo; `applies_client_rates = false` |
| Integridad | Huellas de las catorce tablas de negocio intactas dentro de la transacción y en el postflight posterior |
| Acceso | RLS activo en las seis tablas inspeccionadas; funciones nuevas sin EXECUTE anónimo y triggers privados para clientes de API |

El producto permaneció inactivo durante la construcción del frontend anterior
y se habilitó después de confirmar Vercel Production y ambos trabajos de CI.
La activación verificó la fuente de la migración y el estado esperado del
catálogo. No se ejecutaron otras migraciones ni se alteró Outlook en standby.

Login responde 200. Cotización nueva, pricing y operaciones responden 307 al
login conservando su ruta de retorno; el portal de envíos conserva su propio
login. No se crearon usuarios, cotizaciones, operaciones, facturas ni mensajes
de prueba en Production. La inspección de permisos publicados y el smoke sin
sesión no sustituyen la aceptación autenticada del recorrido completo.

Evidencia local ignorada en `.ua/intermediate/customs-release/`: manifest con
commit y hashes, preflight/esquema objetivo, transacción aplicada, fuente
registrada, huellas, permisos, activación y smoke HTTP. El resultado de CI y la
publicación de Vercel se consultaron para el mismo commit funcional.

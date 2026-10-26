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

SQL y frontend publicados en Production. La aceptación con Contabilidad y el
registro de CAI/rango/vigencia/próximo número real de cada oficina quedan
separados del despliegue; ver [UAT](../uat/accounting-and-billing-points.md).

| Comprobación | Resultado |
| --- | --- |
| Commit funcional | `af2758a4808d1b955b0f525a34c06c6c7d2bb07b`, en `origin/main` |
| Migraciones | Exclusivamente `20261026120000` y `20261026130000`; historial 130 → 132 |
| Fuentes | Registradas idénticas a los archivos del commit funcional |
| Integridad transaccional | Huellas de 21 tablas de negocio conservadas; no se reiniciaron correlativos ni se alteraron documentos |
| Postflight independiente | 17 tablas idénticas; cuatro con actividad concurrente de Pricing respaldada por dos eventos `agent_quote_selected` |
| Acceso | RLS/ACL existentes y policies ajenas conservados; helpers nuevos coinciden con el commit; sin EXECUTE anónimo del RPC de oficinas |
| Contabilidad en Production | Lectura de clientes/cotizaciones/costos y scanner confirmada; edición de clientes autorizada; sin creación de clientes ni escritura de tarifas/precios |
| Vercel | [Production 7339152349](https://vercel.com/claudherhn-5641s-projects/sarierp/C9X6SdeU2HLuaDBttQSp6mAdsqE7), success, SHA funcional exacto |
| Instancia | `https://sarierp-apcouhg6b-claudherhn-5641s-projects.vercel.app` |
| Dominio | `https://sari.forwarders.app`, build ID `MiY8oaazeY5lXJ11tf7hF`, manifiesto idéntico al de la instancia |
| Quality CI | [40370636848](https://github.com/dhernandezp123/sarierp/actions/runs/40370636848), application y database success |

SHA-256 de las fuentes canónicas registradas:

- `20261026120000`: `5b491fca9ba0942824f8e238424bc97271f5124df8357a31bf93c53aa330c625`.
- `20261026130000`: `c9451df38409329a36c75b033220fa023f36289d2057be04cff72a77097d497a`.

El smoke verificó login 200; Clientes, Empresa, CAI, nueva factura, scanner,
Reportes y cotización nueva redirigen 307 al login sin sesión; API del scanner
responde 401. El manifiesto del build responde 200 en dominio e instancia, con
SHA-256 `9476e0afd3f9da68a64e6ec58631191fd3eaca62c9f5a377e7517fe9a89e59ea`.
Outlook sigue sin aplicar. No se crearon registros ni mensajes de prueba en
Production. Las comprobaciones SQL y sin sesión no sustituyen UAT autenticado.

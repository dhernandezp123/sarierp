# Expediente de release de la auditoría de octubre

Fecha de preparación: 14/10/2026. Esta matriz es el índice vigente del trabajo
AUD-01 a AUD-20. Los runbooks de fases anteriores conservan valor histórico;
una publicación documentada allí no acredita el despliegue de estas correcciones.

## Identificación del candidato

| Dato | Evidencia actual | Requisito de aceptación |
| --- | --- | --- |
| Commit candidato | c767762d40aa657892c5b62d5ea85e17b22fba64 en origin/main | SHA revisado, CI verde |
| Ambiente y hostname | Vercel Production, sari.forwarders.app; tabla protegida aún Demo | Cambio a production pendiente de aprobación específica |
| Migraciones | 121 remotas, última 20261014154000; Outlook excluida | Inventario verificado; 16 de auditoría aplicadas |
| RLS | Catálogo/permisos remotos y ocho suites aisladas aprobados | UAT autenticada por rol/tenant en destino pendiente |
| Publicación | dpl_Ce8vhFUzn3wocVfr2v4UmKcCyL9z READY y promovido | Recargar pestañas; smoke aprobado |
| Aceptación | Responsable confirmado: administrador del sistema (usuario solicitante); escenarios pendientes | Nombre/rol, fecha y enlace de evidencia por escenario |
| Decisión de salida | No autorizado por este documento | Aprobación funcional y técnica registrada con pendientes explícitos |

Estado efectivo y alcance pendiente: [registro del despliegue](audit-deployment-2026-10-14.md).
Las referencias “SQL pendiente” de la tabla histórica siguiente describen la
preparación del candidato: sus 16 migraciones ya están aplicadas según ese registro.
La autorización del usuario cubrió commit/despliegue; el cambio protegido de
ambiente requiere la aprobación específica solicitada por revisión automática.

## Estado por hallazgo

“Local” nunca equivale a “aceptado en destino”. Actualizar esta tabla y
HARDENING.md juntos cuando exista evidencia nueva. No marcar casillas por inferencia.

| Hallazgo | Evidencia local / procedimiento | SQL pendiente en destino | UAT / responsable funcional |
| --- | --- | --- | --- |
| AUD-01 | [Pricing](../uat/aud01-pricing-write-permissions.md) | 20261013120000 | Pendiente, Pricing y Administración |
| AUD-02 | [Pagos](../uat/aud02-supplier-payments.md) | 20261013130000, 20261013131000 | Pendiente, Finanzas |
| AUD-03 | [Saldos](../uat/aud03-supplier-payable-balances.md) | 20261013140000 | Pendiente, Finanzas |
| AUD-04 | [Consultas](../uat/aud04-complete-queries.md) | Sin SQL propio | Pendiente, Finanzas y Operaciones |
| AUD-05 | [Transiciones](../uat/aud05-quotation-transitions.md) | 20261014120000, 121000, 122000 del mismo día | Pendiente, Ventas y Pricing |
| AUD-06 | [Asignación](../uat/aud06-miami-package-assignment.md) | 20261014130000 | Pendiente, Operaciones y Cliente |
| AUD-07 | [Ambiente de correo](../uat/aud07-email-environment.md) | 20261014153000: default Demo, verificación explícita del propietario | Pendiente, Administración |
| AUD-08 | [Recuperación](../uat/aud08-email-recovery.md) | 20261014140000, 141000, 142000 del mismo día | Pendiente, Soporte y Administración |
| AUD-09 | [Errores de lectura](../uat/aud09-read-errors.md) | Sin SQL propio | Pendiente, Finanzas y Operaciones |
| AUD-10 | [Calendario](../uat/aud10-calendar-timezones.md) | Sin SQL propio | Pendiente, Finanzas y Operaciones |
| AUD-11 | [Incidencias](../uat/aud11-atomic-portal-incidents.md) | 20261014150000, 151000, 152000 del mismo día | Pendiente, Operaciones y Cliente |
| AUD-12 | Destinatarios en la RPC de AUD-06; helper anterior retirado | Depende de AUD-06 | Pendiente, Cliente con cero/una/dos cuentas |
| AUD-13 | Workflow Quality y baseline de lint | Sin SQL propio | Primera ejecución alojada y controles de merge pendientes |
| AUD-14 | Esta matriz y guion de expediente integral | No aplica | Firmas y evidencia real pendientes |
| AUD-15 a AUD-20 | Consultar seguimiento y HARDENING.md | Según cambio | Mantener abierto hasta registrar evidencia específica |

## Preparación del despliegue autorizado

El usuario autorizó commit y despliegue y confirmó que él mismo validará como
administrador los flujos y SLA. Eso identifica al responsable; no acredita todavía
una firma de aceptación de los escenarios.

- Vercel: proyecto sarierp, prj_y4WUxpZULtZ6bdb779GJsPMUJFmC, equipo existente.
- Supabase enlazado: fwspgdzvlbtbgiupvrzo. Preflight: 105 migraciones, última
  20261012160000; 316 cotizaciones, dos paquetes y sin obligaciones/pagos/incidencias.
- Cero anomalías de vínculos financieros/incidencias y RLS activo en tablas auditadas.
- Se encontraron cuatro repricings históricos con operación. La revisión del
  historial identifica último cambio explícito Ganada→Pendiente. La acción
  owner-only de 20261014154000 exige ese historial único y revisión esperada;
  solo recupera metadata del retorno y escribe actividad en la misma transacción.
  Su ejecución efectiva se registrará en el postflight; no aprueba ni cambia importes.
- Paquete de 16 migraciones de auditoría, excluyendo Outlook 20261002120000, que
  sigue sin aplicar en Production. Helper prepara copia/hash por archivo en .ua;
  no reparar el historial para simular que Outlook fue aplicado.
- Copia de esquema remoto conservada en evidencia ignorada. Despliegue Vercel con
  --prod --skip-domain; promover alias después del SQL/postflight verificado.
- Rollback: conservar guards/esquema y trazas; si falla el postflight, no promover
  el frontend y resolver mediante forward-fix revisado. No usar un rollback de
  código para reabrir escrituras directas incompatibles con el nuevo esquema.

Los sufijos abreviados son informativos: usar los nombres completos de
`supabase/migrations/` al preparar el despliegue, sin saltar dependencias previas.

## Tres expedientes integrales de aceptación

Crear datos sintéticos en un ambiente de aceptación autorizado y guardar la
evidencia fuera del repositorio si contiene documentos, identidades o credenciales.
Registrar para cada paso: identificador sintético, resultado esperado/observado,
rol, fecha, commit/ambiente y evidencia. Un paso omitido queda pendiente.

1. FCL/FTL: líneas en quotation_containers, dos agentes, selección/aprobación,
   opción ofrecida y PDF congelado, aceptación y Ganada, shipment/SI, booking y
   documentos, cierre operativo, validación de costos, factura/cobro y AP/pago.
2. LCL/LTL o carga aérea consolidada: quotation_cargo_lines, cálculo de volumen
   y cargos, el mismo recorrido comercial/operativo/financiero; sin generar
   líneas multicontenedor. Comparar impuestos, moneda y snapshot PDF.
3. Miami: prealerta/ingreso/asignación con WH, dos cuentas del cliente y avisos,
   consolidación/transporte/entrega, factura comercial privada e incidencia;
   comprobar que una entrega previa no se sobrescribe al reportar.

En los tres: probar red interrumpida antes/después del commit, reintento de la
misma clave, dos sesiones concurrentes, usuario pendiente/inactivo, rol sin
permiso, tenant ajeno, lectura paginada y error recuperable. Correos interceptados
o proveedor simulado; ningún envío de prueba a destinatarios reales.

## Cierre y reversión

- Confirmar inventario SQL aplicado, permisos de funciones y RLS; no ejecutar
  automáticamente db push/reset sobre una conexión remota.
- Conservar resultados de CI, pruebas SQL y UAT asociados al mismo candidato.
- Revisar casos históricos detectados por los preflights antes de declararlos
  conciliados. Registrar responsables por nombre, no solamente un departamento.
- Documentar reversión de código y compatibilidad con el esquema antes de
  publicar. No retirar guards ni borrar trazas como rollback de emergencia.
- Registrar aceptación o rechazo y excepciones con impacto/plazo/responsable.
  Esta preparación documental deja AUD-14 abierto hasta la aceptación real.

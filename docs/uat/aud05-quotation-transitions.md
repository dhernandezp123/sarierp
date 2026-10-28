# AUD-05 — Transiciones e historial de cotizaciones

Estado: implementado y validado en el stack local aislado. Abierto para publicar
SQL/frontend y ejecutar UAT autenticado en el ambiente destino. Fecha: 14/10/2026.

## Comportamiento y alcance

`transition_quotation` bloquea la cotización, verifica tenant/perfil/rol,
estado y `status_revision` esperados, aplica el cambio y registra historial y
actividad en una transacción. Las escrituras de estado/aprobación desde un
cliente `authenticated` se rechazan incluso para Admin. El historial generado
no admite inserciones, modificaciones, borrados ni truncate desde ese cliente.
Se conserva el historial anterior sin inventar entradas faltantes.

La revisión aumenta al cambiar estado o aprobación; detecta también una pantalla
antigua cuando el estado cambió y volvió al mismo valor. No es una versión de
todos los datos de la cotización: editar contactos, tarifas o líneas no aumenta
este contador. El guard de creación conserva Borrador/Pendiente y el Pricing
automático inicial de Miami; impide insertar Ganada/Perdida o estados legacy
desde el cliente. No normaliza registros históricos existentes.

| Acción | Roles del servidor | Condición adicional |
| --- | --- | --- |
| Solicitar/reabrir pricing | Admin, Pricing, Ventas | Transición vigente; motivo al reabrir una cotización aprobada/enviada/ganada |
| Aprobar/reaprobar precios | Admin, Pricing | Líneas activas, venta positiva, tarifa activa con datos comerciales para otros orígenes; motivo si margen <5% |
| Marcar enviada sin opciones | Admin, Pricing, Ventas | Pricing Aprobado |
| Publicar/enviar opciones | Admin, Pricing | Conserva la autorización y publicación de la RPC comercial existente |
| Registrar respuesta Ganada/Perdida | Admin, Ventas | Enviada; pérdida también desde Pendiente, con razón y detalle para Otra |
| Cerrar repricing ganado | Admin, Pricing | Marcador de retorno a Ganada; si hay una opción aceptada y se mantiene la tarifa elegida, crea una versión de ajuste sin nueva elección del cliente; sincronización operativa opcional |
| Elegir opción y cerrar venta | Admin, Ventas | Opción/estado válidos y revisión esperada; conserva aceptación, snapshot y propagación existentes |

Operaciones, Contabilidad, Finanzas, Cliente, perfiles pendientes/inactivos y
usuarios de otro tenant no cambian el estado por estas RPC. Las autorizaciones
para editar otros datos y validar costos mantienen sus contratos existentes.

La aprobación calcula costo/venta/profit/GP netos desde las líneas persistidas
activas, con la misma fórmula de Pricing Comparison. No recalcula facturas
emitidas ni snapshots comerciales. Se mantienen las advertencias/validaciones
del formulario y las validaciones comerciales existentes de opciones.

`repricing_return_status = Ganada` identifica la reapertura de una venta ganada.
Una reapertura anterior a la venta no puede convertir una cotización pendiente
en Ganada por tener un log antiguo o una operación. Una nueva venta o cambio de
tarifa elegida mantiene aprobación → oferta → elección del cliente. Un ajuste
de precios/seguro de la venta ganada conserva la elección anterior; véase
[ajustes de venta ganada](won-quotation-adjustments.md).

## Publicación y datos anteriores

Aplicar en orden, después de las migraciones anteriores del repositorio:

1. `20261014120000_atomic_quotation_transitions.sql`.
2. `20261014121000_quotation_transition_entry_guards.sql`.
3. `20261014122000_quotation_conflict_http_status.sql`.

La tercera usa `PT409` para conflictos de aplicación. PostgREST reintentaba el
`40001` deliberado y la petición acababa en HTTP 504; el contrato final devuelve
HTTP 409 sin reintentar una revisión obsoleta. Las serializaciones reales de
PostgreSQL conservan su código natural.

Publicar el frontend coordinadamente y recargar pestañas anteriores: envío y
aceptación usan revisión esperada; las funciones antiguas sin revisión quedan
privadas. `save_quotation_edit` mantiene SECURITY INVOKER/RLS y añade parámetros
de revisión/motivo; enviar a pricing exige revisión. Su edición sin transición
conserva compatibilidad de parámetros, y el frontend actualizado envía revisión
también al guardar. El worktree depende igualmente del SQL AUD-01/02/03 pendiente
del ambiente destino. No se ejecutó SQL ni despliegue remoto.

El backfill solo marca cotizaciones pendientes cuyo último historial demuestra
Ganada → Pendiente. Antes de publicar, revisar cotizaciones pendientes con
`repricing_return_status is null` que tengan operación/log de reapertura:
confirmar su estado anterior con evidencia. Si falta historial, no inferir una
venta ganada ni fabricar auditoría; documentar la regularización autorizada.
Los estados históricos permanecen para consulta y no reciben transiciones nuevas.

## Validación local realizada

- Reproducción previa con rollback: Ventas aprobó pricing por UPDATE y el estado
  quedó sin historial de transición.
- SQL AUD-05: guard de creación y escritura directa, perfiles/tenants/roles,
  revisión obsoleta, regreso al mismo estado, reaprobación, pérdida con motivo,
  repricing ganado, edición y rollback por error de historial o sincronización.
- Regresiones SQL AUD-01, opciones comerciales y editor integral aprobadas.
  Se actualizaron sus fixtures de tenant, datos comerciales y contratos de RPC;
  se conservaron las comprobaciones de snapshots y operación.
- Cuatro carreras entre dos conexiones, con espera real por lock: doble solicitud,
  regreso a Ganada, aprobación frente a pérdida y doble reaprobación. La segunda
  solicitud obsoleta se rechaza y no duplica historial ni sobrescribe el estado.
- PostgREST local autenticado: RPC HTTP 200 con objeto/revisión 1, UPDATE directo
  HTTP 403/42501, revisión obsoleta HTTP 409/PT409 y lectura de un único historial.
- Seis pruebas Node nuevas de contrato/respuesta/revisión/rol/repricing. Suite
  completa: 233/233; TypeScript y build (82 páginas) aprobados.
- Lint de helpers, pruebas y script nuevo limpio. Pantallas conservan 44 errores
  y 7 warnings previos, frente a 45/7 antes, sin nuevas infracciones por regla.
- `db lint --schema public --level error` no reporta errores de las funciones
  AUD-05. Reporta una referencia opcional preexistente de `mail_intake_is_demo`
  a `is_demo_environment()`: el EXECUTE está condicionado por `to_regprocedure`.
  La llamada real local a `mail_intake_is_demo()` devuelve false sin error.

## UAT pendiente en el ambiente destino

1. Dos sesiones abren la misma cotización. Una cambia el estado; la otra recibe
   conflicto y puede recargar sin perder un estado ya confirmado.
2. Verificar aprobación/envío/ganada/pérdida con cada rol, tenant y perfil.
   Invocar también la API directamente; comprobar lectura RLS del historial.
3. Reabrir desde Pricing Aprobado, Enviada y Ganada. Motivo obligatorio, una
   entrada de historial y otra de reapertura, flags de aprobación reiniciados.
4. Reabrir desde antes de la venta; aprobar sin convertirla automáticamente en
   Ganada. Reabrir una ganada sin opciones y elegir sincronizar/no sincronizar.
5. Ofrecer varias opciones, aceptar una y verificar un solo historial de cierre,
   cargos/notas del snapshot y bookings protegidos por la RPC operativa vigente.
6. Simular un fallo de historial/sincronización exclusivamente en staging:
   estado, aprobación, motivo y operación deben permanecer anteriores.
7. Verificar guardar/enviar desde el editor, razón Otra y detalle de pérdida,
   timeline, móvil/teclado, PDF y recuperación tras fallos de red.
8. Revisar repricing legado ambiguo, consumidores externos de las RPC antiguas
   y publicación conjunta de las tres migraciones y frontend.

No hubo navegador conectado ni UAT visual. Los avisos y snapshots adicionales
del cliente continúan siendo solicitudes posteriores al commit; un fallo suyo
no deshace una transición confirmada ni elimina su auditoría básica del servidor.
Guardar tarifas de agentes mantiene sus escrituras/RPC de líneas existentes:
esas ediciones previas no pertenecen a la transacción de estado. Esta etapa no
implementa revisión global ni bloqueo de cada edición concurrente de pricing.

La base usada fue `sarierp_aud01`, con 113 migraciones. Las pruebas de SQL se
revirtieron; concurrencia/API dejaron fixtures ficticios en su volumen aislado.
Arrancar Docker reanudó automáticamente los contenedores principales existentes;
no se aplicó SQL ni se escribieron datos de negocio en ese stack. No se enviaron
correos, pagos, OCR externo ni despachos reales.

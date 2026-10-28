# Ajustar seguro o cargos de una venta ganada

Regla confirmada por el usuario el 15/10/2026: agregar/ajustar el seguro de una
cotización ganada no exige enviar de nuevo ni pedir otra elección del cliente.

## Recorrido

1. Reabrir la venta ganada para pricing, indicando el motivo.
2. Mantener la tarifa de agente elegida y ajustar los cargos, incluido el seguro.
3. En Pricing, usar **Aprobar ajuste y volver a Ganada** y revisar los importes.
4. Si se muestra impacto operativo, elegir conservar la operación o sincronizar
   sus datos. Los bookings confirmados y BL conservan sus protecciones.
5. Verificar estado Ganada, seguro y totales en el PDF. No hay paso de nueva
   confirmación del cliente.

También admite ventas reabiertas que una versión anterior dejó en Pricing
Aprobado, siempre que conserven `repricing_return_status = Ganada`.

## Integridad y permisos

- Admin/Pricing aprueba; Ventas no adquiere permiso para aprobar precios.
- Reutiliza `transition_quotation`: tenant, estado/revisión, margen y auditoría
  se validan dentro de la misma transacción.
- Una elección previamente aceptada sigue siendo la base comercial. Sus líneas
  e identificación de la aceptación original se conservan sin reescribirlas.
- Un borrador único de la misma tarifa se actualiza con los cargos vigentes;
  si no existe uno único, se crea una versión nueva mediante la RPC de snapshots.
  El sucesor queda enlazado por `supersedes_option_id` y se muestra como
  **Ajuste aprobado**. No se inventa otra respuesta de cliente: `accepted_by` y
  `accepted_at` del sucesor quedan vacíos, y se registra la aprobación de Pricing.
- Los IDs/importes de cargos vigentes se conservan; únicamente se enlazan al
  snapshot aprobado. Facturas emitidas, CxP y documentos de operación no se
  recalculan por este ajuste.
- Un cambio de tarifa elegida o la ausencia de una elección anterior conservan
  el flujo comercial habitual. No se cambia el listado general de estados.

## Verificación

Regresión SQL `won_quotation_pricing_adjustments.sql`: reproduce el bloqueo
desde Pricing Aprobado antes del fix; prueba cierre desde ambos estados de
repricing, seguro, snapshots, IDs, permisos, tarifa distinta, falta de aceptación,
revisión obsoleta, rollback por auditoría y sincronización explícita.
La suite SQL auditada lo ejecuta con fixtures ficticios y rollback.

Pendiente UAT autenticada: confirmar desde el navegador la cotización afectada
y revisar su PDF. La revisión de SARIHN-2609-0266-AP fue de solo lectura: tenía
seguro en los cargos y en un borrador C, con la opción B anterior aceptada.
No se aprobó ni cambió esta venta mediante una cuenta administrativa de base.

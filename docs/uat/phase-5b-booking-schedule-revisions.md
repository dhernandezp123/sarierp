# UAT Fase 5B — Revisiones, rollover, reemplazo y cancelación

Estado: pendiente de ejecución autenticada.

## Precondiciones

- Migraciones 4A, 4B, 4C, 5A y 5B aplicadas en un ambiente de prueba.
- Un usuario Admin, uno de Operaciones y uno Cliente aprobados.
- Un shipment FCL con booking activo, Booking Confirmation y contenedores.
- Conservar evidencia del UUID, `updated_at`, estado, documentos, BL y
  contenedores antes de cada caso.

## Caso 1 — Revisión del mismo booking

1. Abrir el detalle canónico como Operaciones.
2. Elegir **Revisar itinerario**.
3. Cambiar ETD, vessel y voyage, documentar motivo y confirmar.
4. Verificar que el UUID, booking number y carrier booking no cambien.
5. Verificar ETD/ETA originales, valores vigentes y revisión secuencial.
6. Verificar evento `SCHEDULE_REVISED`, timeline sin JSON crudo y activity log.
7. Abrir portal como Cliente: debe mostrar únicamente el itinerario vigente y
   la fecha de última actualización, sin motivo interno.

Resultado: pendiente.

## Caso 2 — Rollover con la misma reserva

1. Llevar un booking a `Listo para Embarque` sin `actual_etd`.
2. Elegir **Registrar rollover**.
3. Mantener booking number y cambiar vessel/voyage/ETD/ETA.
4. Seleccionar retorno a `Booking Confirmado` o
   `Documentación Pendiente`, documentar motivo y confirmar.
5. Verificar revisión `ROLLOVER_SAME_BOOKING`, evento
   `BOOKING_ROLLED_OVER`, fechas originales y documentos conservados.
6. No marcar cliente notificado y confirmar la alerta calculada.
7. Repetir en un booking con `actual_etd`: debe bloquearse.

Resultado: pendiente.

## Caso 3 — Reemplazo formal

1. Elegir **Reemplazar booking** sobre un booking no embarcado.
2. Capturar nuevo booking number/carrier booking e itinerario.
3. Usar primero `KEEP_WITH_OLD`.
4. Confirmar que el booking anterior quede `REPLACED`/histórico y el nuevo
   quede `ACTIVE`, enlazados en ambas direcciones.
5. Confirmar actualización de `primary_booking_id` cuando el anterior era
   primario.
6. Confirmar que no se copiaron MBL/HBL, BL estructurados, documentos,
   `actual_etd/actual_eta`, tracking ni eventos.
7. Probar `MOVE_ALL_IF_NOT_PHYSICALLY_USED` con Gate In: debe bloquearse.
8. Probar reemplazo con BL emitido: debe bloquearse para Operaciones.
9. En portal y métricas activas debe aparecer únicamente el sustituto.

Resultado: pendiente.

## Caso 4 — Cancelación definitiva

1. Elegir **Cancelar booking**, escribir un motivo y confirmar.
2. Verificar estado `CANCELLED`, usuario/fecha/motivo y evento
   `BOOKING_CANCELLED`.
3. Confirmar que documentos, BL, eventos y booking se preservan.
4. Si era primario, confirmar que queda vacío y que no se elige otro
   silenciosamente.
5. Confirmar alerta `Booking cancelado sin sustituto`.
6. Intentar cancelar después de `actual_etd`: Operaciones debe quedar
   bloqueado; la excepción debe estar disponible solo para Admin y auditada.

Resultado: pendiente.

## Caso 5 — Corrección administrativa

1. Como Admin, abrir **Corrección Admin**.
2. Corregir un typo, indicar motivo y confirmar.
3. Verificar activity log y revisión `ADMIN_CORRECTION`.
4. Confirmar que no se generó un evento operativo de rollover/revisión.
5. Intentar usar la acción en un booking `REPLACED`: debe bloquearse.

Resultado: pendiente.

## Aprobación

- Operaciones: pendiente.
- Admin: pendiente.
- Cliente/Portal: pendiente.
- Evidencia adjunta: pendiente.

No declarar la Fase 5B aprobada hasta completar esta matriz autenticada.

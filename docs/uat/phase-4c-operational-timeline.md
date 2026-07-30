# Fase 4C — Timeline operativo y transiciones controladas

## Alcance implementado

- `operational_events` es el historial canónico y separa `occurred_at` de
  `created_at`.
- `shipping_instruction_events` se conserva sin edición ni borrado.
- El backfill usa `source_system = 'legacy'` y `source_id` para reconciliación
  idempotente.
- Los eventos multi-booking ambiguos quedan a nivel de SI con
  `migration_resolution = unresolved_multi_booking`; nunca se usa
  `primary_booking_id` para resolverlos.
- `transition_booking_status` reemplaza el selector libre de estado.
- `update_booking_canonical` ya no acepta `shipment_status`.
- `reopen_booking` es una acción separada, exclusiva de Admin, con motivo y
  reconocimiento expreso cuando existen BL emitidos.
- `finalize_shipping_instruction_canonical` bloquea SI y bookings, excluye
  cancelados y actualiza únicamente `shipping_instructions.operational_status`.
- El estado agregado de SI se deriva; no se persiste en las columnas legacy.

## Matriz de transiciones

| Estado actual | Acción | Estado destino | Evento |
| --- | --- | --- | --- |
| Pendiente Validación / Listo para Booking | Solicitar booking | Booking Solicitado | `BOOKING_REQUESTED` |
| Booking Solicitado | Confirmar booking | Booking Confirmado | `BOOKING_CONFIRMED` |
| Booking Confirmado | Marcar documentación pendiente | Documentación Pendiente | `OPERATIONAL_NOTE` |
| Documentación Pendiente | Marcar listo | Listo para Embarque | `CONTAINER_LOADED` |
| Listo para Embarque | Registrar embarque | Embarcado | `ON_BOARD` |
| Embarcado | Marcar en tránsito | En Tránsito | `DEPARTED` |
| En Tránsito | Registrar arribo | Arribado | `ARRIVED` |
| Arribado | Finalizar booking | Finalizado | `BOOKING_COMPLETED` |

`Embarcado` representa la confirmación de carga a bordo. `En Tránsito`
representa la salida real de la nave y crea `DEPARTED`; por eso ambas etapas se
mantienen separadas en 4C.

## Validaciones por etapa

- Confirmado: booking number o carrier booking, carrier, ETD y ETA. La falta
  de contenedores y de Booking Confirmation genera warning durante el rollout.
- Listo para Embarque: vessel, voyage, ETD, contenedores y Booking
  Confirmation, Commercial Invoice y Packing List.
- Embarcado / En Tránsito: vessel, voyage, contenedores y fecha del evento.
  Una fecha real existente distinta exige confirmación explícita en metadata.
- Arribado: solo desde En Tránsito; la fecha del evento alimenta `actual_eta`.
- Finalizado: estado Arribado, distribución completa de contenedores, entrega
  registrada o excepción con motivo, y documentos obligatorios vigentes.

## Reconciliación local

La base local inspeccionada no contiene datos históricos:

| Métrica | Resultado |
| --- | ---: |
| `shipping_instruction_events` | 0 |
| Eventos legacy reconciliados | 0 |
| Inserciones al repetir backfill | 0 |

La suite sintética verificó SI con un booking, SI con múltiples bookings y
evento ambiguo, reconciliación 1:1 y segunda ejecución sin duplicados.

## Pruebas automatizadas

- `supabase/tests/canonical_operational_events.sql`: OK, con rollback.
- `supabase/tests/booking_canonical_foundation.sql`: OK, regresión 4A.
- `supabase/tests/booking_canonical_consumers.sql`: OK, regresión 4B.
- Casos cubiertos: rol no autorizado, booking de otra SI, contenedor de otro
  booking, nota sin contenido, evento válido, backfill idempotente, transición
  válida/inválida, salto, concurrencia, datos mínimos, embarque sin nave,
  arribo prematuro, finalización sin entrega, inmutabilidad, SI pendiente,
  exclusión de cancelados, activity logs y cero escrituras legacy.

## Baseline de lint

Antes de 4C, el baseline global guardado era:

- 401 problemas: 326 errores y 75 warnings.
- Detalle de booking canónico: 5 problemas, 3 errores y 2 warnings.

Después de 4C:

- 392 problemas: 318 errores y 74 warnings. El comando global continúa
  fallando; no se declara aprobado.
- Detalle de booking canónico: conserva 5 problemas preexistentes, 3 errores
  y 2 warnings.
- `BookingTimeline.tsx` y `booking-status.ts`: 0 hallazgos.
- El detalle de SI conserva sus hallazgos legacy; el cambio de 4C no agregó
  una categoría nueva.

## UAT autenticada pendiente

No se declara UAT completada. Ejecutar con usuario Admin u Operaciones:

### Booking

- [ ] Crear nota operativa y verificar usuario, ocurrencia y registro.
- [ ] Confirmar booking con datos válidos.
- [ ] Intentar salto de Booking Confirmado a Arribado/Finalizado.
- [ ] Registrar embarque y comprobar `actual_etd`.
- [ ] Registrar arribo y comprobar `actual_eta`.
- [ ] Registrar entrega.
- [ ] Finalizar booking.
- [ ] Abrir dos sesiones y confirmar el conflicto optimista.
- [ ] Abrir un booking finalizado histórico y confirmar inmutabilidad.

### Multi-booking

- [ ] Crear SI con dos bookings en etapas distintas.
- [ ] Verificar Parcialmente Confirmado y Arribo Parcial.
- [ ] Crear evento propio de un booking y evento general de SI.
- [ ] Confirmar que la SI no finaliza hasta completar ambos bookings activos.
- [ ] Confirmar que un booking cancelado se excluye explícitamente.

### Histórico

- [ ] Aplicar primero la migración en un ambiente controlado con datos.
- [ ] Comparar conteo legacy contra `source_system = 'legacy'`.
- [ ] Verificar asociación única y casos `unresolved_multi_booking`.
- [ ] Confirmar que ningún estado cambió por el backfill.

## Compatibilidad y consumidores pendientes

- El detalle de booking lee únicamente `operational_events`.
- El detalle de SI todavía lee `shipping_instruction_events` como histórico
  legacy y `activity_logs`; sus nuevas escrituras ya usan el RPC canónico.
- No existe doble escritura ni trigger de sincronización.
- Las columnas legacy de estado de SI permanecen para compatibilidad. El
  agregado visual se deriva desde `bookings`.

## Rollback

1. Revertir la UI a lectura de estado sin ejecutar transiciones nuevas.
2. Revocar ejecución de las RPC 4C mediante una migración compensatoria.
3. Mantener `operational_events` en modo solo lectura para preservar historia.
4. Restaurar la versión previa de `update_booking_canonical` únicamente si se
   acepta temporalmente el riesgo de cambios libres de estado.
5. No borrar eventos canónicos ni legacy. No revertir con SQL destructivo.

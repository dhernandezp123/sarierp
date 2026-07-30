# Fase 5A — Fundación de Shipment canónico

## Alcance

`shipments` pasa a ser la raíz operativa. `shipping_instructions` se conserva
como documento y contexto, las rutas actuales siguen usando el ID de SI y los
UUID del backfill coinciden para mantener compatibilidad.

La creación desde cotización usa `create_shipment_from_quotation`. Los
escritores legacy de SI quedan cubiertos temporalmente por una guardia de base
de datos que crea el shipment asociado; el frontend no realiza doble escritura.

## Resultado local del backfill

La base local no contenía datos operativos antes de aplicar 5A:

| Métrica | Resultado |
| --- | ---: |
| Shipping Instructions fuente | 0 |
| Shipments insertados | 0 |
| Bookings vinculados | 0 |
| Eventos vinculados | 0 |
| Excepciones A–F encontradas | 0 |

La suite sintética cubre filas completas, sin cotización, históricas,
uno y varios bookings. El backfill se ejecuta dos veces dentro de una
transacción y la segunda ejecución no inserta ni enlaza filas.

## Estado operativo temporal

`derive_shipment_operational_status` deriva el estado desde bookings activos y
eventos. `shipments.operational_status` solo se actualiza desde la fundación y
RPC canónicas; no existe edición desde frontend.

| Señal canónica | Estado derivado |
| --- | --- |
| Sin bookings | Sin bookings |
| Solicitudes pendientes | Booking en proceso |
| Solicitud y confirmación coexistentes | Parcialmente confirmado |
| Todos confirmados/documentación | Confirmado |
| Preparación o eventos de origen | Origen en proceso |
| Al menos un booking embarcado | Embarcado |
| Al menos un booking en tránsito | En tránsito |
| Arribados/finalizados mezclados con pendientes | Arribo parcial |
| Todos arribados | Arribado |
| Todos arribados con entregas | Cierre en proceso |
| Todos los bookings activos finalizados | Finalizado |
| Todos cancelados | Cancelado |

`shipping_instructions.operational_status` queda como compatibilidad temporal.
Los diagnósticos reportan diferencias; el frontend no escribe ambos estados.

## UAT autenticada pendiente

No se declara UAT aprobada. Ejecutar primero en un ambiente controlado con una
copia representativa de datos.

### Operaciones

- [ ] Abrir una SI existente y confirmar el bloque “Operación canónica”.
- [ ] Confirmar que el número y UUID corresponden al shipment asociado.
- [ ] Crear un booking y verificar `shipment_id`.
- [ ] Registrar un evento y verificar `operational_events.shipment_id`.
- [ ] Cambiar el estado del booking y revisar timeline y estado derivado.
- [ ] Finalizar la SI y verificar `shipments.closed_at`.
- [ ] Abrir una operación con varios bookings y revisar el estado agregado.
- [ ] Confirmar que la URL legacy de SI continúa funcionando.

### Portal

- [ ] Ingresar como Cliente y abrir una operación existente.
- [ ] Confirmar una fila por shipment, sin acceso directo a la tabla.
- [ ] Abrir la URL anterior y confirmar que mantiene compatibilidad.
- [ ] Verificar que una operación con varios bookings muestra todos sus datos.
- [ ] Intentar consultar una operación de otro cliente.

### Reportes y Cost Validation

- [ ] Comparar conteos de operaciones antes/después: deben ser idénticos.
- [ ] Confirmar una fila por shipment en Vista Operaciones.
- [ ] Confirmar N filas por booking en Vista Bookings.
- [ ] Abrir Cost Validation para una cotización con una operación.
- [ ] Abrir Cost Validation para una cotización con varios shipments y
  confirmar que agrega todos sin error `maybeSingle`.

### Históricos y excepciones

- [ ] Revisar una SI finalizada y una cancelada.
- [ ] Revisar una SI sin booking.
- [ ] Revisar una SI sin cotización, sin cliente resoluble o con estado
  desconocido.
- [ ] Ejecutar los cuatro diagnósticos y resolver cualquier inconsistencia.
- [ ] Confirmar que no se eliminó ni reescribió ningún evento histórico.

## Plan de despliegue

1. Crear backup y capturar conteos de SI, bookings y eventos.
2. Ejecutar los diagnósticos de clasificación antes de la ventana.
3. Aplicar 4A, 4B, 4C y luego `20260729150000_shipments_foundation.sql`.
4. Ejecutar `shipment_post_foundation_validation.sql` y
   `shipment_relationship_consistency.sql`.
5. Comparar conteos y revisar excepciones A–F.
6. Desplegar frontend.
7. Ejecutar la UAT autenticada anterior.
8. Mantener monitoreo sobre errores de guardias y RPC.

## Rollback no destructivo

1. Revertir el frontend para resolver nuevamente por SI.
2. Mediante una migración compensatoria, revocar las RPC nuevas si fuera
   necesario.
3. Mantener `shipments`, `bookings.shipment_id` y
   `operational_events.shipment_id` sin nuevas escrituras.
4. No borrar shipments creados por backfill.
5. No eliminar columnas, FK legacy, IDs ni relaciones históricas.

## Consumidores todavía dependientes de SI

- Las URLs internas y de portal mantienen el UUID de SI por compatibilidad.
- Los formularios y documentos de Shipping Instructions siguen leyendo SI.
- BL conserva su relación documental con SI y booking.
- Algunas vistas de contexto, navegación y notificaciones conservan nombres
  legacy, aunque la raíz consultada para operación sea shipment.
- Facturación y documentos no se migran en esta fase.

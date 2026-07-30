# Fase 4B — Consumidores de Booking Canónico

Estado del UAT: **Pendiente de ejecución autenticada**.

Este documento no declara aprobada la fase. Las pruebas SQL y estáticas no
reemplazan la validación manual con usuarios y datos representativos.

## Contratos Portal v1 y v2

| Contrato | Granularidad | Fuente operativa | Fuente BL | Multi-booking |
| --- | --- | --- | --- | --- |
| `get_client_shipments` (v1) | Una SI resumida | Campos legacy de SI | Campos legacy de SI | No |
| `get_client_shipments_v2` | Una operación/SI | Agregados de `bookings` | No aplica en listado | Indica cantidad |
| `get_client_shipment_detail_v2` | Operación con arreglo de bookings | `bookings` | `bills_of_lading`; caché de booking solo como fallback en UI | Muestra todos |

V1 permanece creado como rollback. Las páginas activas del portal llaman
exclusivamente a v2.

## Criterio de estado agregado

Una SI sin bookings usa temporalmente `operational_status`. Con bookings:

- Todos cancelados: `Cancelada`.
- Todos finalizados: `Finalizado`.
- Estados mixtos: gana el booking activo menos avanzado.
- Los bookings cancelados/finalizados no adelantan el estado de otros
  bookings todavía activos.

El mismo criterio vive en
`public.aggregate_shipping_instruction_booking_status` para RPCs y en
`src/lib/booking-status.ts` para consumidores de UI.

## Revisión de PDFs

- `shipping-instruction-order-pdf.tsx` está activo desde el detalle de SI.
  Es una instrucción prevista para agente/proveedor: puede usar SI, cotización
  y tarifa seleccionada. No se presenta como confirmación de booking y no
  imprime números MBL/HBL.
- `shipping-instruction-pdf.tsx` solo está reexportado por
  `ShippingInstructionPdf.tsx`; no se encontró consumidor activo. Se conserva
  por compatibilidad y se considera candidato a retiro en una fase posterior.
- Los PDFs de MBL/HBL trabajan con un registro `bills_of_lading` explícito.
  No se agregó selección automática de booking cuando una SI tiene varios.

## Checklist manual — Operaciones

- [ ] Abrir una SI con 0 bookings y confirmar indicador `Sin bookings`.
- [ ] Abrir una SI con 1 booking y confirmar ruta canónica.
- [ ] Abrir una SI con 2 o más bookings y confirmar que ninguno se oculta.
- [ ] Confirmar un booking y verificar que repricing posterior lo omita.
- [ ] Repricear un booking solicitado y verificar carrier, ETD/ETA estimadas,
      tránsito y free days.
- [ ] Verificar el mensaje con cantidades actualizadas/omitidas.
- [ ] Abrir Reportes > Cargas > Operaciones: una fila por SI.
- [ ] Cambiar a Reportes > Cargas > Bookings: una fila por booking.
- [ ] Confirmar que no aparece una fila adicional por booking legacy de SI.
- [ ] Revisar alertas independientes para dos bookings de una misma SI.
- [ ] Confirmar alerta de SI sin bookings.
- [ ] Confirmar ETA y free days contra los valores del booking.

## Checklist manual — Portal

- [ ] Cliente con una SI y un booking ve una operación y su booking.
- [ ] Cliente con una SI y varios bookings ve una operación en listado y todos
      los bookings en detalle.
- [ ] Cada booking muestra sus propias fechas, carrier, nave/viaje y estado.
- [ ] Cada enlace de tracking corresponde al booking de su tarjeta.
- [ ] MBL/HBL estructurado prevalece visualmente sobre caché del booking.
- [ ] Estado y release type documental se muestran cuando existen.
- [ ] Un cliente no puede abrir por URL una SI de otra cuenta.
- [ ] No aparecen comentarios operativos, costos, margen ni contactos internos
      del agente.

## Checklist manual — Finanzas

- [ ] Cost Validation con un booking muestra su referencia.
- [ ] Cost Validation con varios bookings muestra la tabla completa.
- [ ] El resumen indica explícitamente `Costo a nivel de cotización`.
- [ ] El costo cotizado total no cambia al agregar bookings.
- [ ] El costo real total no se repite ni multiplica por booking.

## Rollback

1. Revertir los consumidores frontend a los contratos anteriores.
2. Rehabilitar temporalmente `EXECUTE` del RPC de repricing v1 solo si se
   acepta conscientemente volver a escribir campos legacy en SI.
3. Mantener v1 del portal disponible durante la reversión.
4. Revertir SQL con una migración compensatoria; no editar migraciones
   aplicadas.

No se eliminaron columnas, no se creó `shipments`, no se agregaron triggers
destructivos y no se aplicó SQL al proyecto remoto.

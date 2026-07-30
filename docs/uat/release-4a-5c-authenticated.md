# Checklist UAT autenticada — Release 4A–5C

Estado global: **PENDIENTE / NO-GO**.

Ambiente obligatorio: copia representativa aislada, con archivos sensibles
anonimizados y las seis migraciones aplicadas mediante el runner de release.

## Identificación de la ejecución

- Commit candidato:
- Fecha/hora:
- Ambiente:
- Snapshot/backup:
- Evidencia del rehearsal:
- Admin:
- Operaciones:
- Ventas/Pricing:
- Cliente:

## Gate previo

- [ ] Los hashes coinciden con el inventario 4A–5C.
- [ ] Predeploy gate devuelve `PREDEPLOY_GATE_OK`.
- [ ] Postdeploy gate devuelve `POSTDEPLOY_GATE_OK`.
- [ ] Todos los diagnósticos retornan cero hallazgos no explicados.
- [ ] Conteos pre/post fueron conciliados y firmados.
- [ ] No existe exposición de datos reales en capturas o logs.

## 4A — Booking canónico

- [ ] Operaciones crea el primer booking desde una SI.
- [ ] El primer booking queda primario.
- [ ] Crear un segundo booking no cambia el primario silenciosamente.
- [ ] Cambiar el primario exige usuario autorizado y queda auditado.
- [ ] Editar datos generales usa control optimista de `updated_at`.
- [ ] Dos sesiones concurrentes producen conflicto controlado, no pérdida.
- [ ] La ruta legacy redirige correctamente con 0, 1 y N bookings.
- [ ] Ventas, Pricing y Cliente no pueden escribir el booking.

## 4B — Consumidores canónicos

- [ ] Portal lista cada shipment/booking autorizado una sola vez.
- [ ] El detalle del portal no expone otro cliente alterando el UUID.
- [ ] Cost Validation conserva cardinalidad e importes.
- [ ] Reportes concilian con los bookings canónicos.
- [ ] Repricing sincroniza mediante la RPC v2 y no sobrescribe evidencia
      operativa confirmada.
- [ ] MBL/HBL y documentos se resuelven desde el booking correcto.

## 4C — Timeline y transiciones

- [ ] Operaciones registra una nota y aparece en orden cronológico.
- [ ] Transiciones válidas crean un único evento.
- [ ] Transiciones inválidas no cambian estado.
- [ ] El timeline muestra descripción humana y no JSON crudo.
- [ ] Gate In queda asociado al contenedor correcto.
- [ ] Finalizar SI valida todos los bookings requeridos.
- [ ] Reapertura exige rol/motivo y queda auditada.
- [ ] Cliente ve únicamente eventos permitidos.

## 5A — Shipment canónico

- [ ] Una cotización aprobada crea shipment + SI atómicamente.
- [ ] Repetir con la misma `creation_key` retorna el mismo shipment.
- [ ] No existe doble shipment activo para la misma clave/cotización.
- [ ] Bookings y eventos tienen el mismo `shipment_id`.
- [ ] Dashboard, portal, alertas, Cost Validation y reportes abren el shipment
      correcto.
- [ ] La RPC `create_shipment_from_quotation` está visible en schema cache.
- [ ] Cliente no puede crear ni modificar shipments.

## 5B — Revisiones, rollover y reemplazo

- [ ] Revisar itinerario conserva UUID e identidad de booking.
- [ ] ETD/ETA originales no se sobrescriben.
- [ ] Rollover crea revisión secuencial y evento.
- [ ] Desde `Listo para Embarque` solo retrocede a un estado permitido.
- [ ] Reemplazo enlaza booking anterior/nuevo sin copiar BL, fechas reales,
      documentos ni eventos.
- [ ] Booking reemplazado/cancelado sale de vistas activas sin perder historia.
- [ ] Cancelación y corrección administrativa exigen motivo/rol.
- [ ] Portal muestra solo el itinerario vigente y no motivos internos.

## 5C — Cut-offs, VGM y readiness

- [ ] FCL exige una fila por contenedor físico y VGM por unidad.
- [ ] LCL y aéreo exigen carga/documentos sin VGM marítimo.
- [ ] Terrestre no exige vessel/voyage/VGM marítimo.
- [ ] Cut-off conserva fecha/hora, timezone IANA, fuente y versiones.
- [ ] Cut-off vencido bloquea readiness y crea alerta.
- [ ] VGM recorre borrador, verificado, enviado y aceptado/rechazado.
- [ ] Corregir VGM crea versión y no borra historia.
- [ ] `Listo para Embarque` bloqueado no cambia estado y enumera faltantes.
- [ ] `Embarcado` vuelve a evaluar y guarda snapshot atómico.
- [ ] Excepción solo Admin, con motivo, vencimiento y auditoría.
- [ ] Rollover preserva VGM solo para el mismo contenedor.
- [ ] Reemplazo no hereda cut-offs, VGM, excepciones ni snapshots.
- [ ] Portal no expone aprobadores, motivos internos ni excepciones.
- [ ] Dashboard, alertas y reportes concilian readiness y VGM.

## Regresión de documentos

- [ ] Se puede crear y abrir MBL.
- [ ] HBL hereda los contenedores del MBL correspondiente.
- [ ] Draft BL y booking se pueden imprimir.
- [ ] Los documentos cargados continúan accesibles según rol.

## Evidencia obligatoria

- [ ] Capturas de cada rol sin datos sensibles.
- [ ] UUID y resultado antes/después de cada caso.
- [ ] Eventos y activity logs de las acciones críticas.
- [ ] Export de reportes conciliado.
- [ ] Errores esperados de RLS y transiciones inválidas.
- [ ] Firma de responsables.

## Aprobación

| Área | Responsable | Resultado | Fecha | Evidencia |
|---|---|---|---|---|
| Admin |  | Pendiente |  |  |
| Operaciones |  | Pendiente |  |  |
| Ventas/Pricing |  | Pendiente |  |  |
| Cliente/Portal |  | Pendiente |  |  |
| Seguridad/RLS |  | Pendiente |  |  |
| Datos/Reportes |  | Pendiente |  |  |

Una fila pendiente, fallida o sin evidencia mantiene el release en `NO-GO`.

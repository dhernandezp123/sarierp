# Revision de solicitudes de Gerencia - 04/11/2026

Estado: revision de codigo y propuesta funcional; estas funciones nuevas no estan implementadas ni desplegadas. Demo permanece fuera de publicaciones por instruccion del usuario.

## 1. Cortesias por linea de factura

Decision confirmada por el usuario: Gerencia debe aprobar cada cortesia. No es un permiso permanente para eliminar conceptos.

Hallazgos:

- `src/app/(protected)/invoicing/new/page.tsx` bloquea quitar lineas con `source_pricing_item_id`, pero permite capturar descuentos por linea.
- `src/lib/invoice-fiscal.ts` admite descuentos hasta el bruto de la linea, por lo que un descuento completo puede llevarla a cero. La nueva politica debe cubrir esa via, ademas del boton de quitar.
- `src/lib/invoice-drafts.ts` conserva referencia a Pricing y transmite descuentos por origen.
- Existe borrador/versionado, auditoria y aprobacion de correcciones (`invoice_drafts`, `invoice_workflow_events`, `review_invoice_correction`, `issue_invoice_draft`). Esa aprobacion actual no es una aprobacion especial de cortesia para una factura nueva.
- El usuario confirmo como autorizadores a Admin Pruebas y al master de Contabilidad (Zonia Flores); Mauricio Rivera se incorporara cuando exista su cuenta. El master de Contabilidad no equivale a dar permiso a todo el rol Contabilidad.

Flujo propuesto:

1. Desde un borrador, solicitar cortesia de una linea, indicando motivo y monto original.
2. Gerencia recibe solicitud y aprueba o rechaza cada concepto. Se guarda solicitante, revisor, fecha, motivo y resultado.
3. El servidor valida autorizacion, empresa, revision del borrador y huella de la linea/cotizacion antes de emitir. Una modificacion relevante invalida la aprobacion.
4. La linea no se elimina de la cotizacion ni del historial. Puede omitirse del documento a emitir con una referencia de cortesia auditada; conservar precio/costo y motivo originales para rentabilidad y control interno.
5. Bloquear igualmente el descuento total que eluda esta aprobacion. No basta con esconder o habilitar un boton.
6. Una factura emitida no se modifica ni pierde lineas mediante esta accion. Cualquier ajuste posterior requiere el flujo documental correspondiente y su autorizacion, por definir con Contabilidad.

Validaciones necesarias: rechazo sin aprobacion y por otro tenant; revision obsoleta; cambios del monto/origen; doble uso; emision atomica; no consumir correlativo ante rechazo; conservar cotizacion, impuestos del resto de lineas y snapshots comerciales. No se determina tratamiento fiscal nuevo en esta revision.

## 2. Ultima actividad del cliente y alertas

Hallazgos:

- Hay cotizaciones, operaciones/bookings, actividad comercial y cola de seguimiento (`src/lib/sales-work-queue.ts`).
- El reporte de operaciones por cliente (`src/lib/client-operations-report.ts`) permite consultar operaciones, pero no es un resumen de recencia/inactividad del cliente.
- No se encontro una alerta dedicada que separe ultima cotizacion, ultima operacion registrada y ultimo embarque efectivo.

Propuesta:

- Mostrar en perfil/listado: ultima cotizacion creada, ultima operacion registrada, ultimo embarque efectivo y dias transcurridos por indicador.
- La edicion de una direccion, nota o cotizacion antigua no debe reiniciar la actividad comercial. No usar `clientes.updated_at` ni el ultimo cambio generico como ultima venta/operacion.
- Para movimiento efectivo usar las fechas/eventos operativos reales disponibles (por ejemplo, `actual_etd`); mostrar por separado la fecha de creacion de la operacion. Incluir Miami cuando el cliente utilice ese producto, con su identidad de cliente canonica.
- Opciones configurables de inactividad propuestas: 30/60/90 dias, separando sin cotizar de sin mover; estas cifras son propuestas, no reglas aprobadas.
- Avisos internos a Ventas responsable y Gerencia, con enlace al perfil; clientes nuevos/sin historial deben tener estado propio. No enviar una alerta de inactividad comercial al cliente automaticamente.
- Deduplicar por cliente, tipo, umbral y periodo; excluir registros anulados/eliminados segun su flujo y respetar visibilidad de cada vendedor/empresa.

## 3. Gastos mensuales

Existe actualmente: `/accounting/books`, selector **Estado de resultados**, rango Desde/Hasta. `src/lib/accounting-books.ts` agrupa cuentas Ingreso/Costo/Gasto y calcula el gasto del periodo con debitos menos creditos. Los importes se presentan en HNL y solo incluyen partidas contabilizadas.

Tambien existe Libro mayor por una o varias cuentas para consultar el detalle, y Tesoreria presenta salidas y flujo de caja realizado. Un registro operativo sin contabilizar no queda certificado por el estado de resultados.

Mejora propuesta:

- Vista Gastos mensuales con ranking por cuenta/categoria, participacion, comparacion con mes anterior y detalle hacia asiento/compra/proveedor.
- Separar gastos, costos operativos y movimientos clasificados como activos; mostrar inversiones/adquisiciones con su propia vista, sin sumar cualquier salida bancaria como gasto.
- Mantener filtros por periodo, empresa/oficina y fuente, exportaciones y sumas verificables contra el estado de resultados; no mezclar monedas originales al comparar.

## 4. Alertas contables y vencimientos

Hallazgos:

- `src/lib/alerts.ts` solo define Comercial, Operativa y Gerencial. El rol Contabilidad/Finanzas omite la carga operativa y las alertas de readiness de bookings.
- Existen notificaciones internas (`src/lib/notifications.ts`) y del portal (`client_notifications`, `src/hooks/useClientNotifications.ts`).
- `/reports` tiene Cuentas por cobrar y Vencidas: existe consulta de vencimiento/saldo, pero no se encontro un ciclo de recordatorios contables equivalente al solicitado.
- El perfil del cliente muestra `email_1`, `email_2`, contactos y terminos de credito. Un correo registrado no implica que tenga usuario de portal; la notificacion de sistema requiere un perfil vinculado al cliente.
- El portal de notificaciones solo navega a paquetes/envios/incidencias; falta destino de factura/estado de cuenta para avisos de cobro.
- Hay entrega de correo auditada e idempotente en `src/lib/server/email-delivery.ts`; no se debe conectar una nueva alerta enviando correos directamente desde el navegador.

Diseno propuesto:

| Evento | Destinatarios | Canal | Resolucion |
| --- | --- | --- | --- |
| Embarque listo para facturar | Contabilidad/Finanzas y responsable operativo | Centro de alertas y campana interna | Emitir factura valida o retirar la condicion de listo |
| Factura por vencer | Contabilidad, responsable operativo y contactos de cobro del cliente | Interno; portal/correo segun configuracion del cliente | Pago/aplicacion de credito que liquide saldo, anulacion o cambio de vencimiento |
| Factura vencida con saldo | Los mismos destinatarios autorizados | Interno y canales del cliente habilitados | Igual; trabajar sobre saldo pendiente real |

Para listo para facturar: definir un evento/confirmacion explicita de Operaciones o la regla de readiness correspondiente, validacion financiera y ausencia de factura activa equivalente. No inferir que arribo, ETD o solo una cotizacion Ganada bastan para todos los productos.

Recordatorios propuestos, configurables: 7 y 3 dias antes, dia del vencimiento y seguimiento vencido. No son una configuracion ya existente ni aprobada. La programacion debe correr en servidor aunque nadie abra la pantalla, con calendario de Honduras, lote acotado, auditoria y reintentos seguros.

Cada aviso debe identificar factura, cliente, moneda, vencimiento, saldo y enlace autorizado. Deduplicar por empresa, evento/documento, destinatario y etapa; revalidar saldo/estado al procesar. Diferenciar destinatarios de cobro de los contactos operativos. No duplicar correos iguales. No exponer estados de cuenta de otros clientes. Demo no debe enviar correo real.

## Dependencias y limites de la revision

- Identidades vigentes de Admin Pruebas y Zonia Flores verificadas por ID y empresa; Mauricio Rivera queda pendiente de creacion e incorporacion explicita. Reglas y preparacion de permisos: `docs/gerencia-implementacion-fase1.md`.
- Definir criterio de listo para facturar y confirmar calendarios de avisos antes de activar automatismos externos.
- La revision es de codigo/migraciones del repositorio; no demuestra que un scheduler externo este o no configurado en una cuenta administrativa.
- No se modificaron permisos, facturas, asientos, bases de datos ni configuracion remota; no se enviaron correos.
- Orden recomendado: autorizacion de cortesias y control de descuentos; alertas internas de facturacion/vencimiento; avisos de cliente; recencia comercial y vista mensual de gastos.

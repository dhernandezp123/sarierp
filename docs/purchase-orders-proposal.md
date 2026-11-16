# Solicitudes y órdenes de compra

Propuesta funcional del 13/11/2026. Primera versión implementada localmente el 16/11/2026; migración, despliegue y UAT autenticada pendientes. Las correcciones de Facturación y vencimiento se entregan por separado.

## Decisiones e implementación del 16/11/2026

- Admin y Contabilidad activos y aprobados crean y aprueban; ambos pueden aprobar sus propios documentos. Cada acción registra actor, revisión y motivo cuando corresponde. Finanzas y los demás roles no reciben estos permisos.
- La referencia visual es el PDF de solicitud compartido por el usuario. Se reutiliza `FiscalDocumentLayout`, el logo de Sari y el rojo `#B3282D` de las facturas; no se incluyen datos reales del documento en fixtures ni en el repositorio.
- Compras incorpora navegación a Documentos recibidos, Solicitudes y Órdenes. Hay borradores, envío a aprobación, aprobación, rechazo con motivo, cancelación y PDF. Editar invalida la aprobación; las órdenes con facturas conservan su snapshot.
- Una solicitud aprobada genera una sola orden en borrador. También se permite crear una orden directa, que debe enviarse y aprobarse antes de facturar.
- La factura desde orden utiliza `create_purchase_document`, con cantidades parciales, descuentos proporcionales y precios/impuestos aprobados. Un reintento no consume dos veces cantidades ni crea otra deuda. Los precios distintos requieren revisar la orden antes de facturar; no se ajustan silenciosamente en la conversión.
- La anulación fiscal existente recupera cantidades pendientes sin borrar la trazabilidad. Cancelar una orden parcialmente facturada cancela únicamente su remanente; las facturas vinculadas siguen su propio proceso fiscal.
- Modelo implementado: `purchase_workflow_documents` distingue Solicitud/Orden y guarda snapshots y líneas JSON, como los documentos de compra existentes; `purchase_workflow_events` registra auditoría/idempotencia y `purchase_order_allocations` controla el remanente por línea. Las escrituras se realizan mediante RPC; RLS protege lectura por empresa y permisos. Este modelo reemplaza la separación en cuatro tablas planteada inicialmente, sin duplicar el motor de documentos recibidos.
- En esta entrega: HNL/USD, equivalencia informativa, condición de pago y vencimiento independientes del proveedor, medios previstos, referencia y CAI del proveedor, fiscalidad mixta/exenta/exonerada/gravada, cuentas y servicios del catálogo, notas internas separadas del PDF.
- Pendientes de etapas posteriores: recepción física de mercadería y carga de adjuntos privados. La primera versión no envía correos ni registra pagos desde una solicitud/orden. Las otras monedas y conversión de precios se mantienen como ampliaciones; las facturas vinculadas conservan moneda y tipo de cambio de la orden.

## Flujo propuesto

```mermaid
flowchart LR
  A[Solicitud en borrador] --> B[Pendiente de aprobación]
  B --> C[Aprobada]
  B --> D[Rechazada con motivo]
  C --> E[Orden de compra]
  E --> F[Factura del proveedor]
  F --> G[Cuenta por pagar]
  G --> H[Pago por Tesorería]
```

Se recomienda un módulo con dos etapas: solicitud interna y orden de compra autorizada. Para compras sencillas, un usuario con permiso de aprobación podrá crear directamente la orden. Solicitar o aprobar una orden no crea una deuda, no registra un pago ni genera una partida contable; esos efectos se mantienen en los procesos actuales de factura recibida y pago. La orden puede imprimirse como PDF comercial.

La navegación propuesta es Contabilidad → Compras → pestañas Documentos, Solicitudes y Órdenes. Rutas propuestas: `/accounting/purchase-requests` y `/accounting/purchase-orders`. No se reutiliza la proforma de clientes como orden a proveedores.

## Formulario

| Sección | Campos y comportamiento |
| --- | --- |
| Proveedor | Selección del catálogo existente, contacto y condiciones; conservar snapshot al aprobar. Proveedor opcional en solicitud inicial y obligatorio en orden. |
| Documento | Número interno, solicitud origen, fecha de emisión y oficina/punto de venta de la empresa; no confundir con punto de emisión de la factura del proveedor. |
| Fiscal | Mixta/según líneas, Gravada, Exenta y Exonerada. Checkbox Gravable por línea y tasa 15/18 cuando aplique. Distinguir Exenta de Exonerada y permitir respaldo privado. |
| Líneas | Servicio único, descripción, cantidad, precio, descuento, cuenta de costo/gasto y subtotal/impuesto/total. No utilizar cuentas de ingreso como cuentas de compra. |
| Condición de pago | Contado o Crédito; días y vencimiento del documento. Los valores del proveedor son defaults, sin modificar su perfil al ajustar una orden. |
| Medio de pago previsto | Transferencia, Cheque, Efectivo u Otro; referencia y observación. Un medio previsto no registra pago realizado. |
| Documento del proveedor | Referencia de cotización/factura, CAI de la factura y fecha; opcionales en solicitud/orden y validados al registrar la factura recibida. |
| Monedas | Moneda origen, moneda del documento y tipo de cambio para contabilización al registrar la compra. Conversión de precios explícita o equivalencia informativa; conservar importes originales. |
| Observación | Notas internas de solicitud y observación comercial de orden, separadas; solo la comercial aparece en PDF al proveedor. |
| Adjuntos | Cotización del proveedor y respaldos fiscales privados, con acceso por tenant/rol y límites de tipo/tamaño. |

**Nota de débito:** se presenta como documento de ajuste vinculado a la compra/factura original, reutilizando la lógica de Cuentas por Pagar. No aparece como forma de pago ni liquida por sí sola un saldo. Si el usuario se refiere a un débito bancario, se puede denominar así un medio previsto separado del documento de ajuste.

**CAI:** la orden utiliza correlativo interno, sin consumir el CAI fiscal de una Boleta de Compra. El CAI del proveedor es una referencia de su documento. Cualquier emisión fiscal posterior seguirá el flujo existente y se confirmará antes de reservar numeración.

## Estados y controles

- Solicitud: Borrador → Pendiente de aprobación → Aprobada/Rechazada; cancelación con motivo y reenvío después de corregir.
- Orden: Borrador → Aprobada → Parcialmente facturada/Facturada; cancelación solo del remanente sin factura asociada. Revisión de precios/proveedor/impuestos invalida aprobación anterior.
- El registro de factura desde orden copia los valores como propuesta editable con control de diferencias. Conserva el vínculo y cantidades/importes pendientes para no facturar dos veces el mismo remanente. Permite varias facturas contra una orden y contabiliza exclusivamente la factura recibida.
- La solicitud, orden, proveedor, oficina, cuentas y documentos vinculados pertenecen al mismo tenant. La UI no sustituye RLS ni validación de las RPC.
- Crear/aprobar/convertir/cancelar usan RPC atómicas, UUID de idempotencia, revisión optimista y auditoría de actor/motivo. Doble clic o reintento no duplica órdenes, facturas, pagos ni correlativos.
- Una orden aprobada congela proveedor, líneas, monedas, impuestos y condiciones. No se reescriben documentos emitidos, saldos ni snapshots históricos.
- En una primera versión, acceso solo de Admin/Contabilidad; permisos de solicitante/aprobador configurables y separación de autoaprobación pendientes de definición de negocio.

## Reutilización del ERP

| Necesidad | Implementación existente |
| --- | --- |
| Registrar la compra fiscal | `src/app/(protected)/accounting/purchases/page.tsx`, RPC `create_purchase_document` |
| Proveedores y cuentas | `SupplierExpenseAccountSelect`, `service-accounting.ts`, `useServiceAccounting` |
| Oficina emisora | `BillingOfficeSelect`, permisos existentes de oficinas |
| Cálculos y monedas | `invoiceLineAmounts`, `calculateInvoiceFiscal`, `convertMoney`, `tax.ts`; factorizar las opciones visuales de `InvoiceFiscalOptions` para compra sin reutilizar permisos de cliente |
| Deuda y ajustes | `src/lib/supplier-payables.ts`, `SupplierPayableDetail`, RPC actuales de Cuentas por Pagar |
| Pagos y referencia de cheque | `register_supplier_payment` / `treasury_register_source`; medios Transferencia, Cheque, Efectivo y Otro ya existentes |
| UI y documentos | `FinancePageHeader`, `AccountingNav`, `FormField`, `FormSection`, `CompactSelect`, `Dialog`, PDF comercial separado del PDF fiscal |

## Modelo propuesto

`purchase_requests` y `purchase_request_items`, `purchase_orders` y `purchase_order_items`, con tenant, versión, estados y snapshots; vínculo de orden/ítems a `purchase_documents`, sin replicar Cuentas por Pagar. Un enlace de cantidades facturadas por línea soportará recepciones/facturas parciales. Las referencias y adjuntos mantienen IDs privados; no se guardan URLs públicas de documentos sensibles.

## Entrega por etapas

1. Acordar roles de solicitud/aprobación, autoaprobación, uso de orden directa, y si se necesita recepción física además de factura parcial.
2. Primera versión: formulario, borradores, aprobación, PDF de orden, fiscalidad/monedas y auditoría. Sin pagos ni envíos de correo automáticos desde la orden.
3. Conversión controlada a factura recibida, saldos pendientes por línea y reutilización de pagos/ajustes existentes.
4. Validar aislamiento de tenant/rol, cambios concurrentes, reintentos, cuentas, conversiones, redondeos, rechazos/cancelaciones y flujos completos con usuario autenticado.

Los datos del proveedor y documentos reales no se incluyen en fixtures ni se trasladan a Trial/runners externos. Esta propuesta no crea tablas ni migra datos.

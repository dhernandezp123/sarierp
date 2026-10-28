# Revisión de formatos fiscales Sari Express — 27/10/2026

## Resultado

Se revisaron visualmente y se extrajo el texto de los cuatro PDF entregados:
Factura (8), Nota de crédito (37), Nota de débito (18) y Boleta de compras (1).
Todos usan tamaño Carta (612 × 792 puntos), una página y marca Sari Express.
No se copiaron los documentos originales ni sus datos comerciales al repositorio.

La propuesta mantiene el emisor Sari Express y unifica el diseño: logo existente,
rojo Sari `#B3282D`, texto carbón, fondos gris claro y líneas discretas.
Forwarders aparece en una atribución pequeña al pie: «Generado con Forwarders».
No se usa el logo, azul o naranja de la plataforma como identidad del emisor.

Se prepararon cuatro PDF locales de muestra, con fuente incrustada, logo Sari y
datos ficticios, identificados como propuesta sin validez fiscal. Las cuatro
muestras se renderizaron y caben en una página Carta. Se conservan en
`.ua/intermediate/sari-fiscal-format-review/`; no forman parte de un despliegue.

## Comparación por documento

| Documento | Elementos del formato actual que deben conservarse | Adaptación propuesta |
| --- | --- | --- |
| Factura | Emisor/RTN, establecimiento y casa matriz, contacto, número, emisión/vencimiento, cliente/RTN/dirección, cantidades/precios, exento/exonerado/gravados 15/18, ISV, descuentos, equivalencia, total literal, condición de pago, O/C y registros de exoneración, CAI/rango/vigencia, leyenda y ejemplares | Encabezado común; tabla compacta con tratamiento ISV visible; condiciones y observaciones a la izquierda y resumen monetario a la derecha; equivalencia inmediatamente antes del total HNL |
| Nota de crédito | Su propio CAI/rango/vigencia/correlativo, motivo, factura afectada, cliente, observaciones operativas, impuestos y equivalencia | Bloque «Documento afectado» con número, CAI y fecha del original; motivo separado de observaciones; sin confundir el CAI de la nota con el de la factura |
| Nota de débito | CAI/correlativo propios, factura de origen, CAI/fecha de esa factura, razón/observaciones, desglose de importes | Mismo diseño de NC con título inequívoco; mantener separados documento emitido y documento afectado; no presentar la nota como otra factura de venta |
| Boleta de compra | Proveedor y domicilio/identificación, información fiscal propia, concepto/cantidad/precio/descuentos/impuestos, total literal, firma y huella | Cliente se sustituye por proveedor; firma y huella amplias; columnas legibles y espacio adaptable al número de conceptos; cuenta contable queda interna |

## Hallazgos que afectan la conexión con el sistema

1. **Oficina y numeración.** Los ejemplos de SPS muestran prefijo `001-001`;
   la nota de débito de Tegucigalpa muestra `000-001`. Los códigos son valores de
   la autorización, no el orden de la oficina ni una secuencia inferida. Mantener
   la regla acordada de oficina asignada al cliente y la oficina del documento
   original en NC/ND. Confirmar rangos/correlativos con las autorizaciones al
   configurar; la revisión de un PDF no establece el siguiente número disponible.
2. **CAI independiente.** Los cuatro documentos llevan autorizaciones diferentes.
   Deben resolverse por oficina y tipo, conservarse en el documento emitido y
   mostrarse completos. No tomar el CAI de Factura para NC, ND o Boleta.
3. **Referencia fiscal completa.** La ND incluye número, CAI y fecha de la factura
   afectada. El modelo de `InvoicePdfData` actual solo recibe su número. Antes de
   integrar la plantilla propuesta, ampliar la lectura de la referencia y
   conservarla como dato histórico de la nota, sin usar el CAI de su propio rango.
4. **Descuentos.** Los PDF muestran descuentos y rebajas (cero en los ejemplos).
   Las nuevas plantillas deben conservar este campo. El motor actual no ofrece
   descuento explícito: para importes distintos de cero requiere cálculo y
   persistencia por línea, bases ISV y exportación. No convertir una etiqueta de
   cero en una función de descuento ni aplicar descuentos ficticios a históricos.
5. **Boleta sin identificación.** La muestra deja el RTN del proveedor vacío.
   El formulario nuevo ya pide RTN o identidad, domicilio y teléfono. Conservar
   esa información y la firma/huella; no trasladar el vacío del ejemplo como un
   valor predeterminado del sistema.
6. **Condición y método de pago.** La factura actual llama «Método de pago» al
   crédito. En la propuesta se muestran separados: condición contado/crédito,
   días y vencimiento, y método registrado cuando exista. Las facturas pendientes
   no deben inventar una transferencia o un efectivo todavía no registrados.
7. **Equivalencia.** El ejemplo muestra cuatro decimales en la equivalencia USD.
   La propuesta presenta moneda con dos decimales y tasa con cuatro; el valor
   calculado completo se conserva. La moneda de la cotización sigue independiente.
8. **Contacto e histórico.** El PDF utiliza el teléfono/correo/domicilio guardados
   para la oficina emisora. Cambiar la configuración no debe cambiar documentos
   ya emitidos. La casa matriz y el establecimiento se rotulan por separado.

## Diferencias detectadas antes de la conexión

- `invoice-pdf.tsx` usa A4 y no incluye logo en su encabezado actual. Duplica parte
  del emisor en otra caja y solo muestra campos de importes no nulos. La propuesta
  usa Carta, integra el logo y un resumen uniforme con conceptos fiscales visibles.
- Su referencia de NC/ND contiene número/motivo; faltan CAI y fecha del original.
- `purchase-fiscal-pdf.tsx` usa A4 y azul `#0038BD` en el encabezado. Debe adoptar la
  misma marca Sari y separar cantidad/precio en columnas, manteniendo el respaldo
  fiscal y la firma/huella existentes.
- La propuesta incluye fecha de impresión y paginación sin mezclar fechas ISO
  internas con el formato visible DD/MM/YYYY.

## Integración dentro del plan de seis etapas

Esta revisión corresponde a las etapas 1, 2 y 5, sin cambiar su alcance.
El usuario autorizó la conexión, commit y despliegue. Las plantillas de factura,
NC/ND y compra ahora reutilizan `FiscalDocumentLayout.tsx`: Carta, logo Sari,
rojo, encabezado/pie repetidos, fecha de impresión y paginación. Se conserva la
ficha histórica del emisor. El pie se valida dentro de los límites de la página.

La migración `20261027210000_fiscal_discounts_and_references.sql` conecta el
descuento de importe por línea antes del ISV; conserva precio unitario bruto,
descuento y neto. Funciona en factura manual, factura desde cotización sin
editar su tarifa/moneda, conversión, proforma a factura, compra y sus asientos.
La referencia de NC/ND guarda número, CAI y fecha de la factura afectada.
`20261027220000_positive_fiscal_total.sql` rechaza documentos cuyo descuento
dejaría un total sin importe contabilizable, con rollback del correlativo.

Validado localmente: render real Carta con 1/7/40 líneas y descripciones extensas,
logo/color, encabezado de SPS/TGU, NC/ND con ambos CAI y fecha de origen, texto del
pie dentro de la página y boleta con firma/huella. SQL/RLS valida descuentos,
bases e ISV, diario, proforma, compra, cotización y conservación de su moneda.
El formulario real tiene una prueba de envío de descuento y total neto con ISV.
Las muestras locales no consumen CAI ni crean asientos en Production.

Siguen pendientes los formatos de Constancia de Retención y Comprobante de
Entrega para el contraste visual específico de esos documentos.

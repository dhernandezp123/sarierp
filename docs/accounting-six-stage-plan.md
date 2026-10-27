# Facturación y Contabilidad — plan autorizado 27/10/2026

Alcance: los 21 puntos revisados con el usuario, en seis etapas y en este orden.
No incluye apertura contable, saldos iniciales ni migración de movimientos de
Zafra. El usuario autorizó conectar las plantillas, hacer commit y desplegar
este alcance el 27/10/2026; la aplicación remota se registra en el informe de release.

## Decisiones confirmadas

- La oficina asignada al cliente determina la factura, sin selección libre de otra oficina.
- NC/ND conservan oficina y referencia de su documento original.
- Facturas emitidas conservan sus datos históricos y no se recalculan por configuración.
- Equivalencia y conversión se implementan en Forwarders/Sari.
- Cuentas contables: alta manual e importación validada. Apertura sin fecha definida.
- No se incorporan librerías nuevas sin aprobación.
- Los formatos fiscales adicionales se contrastarán con los PDF que proporcionará el usuario.

## Etapas y criterio de salida

1. **Implementada y probada localmente — Configuración fiscal, oficinas y documentos.** Fichas estables,
   asignación de cliente, contacto/domicilio, autorizaciones, snapshots y control
   de numeración. Pruebas de aislamiento, oficina incorrecta, vigencia, agotamiento
   y conservación histórica.
2. **Implementada y probada localmente — Impuestos, monedas y proforma.** Tratamiento por línea,
   exoneración documentada sin ISV, moneda de cotización intacta, conversión
   explícita y equivalencia informativa; conversión de proforma sin doble cobro.
3. **Implementada y probada localmente — Cobranza y estados de cuenta.** Un recibo para múltiples
   documentos, asignaciones parciales, anticipos, reversos y movimiento histórico
   por cliente/fechas/tipo/moneda, conciliado con saldo inicial y final.
4. **Implementada y probada localmente — Catálogo y motor contable.** Cuentas, importación validada,
   partidas manuales/automáticas balanceadas e idempotentes, reversos, períodos,
   autorización y vínculos de documentos. Sin saldos iniciales.
5. **Implementación local; formatos finales pendientes — Compras, documentos adicionales y libros.** Cuentas por línea,
   boletas/retenciones, diario consolidado, mayor por cuenta, balances y PDF/Excel.
   La clasificación de Comprobante de Entrega depende del formato real.
6. **Implementada y probada localmente — Activos y depreciaciones.** Alta, valores/fechas/vida útil,
   cálculo mensual, contabilización única, bajas y separación contable/fiscal.
   Las tasas fiscales se configuran con respaldo aprobado por Contabilidad.

## Validación

Cada etapa debe validar TypeScript, regresiones pertinentes, lint/build y SQL/RLS
en base aislada. Registrar resultados reales y pendientes en HARDENING.md.
No equiparar mocks o compilación con aceptación de navegador ni ejecución remota.
No ejecutar pruebas que emitan documentos fiscales reales.

## Resultado local y límites de aceptación

- Suite Node final: 436/436, incluyendo render real de boleta/retención multipágina,
  encabezado histórico, total en letras y estructura OOXML de Excel.
- TypeScript final y build Next.js 16.2.6 pasan; lint sin regresiones respecto
  al baseline (223 diagnósticos históricos). Sin cambios publicados.
- Suite SQL: 24 archivos pasan en una segunda copia Docker sin red, después de
  aplicar las migraciones canónicas. Incluye RLS, emisión/anulación, proforma
  pagada/exonerada con remanente, diferencias de cambio y redondeo de cuotas.
- Dos sesiones SQL simultáneas: reintento de recibo genera un solo cobro; dos
  aplicaciones que superan el saldo permiten una y rechazan la otra, con diario
  balanceado. No certifica todas las combinaciones de concurrencia.
- No se ha aplicado SQL remoto ni publicado frontend. No hay apertura, fecha
  inicial, catálogo inventado ni activación automática de la contabilidad.
- UAT pendiente con Contabilidad: configurar SPS/TGU y clientes; emitir factura
  mixta y exonerada; convertir proforma pagada; aplicar recibo a factura/ND;
  comparar estado de cuenta con mayor; registrar compra, retención y activo;
  revisar PDF/Excel en navegador. Compilación y pruebas no sustituyen esta UAT.
- El diario incluye movimientos desde el inicio configurado. La reconstrucción
  del estado de cuenta identifica datos previos disponibles; no reconstruye
  anulaciones históricas que el sistema nunca guardó ni crea asientos de apertura.
- Activos: línea recta por meses completos; alta vinculada a una adquisición
  contable existente. Baja sin venta implementada. No se incorporaron revaluación,
  deterioro, venta de activos ni tasas fiscales automáticas.
- Recibidos y revisados cuatro PDF: Factura, NC, ND y Boleta de Compra. Propuestas
  Carta con logo/rojo Sari y datos ficticios preparadas; ver
  `docs/sari-fiscal-format-review.md`. Integradas en el renderer compartido del
  sistema con referencias fiscales congeladas y descuentos por línea conectados
  a creación, proforma, compra, ISV y asientos. Faltan los PDF
  de Retención y Comprobante de Entrega para su contraste visual.
  Comprobante de Entrega sigue pendiente de clasificación; no se presume que sea
  Guía de Remisión. Puede configurarse autorización CAI de Guía de Remisión,
  pero no se presenta como un flujo terminado de Comprobante de Entrega.

## Referencias fiscales contrastadas

[Reglamento consolidado publicado por SAR](https://www.sar.gob.hn/download/texto-consolidado-reglamento-del-regimen-de-facturacion-otros-documentos-fiscales-y-registro-fiscal-de-imprentas-contenido-en-el-acuerdo-481-2017-segun-acuerdos-609-2017-725-2018-y-817-2018/), consultado 27/10/2026:
arts. 10–11 (datos de factura), 20–22 (boleta, identificación/domicilio, total
literal y prohibición de crédito ISV), 33–35 (retenciones y documento de origen).
Se usan códigos de la reforma 609-2017: retención 05, boleta 11, NC 06, ND 07,
remisión 08. Los límites de deducibilidad de boletas y la procedencia de cada
retención requieren el criterio de Contabilidad; el sistema no presume que un
gasto registrado sea deducible ni presenta declaraciones al SAR.

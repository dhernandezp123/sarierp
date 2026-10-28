# Plan aprobado: auxiliares, cartera, Caja/Bancos y conciliación

Fecha: 28/10/2026. El usuario autorizó comenzar los ajustes del plan después de
confirmar las reglas de antigüedad, Excel por bloques y firmas físicas. Las seis
etapas se conservan; su implementación local y la publicación remota se registran
por separado. La evidencia inicial de abajo corresponde a la revisión previa.

## Seguimiento de ejecución

| Etapa | Implementación local | Aceptación pendiente |
| --- | --- | --- |
| 1. Motor a corte | Historial inmutable, cobertura explícita, clientes/proveedores, NC/ND/pagos/reversos | Aplicar migración en cada ambiente y UAT |
| 2. Cuentas por cobrar | Cliente/todos, pendientes/vencidos/pagados, fechas, antigüedad, PDF/XLSX/CSV y bloques en una hoja | Abrir Excel y revisar casos con Contabilidad |
| 3. Proveedores | Documentos y estado histórico; pagos y retenciones separados | UAT de proveedor con NC/ND y retención |
| 4. Caja/Bancos | Cuentas, apertura fechada, tasas compra/venta, cobros/pagos, transferencias, flujo y asientos/reversos | Saldos/cuentas/fecha reales, revisados por Contabilidad |
| 5. Conciliación | Extracto manual/CSV/XLSX con vista previa, vínculos parciales/grupales, pendientes iniciales, versiones y firmas físicas | Extractos bancarios representativos y prueba de firma/impresión |
| 6. Validación y ambientes | SQL/RLS, pruebas Node, TypeScript/lint/build y preparación equivalente de Prueba aprobados localmente | UAT autenticado, commit y publicación coordinada |

No se crean bancos, saldos o usuarios reales ni se activa contabilidad automática
con estas migraciones. Una cuenta contable bancaria con movimientos anteriores
se bloquea para evitar repetir su apertura; requiere revisar esa migración de
saldos por separado. Los cortes anteriores a la cobertura reconstruida también
se rechazan, en lugar de certificar un historial que no existe.

## Evidencia revisada

- Rama main limpia, commit `56f3d397bf50551a3767f04f123995befdebd5a4`; Vercel informa despliegue exitoso.
- Consulta de solo lectura a Producción: 148 migraciones, última `20261028100000`.
- Código de reportes, estado consolidado, cartera, proveedores, libros, pagos y exportación.
- Archivo del usuario `01. Conciliacion Bancaria.xlsx`: tres hojas (BAC HNL,
  Ficohsa HNL, Ficohsa USD), textos, fórmulas, áreas de impresión y estructura.
  Se leyó el paquete OOXML sin ejecutar Excel, fórmulas, vínculos ni macros.
- No hay tablas de bancos/cuentas bancarias/conciliación bancaria. La tabla
  `email_delivery_reconciliations` corresponde a correo, no a bancos.
- Producción no tiene cuentas contables, mapeos, configuración contable ni asientos
  cargados. Los documentos operativos/financieros consultados están vacíos; esto
  permite verificar estructura y código, no certificar UAT con movimientos reales.

## Brechas comprobadas

| Área | Existe | Falta o debe corregirse |
|---|---|---|
| Reporte general CxC | Cliente/todos, estado, fechas, moneda, CSV/PDF | Elimina saldo cero antes de filtrar: no muestra pagadas. No tiene XLSX ni resumen por tramos. Los saldos son actuales y el filtro fecha usa vencimiento/emisión. |
| Estado consolidado del cliente | Cliente buscable, período, moneda, tipos de movimiento, saldo inicial/corrido/final, PDF/XLSX | General para todos, columnas de cartera y aging, filtro de estado y CSV. El filtro de tipo actual solo oculta detalle: conserva todos los movimientos en el saldo. |
| Proveedores | CxP, NC/ND, pagos/reversos, retenciones, saldos actuales y reportes CSV/PDF | Auxiliar histórico por proveedor, saldo inicial, movimiento y saldo a corte, XLSX. |
| Libros | Catálogo/manual/CSV, asientos y libros HNL con PDF/XLSX | Configurar cuentas/apertura y detalle bancario por cuenta/moneda. El mapeo actual es `cash`, una cuenta genérica. |
| Exportador XLSX | Celdas numéricas/texto seguras, una hoja | Bloques por cliente en esa misma hoja, estilos monetarios/fechas, subtotales, filtros y formato de impresión. |
| Caja/Bancos | Cobros y pagos de origen | Cuentas bancarias, movimientos, aperturas, transferencias, extractos, conciliación y cierre. |

## Decisiones confirmadas por el usuario

1. Aclaración final del usuario: el resumen segmenta los saldos por vencimiento.
   Reemplaza para ese resumen la selección previa de antigüedad desde emisión.
   «Saldo actual» es el saldo pendiente aún no vencido a la fecha de corte.
   Las columnas 1–30/31–60/61–90/+90 representan días efectivos de mora desde
   vencimiento; ninguna factura no vencida se incluye en esas columnas.
   Total = Actual + mora 1–30 + mora 31–60 + mora 61–90 + mora de más de 90.
   Se suman importes pendientes, netos de pagos y ajustes, no cantidades de días.
2. Excel separado: una sola hoja con bloques separados por cliente, encabezado
   de cada cliente, detalle, subtotal del cliente y total general por moneda.
   También se conserva la opción de listado general continuo.
3. Conciliación: únicamente nombres, cargos y líneas de firma por ahora.
   No desarrollar estados, permisos ni acciones de aprobación electrónica bancaria.
4. Fecha de apertura y saldos reales se definirán con Contabilidad. No se inventan
   fechas de inicio ni se activa automáticamente la contabilidad.

Presentación: «Actual» identifica saldo no vencido; mes actual/anterior sirve como
referencia de negocio. Los límites técnicos de los tramos son días de mora, no
meses calendario completos. Una factura del mes actual ya vencida pasa al tramo
de mora correspondiente; una factura antigua aún no vencida sigue en Actual.
El día del vencimiento es Actual (0 días de mora); el día siguiente inicia 1–30.

## Etapa 1 — Reglas financieras y motor de corte

- Compartir una única consulta/cálculo entre pantalla, PDF, Excel y CSV.
- Fecha de corte para saldo/estado/antigüedad. Separar de filtro opcional por
  creación, emisión o vencimiento, que acota documentos. Una cartera al cierre
  incluye también deuda anterior al inicio del rango; si se acota, rotular subtotal.
- Los pagos, aplicaciones, NC/ND, anulaciones y reversos posteriores al corte no
  cambian un cierre anterior. Distinguir fecha del recibo, fecha de aplicación a
  factura, fecha contable y fecha valor bancaria. Revisar trazabilidad histórica;
  identificar reconstrucciones incompletas en lugar de inventar movimientos.
- Pendiente: saldo > 0, incluye parciales; vencido: saldo > 0 y vencimiento antes
  del corte; pagado/saldado: saldo cero con motivo visible si fue por NC.
- Para distribuir el resumen usar días vencidos = máximo de cero y corte −
  vencimiento, cuando exista saldo pendiente. Fecha de emisión sigue disponible
  en el detalle/filtros; no define las bandas de mora del resumen.
- Identificar cliente/proveedor por ID, no solo por nombre. Separar HNL/USD.
- ND desglosadas no se suman otra vez como ajuste de su factura padre. NC siguen
  reduciendo saldo aunque no se impriman sus filas. Separar anticipos no aplicados.
- Catálogo, períodos y cuentas existentes se reutilizan. Preparar la configuración
  necesaria para bancos sin bloquear las mejoras de CxC/CxP mientras se aprueban
  los saldos iniciales y la activación contable.

Aceptación: cortes históricos reproducibles y conciliación de detalle/resumen.

## Etapa 2 — Cuentas por cobrar y exportaciones

Filtros: cliente/todos con búsqueda, estado, moneda, fecha de corte, rango y campo
de fecha, Facturas/Notas de Débito. Encabezado exportado muestra todos los filtros.

Tres presentaciones:

1. Detalle general: todos los clientes y sus documentos, con subtotal por cliente.
2. Detalle por cliente: Documento, Fecha de creación, Fecha de emisión disponible,
   Fecha de vencimiento, Días vencidos, Estado, Total, Pagado y Por pagar.
   Desglosar NC/ND y total ajustado para explicar la relación de importes.
3. Resumen de antigüedad por vencimiento: Cliente, Actual/no vencido, Mora 1–30,
   Mora 31–60, Mora 61–90, Mora +90 y Total. Cada saldo ocupa una única banda y
   Total suma Actual y todas las bandas de mora, con total general por moneda.

- PDF/XLSX/CSV en las vistas general e individual. El Excel separado contendrá
  bloques por cliente dentro de una sola hoja; CSV será tabla plana con Cliente.
- Excel con montos numéricos, formatos de fecha/moneda, encabezados por cliente,
  subtotales de cada bloque y totales generales. Reutilizar/ampliar el generador,
  sin incorporar exportación por hojas individuales ni una librería nueva.
- Exportar todos los resultados filtrados, no solo la página visible.
- Al filtrar tipos, mostrar subtotal de documentos seleccionados y conservar la
  deuda real íntegra en la contabilidad; nunca borrar ND/NC por un filtro visual.
- Unificar los accesos de Reportes/Facturación/Contabilidad para que no haya tres
  versiones incompatibles del mismo cálculo.

Aceptación: general = suma de clientes; resumen = suma de documentos; un cliente
con factura de 1,000, NC de 200 y pago de 300 conserva saldo 500, sin llamar 500
al efectivo recibido ni duplicar las notas.

## Etapa 3 — Estado de cuenta de proveedores

- Buscador de proveedor/todos, moneda, corte, fechas, estado y tipo documental.
- Saldo inicial anterior al rango, facturas/boletas de compra, NC/ND, pagos,
  retenciones, anulaciones/reversos y saldo corrido/final.
- Documento/referencia, emisión/vencimiento, importe, ajustes, abonado, saldo y
  días vencidos; PDF/XLSX/CSV individual/general.
- Reutilizar la CxP canónica y construir su historial a corte. Las retenciones
  liquidan obligación sin convertirse automáticamente en salida de banco.
- Mantener alertas de datos inconsistentes/sobrepagos; una cifra desconocida no
  se sustituye por cero.

Aceptación: total proveedor coincide con CxP y movimientos/asientos correspondientes.

## Etapa 4 — Caja/Bancos, aperturas y flujo de efectivo

Nueva navegación: Contabilidad → Caja/Bancos → Cuentas, Movimientos, Saldos,
Flujo de caja y Conciliaciones. Reutilizar tema/combobox/filtros/componentes actuales.

- Bancos y cajas separados. Cuenta: banco, número como texto, alias, moneda,
  titular/empresa, cuenta contable asociada y estado activo.
- Apertura por cuenta con fecha, saldo de libros y saldo bancario cuando difieran;
  recoger también cheques pendientes y depósitos en tránsito del corte inicial.
  Validar/asentar contra apertura aprobada sin duplicar saldos ya cargados.
- El saldo inicial se registra una vez. Desde/hasta deriva apertura y movimientos;
  el cierre de un día se arrastra al siguiente. Cambios posteriores mediante
  ajustes auditados, sin editar silenciosamente la apertura.
- Movimientos: cobros, anticipos, pagos a proveedores, depósitos, retiros,
  transferencias propias, cargos/intereses y ajustes. Referencia, fechas de
  operación/valor, importe original, moneda, cuentas, origen, responsable y estado.
- Agregar cuenta bancaria/caja a los flujos existentes de cobro/pago y sus RPC
  atómicas. Un recibo aplicado a varias facturas genera una sola entrada de dinero.
  Aplicar anticipo no genera nuevo cobro. Una transferencia entre cuentas registra
  ambas piernas y se elimina del flujo externo consolidado.
- Cheque emitido ya rebaja libros al contabilizarlo; su cobro bancario posterior
  solo concilia. Depósito en tránsito no se registra dos veces como entrada.
- Registrar tasas de compra/venta por fecha, moneda y fuente; guardar la tasa
  efectiva aplicada a cada operación. Una cuenta USD conserva saldo USD y
  equivalencia HNL explícita. Cambios de tasa no alteran cotizaciones ni facturas.
- Reportes: saldo inicial + entradas − salidas = saldo final por cuenta, diario y
  acumulado a fecha, equivalencia HNL opcional. Distinguir saldo operativo, saldo
  contable y saldo confirmado en extracto; no hay conexión bancaria automática.
- Flujo de caja por entradas/salidas reales, clasificación operación/inversión/
  financiamiento y trazabilidad a documentos. Factura impaga, NC y depreciación
  no crean caja. Proyección de cobros/pagos, si se añade después, se rotula prevista.
- Si automática sigue apagada, mostrar pendientes de contabilizar. La sección
  «libros contables» usa únicamente asientos contabilizados; no sustituirla por
  una suma operativa ni aprobar conciliación contable incompleta.

Aceptación: saldos diarios arrastran correctamente, total conciliable con mayor por
cuenta, pagos/reintentos/transferencias no duplican dinero y monedas no se mezclan.

## Etapa 5 — Conciliación bancaria según el Excel

Una conciliación por empresa, banco, cuenta, moneda y período. Captura de saldo
final/extracto manual y carga CSV/XLSX con previsualización y mapeo de columnas;
los formatos bancarios específicos se ajustan con extractos de ejemplo posteriores.
Importar extracto no contabiliza nuevamente los movimientos que ya existen.

Diseño del reporte:

1. Logo, razón social/encabezado y colores Sari vigentes en sistema; banco, número
   de cuenta, moneda, rango de fechas, corte y tasas utilizadas.
2. Valores en libros: saldo inicial, débitos, créditos, saldo final de libros.
   Se calculan desde la cuenta contable asociada; en banco activo, débito aumenta
   y crédito reduce, indicando perspectiva de libros frente a la del extracto.
3. Extracto: saldo final bancario y diferencia inicial claramente rotulada.
4. (-) Cheques emitidos pendientes: fecha, referencia, descripción, valor y total.
5. (+) Depósitos en tránsito: mismas columnas y total.
6. Saldo de banco conciliado = saldo extracto − cheques pendientes + depósitos
   en tránsito. Diferencia final = saldo conciliado − saldo de libros ajustado.
7. Elaborado por y revisado por, nombres/cargos y líneas de firma de Contabilidad
   y Gerencia General; fecha de elaboración y versión del documento. Elegir un
   nombre para la línea de revisión no se registra como revisión efectuada.

- Agregar tantas filas/páginas como se necesiten, no limitar a tres como plantilla.
- Corregir «31 de junio», rótulo del total de depósitos y cargo del revisor
  inconsistente entre hojas. Nombres/períodos/cuentas se toman de datos validados.
- Comisiones/intereses no contabilizados se resuelven mediante el flujo contable
  existente; la conciliación por sí sola no crea movimientos ficticios para cuadrar.
- Emparejar extracto/libros con sugerencias y confirmación, admitir parciales o
  grupos cuando proceda y prevenir emparejamientos/archivos duplicados.
- Arrastrar partidas pendientes entre períodos, pudiendo liquidar un cheque antiguo
  sin alterar el cierre anterior. Resolver errores de banco/libros por separado.
- Conservar borrador/versión emitida e historial de elaboración; imprimir nombres,
  cargos y líneas para firma externa. Sin cola de revisión, aprobación electrónica,
  rechazo ni permisos individuales de aprobación de conciliaciones.
- Las diferencias permanecen visibles como conciliada/con diferencia según el
  cálculo; imprimir un documento no implica que Gerencia lo haya aprobado.
- Reutilizar permisos operativos financieros existentes. Los nombres del Excel
  y la condición de master de facturación no conceden nuevos poderes bancarios.
- PDF listo para firma y Excel por cuenta; resumen general de conciliaciones con
  banco/cuenta/moneda/corte/saldos/diferencia/estado.

Aceptación: fórmula igual a plantilla corregida, diferencias explicadas y ningún
doble asiento por el acto de conciliar.

## Etapa 6 — Validación, preparación operativa y ambos ambientes

- Casos de mora desde vencimiento 0, 1, 30, 31, 60, 61, 90 y 91 días. Factura
  emitida hace tiempo aún no vencida: Actual; factura emitida este mes ya vencida:
  mora correspondiente. Parciales, NC/ND, anulación/reverso posterior al corte,
  anticipo y aplicación posterior. Actual + todas las bandas = Total.
- Fecha histórica conserva saldo aunque posteriormente se pague o revierta.
- Proveedor con retención y pago neto; saldo coincide y banco refleja solo efectivo.
- Recibo distribuido, transferencias propias, cheque pendiente/cobrado, depósito
  en tránsito, cargos bancarios y carga de extracto repetida.
- Aperturas, cambio de día, cuentas HNL/USD, diferencias de cambio y redondeo.
- Períodos cerrados, permisos/empresa, historial de versiones y archivo privado.
- Excel de una sola hoja: cada bloque/subtotal corresponde a un cliente y su
  moneda, y todos los bloques concilian con la lista general.
- Firmas impresas: nombres/cargos editables según permisos existentes, sin simular
  aprobación ni registrar una revisión interna que no se realizó.
- Igualdad de resultados en pantalla/PDF/XLSX/CSV y exportación completa con
  paginación; Excel abre sin advertencias y conserva valores numéricos/formato.
- UAT de Contabilidad/Gerencia con casos ficticios en Prueba. Publicación de
  migraciones antes del frontend y actualización coordinada de Producción/Prueba,
  con control de paridad existente. No copiar información bancaria real a Demo.

## Fuentes de implementación y referencias

- `src/app/(protected)/reports/page.tsx`, `src/lib/report-view.ts`.
- `src/app/(protected)/invoicing/statements/page.tsx`, `src/lib/customer-statement.ts`.
- `src/lib/supplier-payables.ts`, páginas suppliers/accounts-payable.
- `src/lib/accounting.ts`, `src/lib/accounting-books.ts`, AccountingNav/settings.
- `FinancialReportExport.tsx`, `src/lib/xlsx.ts`, plantilla de ReportPdf/branding.
- Migraciones canónicas 20261027120000/130000/140000/150000/190000/200000 y
  sus reemplazos posteriores; comprobar funciones vigentes antes de programar.
- BCH, publicación de tipo de cambio compra/venta:
  https://www.bch.hn/estadisticos/GIE/Paginas/Tipo-de-Cambio.aspx
- IFRS Foundation, IAS 7 (clasificación y conciliación del flujo de efectivo):
  https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/

El archivo Excel se conserva como referencia de formato. Cargar bancos, saldos o
movimientos reales requerirá un proceso de captura/importación validado aparte.

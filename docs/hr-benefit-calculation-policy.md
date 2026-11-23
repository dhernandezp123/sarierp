# Cálculo automático de vacaciones y liquidaciones

Versión `HN-GENERAL-2026-1`, 23/11/2026. Pantalla: **RRHH → Calcular prestaciones** (`/rrhh/calculos`). Administración captura evidencia salarial; el servidor calcula los importes y genera una nómina revisable. La captura de evidencia no exige calcular manualmente el resultado.

## Alcance y datos necesarios

Régimen general hondureño de trabajadores permanentes por unidad de tiempo, en comercio/servicios. Deben confirmarse contrato, causal, tamaño real de empresa, exclusiones del artículo 120, protecciones especiales y todos los pagos anteriores. No se infiere la clasificación empresarial del número de fichas del ERP. Aprendizaje/practicantes, regímenes especiales, destajo y situaciones protegidas requieren revisión específica.

Se necesita ficha con fecha de ingreso, condiciones salariales vigentes, moneda y conceptos de ingreso con cuentas. Se permiten HNL/USD, fijo/variable/mixto cuando existe historial efectivo; no se extrapola el último fijo a períodos desconocidos. El corte no puede ser futuro. No se precargan datos salariales de Sari ni tasas fiscales.

La evidencia cubre exactamente cada ventana, sin huecos ni solapamientos: ordinario en dinero, especie, extraordinario, días efectivamente trabajados y referencia de planilla/soporte. Se comparten filas mensuales idénticas entre bases. Si una ventana comienza a mitad de mes, su evidencia parcial se registra separadamente. Los décimos pagados no se vuelven a incluir como ordinario en estas filas.

## Bases y fórmulas

- Ventana promedio: seis meses hasta el último día incluido del corte, limitada por ingreso. Base diaria de vacaciones: `(ordinario dinero + especie) × 14/12 / días efectivamente trabajados`. Base diaria de indemnizaciones: `((ordinario dinero + especie) × 14/12 + extraordinario) / días efectivos`. La integración de ambos décimos se realiza una sola vez. Se conserva precisión y se redondea cada prestación final a centavos.
- Vacaciones aprobadas: días laborales congelados de la solicitud × base diaria de vacaciones. Corte anterior al inicio, dentro de los 31 días previos. Fecha de pago al menos tres días antes del inicio. El pago no vuelve a consumir días del ledger.
- Vacaciones al terminar: saldos positivos de períodos adquiridos, más proporción del período actual si la terminación es imputable al patrono o se confirma expresamente una política más favorable. Se respeta escala 10/12/15/20 y mínimo individual vigente; se incorporan ajustes y vacaciones ya aprobadas. Deben resolverse solicitudes pendientes y ausencias aprobadas posteriores al corte. Un anticipo superior a lo devengado se informa sin descontarlo de otros derechos.
- Tiempo comercial: `age(corte + 1, ingreso)` con años de 360 y meses de 30 días; incluye el último día, conserva la convención de aniversario PostgreSQL y limita el resto de días a 30. Los aniversarios de vacaciones conservan el criterio del ledger existente. En ingresos bisiestos puede existir un día adicional respecto del aniversario ajustado; el detalle muestra días comerciales y bases para revisión.
- Preaviso para contrato indefinido y causal patronal: 1 día antes de tres meses; 7 desde tres hasta seis meses; 14 después de seis y hasta un año; 30 después de un año y hasta dos; 60 después de dos. Se resta únicamente el aviso efectivamente cumplido y confirmado. El límite compartido de seis meses se asigna al tramo de siete días. No se deduce automáticamente preaviso de una renuncia.
- Cesantía: cero antes de tres meses; 10 días desde tres hasta seis; 20 después de seis y antes de un año; desde un año, un mes por año y proporción. Tope general 25 meses; microempresa de hasta diez empleados remunerados, 15 meses. Se pagan los días resultantes por base diaria de indemnizaciones. Renuncia desde quince años: 35%; fallecimiento natural después de seis meses: 75%, excepto microempresa. La exclusión confirmada del artículo 120 elimina cesantía, sin borrar derechos adquiridos ni preaviso procedente.
- Plazo fijo/obra, terminación patronal antes del fin confirmado: salario fijo integrado del plazo restante, limitado a la indemnización equivalente del contrato indefinido. Sin plazo comprobado, con variable/mixto o cambios salariales futuros se bloquea para revisión específica; no se adivina un importe.
- Décimo tercero proporcional: ordinario y especie efectivamente devengados desde enero o ingreso hasta corte, dividido por 12. Décimo cuarto: igual desde el 1 de julio del ciclo vigente. Se excluye extraordinario. Las fórmulas corresponden a unidad de tiempo; la captura de la remuneración real incorpora la proporción del servicio. No se usa una calculadora externa para procesar datos personales.

## Pagos previos y controles

Los pagos externos se registran con referencia, fecha, soporte, moneda, concepto y período; vacaciones pagadas se vinculan también a la solicitud. Se descuentan únicamente de su componente y período. Un exceso deja pendiente cero y se informa, sin compensarlo contra otros conceptos. Otra moneda exige conciliación/documentación de conversión. La anulación conserva el registro; si está aplicado a una nómina vigente primero debe anularse/revertirse esa nómina. Registrar/anular no mueve dinero.

El servidor recalcula antes de crear, aprobar y contabilizar. Cambios en ficha, condiciones, saldos o pagos previos invalidan la huella y bloquean el flujo; se anula el borrador y se genera otro. La nómina y su detalle se guardan atómicamente e idempotentemente. No se permite una segunda liquidación activa del mismo empleado. Varios componentes pueden mapearse al mismo ingreso: se consolidan y conservan las fórmulas en el detalle.

La nómina requiere revisión, aprobación y contabilización habituales. No se modifica la fecha de terminación ni se ejecutan transferencias. Salarios pendientes, IHSS, RAP, ISR y deducciones continúan con su revisión separada; este flujo calcula ingresos y evita descuentos automáticos sobre prestaciones. El PDF privado conserva bases, fórmula, créditos, versión y huella. El empleado solo accede al cálculo propio aprobado/contabilizado, desde Mis comprobantes; Administración conserva el historial. El PDF no demuestra firma ni pago.

## Fuentes primarias y jerarquía

- [Código del Trabajo, TSC](https://www.tsc.gob.hn/web/leyes/Codigo_de_Trabajo.pdf), artículos 116, 118, 120, 120-A, 121, 123, 345, 346, 348, 349 y 352.
- [Guía de cálculo, SETRASS](https://www.trabajo.gob.hn/wp-content/uploads/2017/11/guiacalculo.pdf): integración y bases. Su antiguo tope de 15 meses no sustituye los topes del Código actualizado.
- [Ley del séptimo día y décimo tercer mes, SETRASS](https://www.trabajo.gob.hn/wp-content/uploads/2016/07/Decreto-112-Ley-del-S%C3%83%C2%A9ptimo-d%C3%83%C2%ADa-y-D%C3%83%C2%A9cimo-Tercer-Mes-en-concepto-de-Aguinaldo.pdf), artículos 3, 10, 12 y 13.
- [Reglamento del décimo cuarto mes, TSC](https://www.tsc.gob.hn/web/leyes/Reglamento_del_Decimo_Cuarto_Mes_de_Salario.pdf), artículos 2, 3, 5 a 10; revisadas sus cuatro páginas escaneadas.
- [Decreto 117-2021, TSC](https://tsc.gob.hn/web/leyes/Decreto-117-2021.pdf), artículo 2 sobre integración del décimo tercero.

## Activación

Aplicar `20261123120000_hr_automatic_benefits.sql` después de HR-08, desplegar el código y conciliar el primer caso real con el responsable de nómina. Las pruebas locales usan personas y salarios sintéticos. La migración y las pruebas no cargan salarios, cuentas ni políticas reales de Sari. No declarar activado en Producción hasta aplicar SQL y verificar accesos y un caso autorizado en el ambiente destino.

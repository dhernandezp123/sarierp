# Nómina y liquidaciones: política inicial y activación

Fecha: 20/11/2026. Sari confirmó que necesita moneda/frecuencia configurables, salario fijo y variable, conceptos, deducciones, vacaciones, liquidaciones y cuentas contables. No dispone todavía de una política interna documentada. Este documento registra el alcance implementado y los datos que Administración debe completar; no certifica importes legales individuales.

## Condiciones por empleado

- HNL o USD; cada nómina agrupa una sola moneda. Frecuencia semanal, catorcenal, quincenal o mensual, elegida por empleado.
- Salario fijo, variable o mixto. El fijo se registra como equivalente mensual y el cálculo contractual disponible es `mensual / 30 × días pagables confirmados`. El variable puro registra fijo cero y conceptos de ingreso revisados. No se infieren horas, comisiones ni días pagables a partir del calendario de ausencias.
- Cada vigencia conserva moneda, modalidad, frecuencia, salario y referencia del contrato. No se sobrescriben vigencias ni se cambia retroactivamente una nómina existente. Un cambio dentro del período obliga a dividirlo.
- No se precargan salarios desde perfiles ni se activan condiciones por el solo hecho de que exista un usuario. Los roles Contabilidad y Ventas no tienen acceso general a salarios; Administración prepara y aprueba. El empleado vinculado consulta únicamente sus comprobantes aprobados.

## Conceptos y revisión obligatoria

Administración registra conceptos de ingreso, deducción y aporte patronal con cuentas contables propias, activas e imputables. `SALARIO_BASE` es el ingreso del fijo contractual. Los aportes patronales incrementan el gasto y la obligación de la empresa, sin disminuir el neto del trabajador.

Los importes de IHSS, RAP, ISR, horas extra, bonos, anticipos y prestaciones se capturan **revisados**, con referencia y cálculo por concepto. Un cero explícito admite una exclusión justificada; la ausencia de un concepto no se presenta como una exención automática. Antes de guardar se exige confirmar la revisión de obligaciones, vigencias, pagos anteriores y vacaciones. La primera versión no calcula automáticamente las tablas legales ni determina por sí sola la causal o procedencia de una prestación.

Fuentes oficiales consultadas para preparar esa revisión:

- [Código del Trabajo, TSC](https://www.tsc.gob.hn/web/leyes/Codigo_de_Trabajo.pdf): artículos 116–123 (preaviso, cesantía, causales y excepciones); artículos 348–355 (vacaciones). La base de las prestaciones y vacaciones requiere revisar remuneraciones y días efectivamente trabajados; no debe sustituirse indiscriminadamente por el último salario fijo.
- [Acuerdo SAR-01-2026, tabla ISR 2026](https://www.tsc.gob.hn/web/leyes/Acuerdo-SAR-01-2026.pdf): la tabla anual no basta por sí sola para decidir retenciones, deducciones o exclusiones de una persona. El sistema no la aplica a ejercicios posteriores.
- [Portal oficial de transparencia del IHSS](https://portalunico.iaip.gob.hn/356/83/): publicaciones de tasas y techos de 2026. Falta incorporar a la configuración operativa los documentos y valores que Contabilidad valide para Sari; no se usaron calculadoras de terceros para precargar tasas.
- [Reglamento del décimo cuarto mes, TSC](https://www.tsc.gob.hn/web/leyes/Reglamento_del_Decimo_Cuarto_Mes_de_Salario.pdf) y [Ley del séptimo día y décimo tercer mes, SETRASS](https://www.trabajo.gob.hn/wp-content/uploads/2016/07/Decreto-112-Ley-del-S%C3%83%C2%A9ptimo-d%C3%83%C2%ADa-y-D%C3%83%C2%A9cimo-Tercer-Mes-en-concepto-de-Aguinaldo.pdf): verificar período devengado, base, proporción y pagos previos antes de registrar el importe.

No se considera cerrada la configuración laboral/fiscal de Sari hasta contar con contratos, afiliaciones, tasas vigentes y criterios revisados por su responsable de nómina. Tampoco se declara implementado un motor automático de cumplimiento legal.

## Vacaciones y liquidación

El pago de vacaciones se vincula a una solicitud aprobada del mismo empleado y con las mismas fechas; se exige fecha de pago al menos tres días antes del inicio. Si la aprobación cambia antes de aprobar la nómina, se bloquea ese borrador. Si cambia después de contabilizar, Administración debe conciliar el pago y registrar la corrección correspondiente; no se altera retroactivamente el asiento. El saldo de días continúa en el ledger de vacaciones.

Vacaciones y liquidación no añaden un salario fijo automático. Se registran conceptos revisados y su soporte. En liquidación se exige causal y procedencia; deben constar base/promedio, días trabajados, proporciones, límites, excepciones y pagos previos. No se termina automáticamente la ficha laboral al preparar una liquidación. Evitar duplicar vacaciones pagadas con el salario de la nómina ordinaria o descontar de prestaciones importes no permitidos legalmente.

## Aprobación y contabilidad

1. Preparar borrador con condiciones vigentes, empleados y conceptos. El servidor calcula bruto, deducciones, aportes y neto en centavos. Rechaza duplicados, cruces del mismo tipo, importes no finitos y deducciones superiores al bruto.
2. Revisar el detalle congelado y aprobarlo. Para corregir un borrador, anular y preparar otro; no editar un documento histórico.
3. Contabilizar con fecha prevista de pago en un período contable abierto. Se reconoce gasto, retenciones/aportes y remuneraciones por pagar. **No se ejecuta ni se acredita una transferencia bancaria.**
4. USD requiere tipo de cambio y cuenta explícita de ajuste de redondeo. Solo absorbe centavos de conversión; se conserva el neto contractual y se registra la diferencia aplicada.
5. Una nómina contabilizada se corrige mediante reversión atómica, con motivo y fecha de hoy en período abierto. Se conserva el asiento original y el reverso; los reintentos no los duplican.

El PDF privado es un comprobante de remuneraciones aprobadas. Su emisión no demuestra firma ni pago. Los documentos firmados de ausencias se conservan por separado en Constancias.

## Lista para activar con datos reales

- Registrar contratos y vigencias, moneda, frecuencia y fijo mensual cuando aplique.
- Validar afiliaciones, ISR y tasas/techos vigentes; documentar las reglas de variables, vacaciones y causales de liquidación.
- Mapear cuentas y períodos contables; revisar pago/anticipo anterior y los saldos iniciales.
- Conciliar una nómina real antes de aprobarla. Los ejemplos UAT usan exclusivamente personas e importes sintéticos y no sirven como tasas ni salarios de Sari.
- Automatización normativa, dispersión bancaria y conciliación automática de pagos quedan fuera de esta primera versión configurable; requieren su propio alcance y validación.

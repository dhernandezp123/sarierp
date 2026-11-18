# RRHH — Política de vacaciones (HR-02)

Decisiones del usuario del 18/11/2026, basadas en el Código del Trabajo de Honduras
(Decreto 189-59, texto publicado por el TSC). Es una lectura del texto, no un dictamen
legal: confirmar con asesoría laboral antes de Production.

## Base legal consultada

| Art. | Regla | Aplicación |
| --- | --- | --- |
| 346 | Tras cada año de servicio continuo: 10 / 12 / 15 / 20 días **laborables consecutivos** (1 / 2 / 3 / 4+ años). Mínimos. Licencias sin goce, descansos legales e incapacidades no interrumpen la continuidad. | Período por aniversario y escala por antigüedad. |
| 347 | En labores no regulares todo el año, la continuidad se cumple con 200 días trabajados en el año. | Fuera de alcance; se documenta. |
| 348 | El patrono fija la época dentro de los 3 meses siguientes al derecho y avisa con 10 días de anticipación. Prohibido compensar en dinero (salvo autorización de la Secretaría de Trabajo). | Alerta de período sin programar. |
| 349 | Al terminar la relación se pagan las vacaciones ganadas, y la proporción si la terminación es imputable al patrono. | Nómina/liquidación (fase separada). Los saldos por período deben ser exactos. |
| 350 | Prohibido acumular, salvo **una sola vez** y **hasta 2 años** para labores técnicas, de dirección o de confianza de difícil reemplazo. | Acumulación por excepción auditada. |
| 351 | Se gozan sin interrupción; el patrono puede suspenderlas por urgencia sin que el trabajador pierda el derecho a reanudarlas. | Fraccionamiento con aviso; suspensión con devolución de días. |
| 355 | Concesión y acumulación con constancia escrita firmada por el trabajador. | Ajustes auditados ahora; constancia firmada en la fase de documentos. |
| 339 | Feriados nacionales pagados. | Calendario por año, editable por Admin (puede haber reformas posteriores, p. ej. Semana Morazánica). |

## Reglas del ERP

1. **Período por aniversario.** El período N inicia el día en que se cumplen N años desde
   `hire_date`. En esa fecha se acreditan completos los días del período (no hay devengo mensual).
   Antes del primer aniversario no hay saldo, salvo anticipo.
2. **Escala por antigüedad.** 10 / 12 / 15 / 20 días laborables al cumplir 1 / 2 / 3 / 4+ años.
   Admin puede fijar un valor mayor por empleado (nunca menor al mínimo legal).
3. **Jornada por empleado.** Cada ficha define sus días laborables: lunes a viernes, o lunes a
   sábado (completo o medio día). Un sábado laborable, completo o de medio día, consume
   **1 día**. Los saldos se manejan en días enteros. Domingos y días no laborables de la
   jornada no consumen saldo.
4. **Calendario laboral con feriados.** Catálogo por empresa y fecha, mantenido por Admin. Un
   feriado no consume vacaciones ni permisos. Se precargan los del Art. 339 como sugerencia
   editable; las fechas móviles (Semana Santa, Semana Morazánica) se registran por año.
5. **Consumo por período.** Una solicitud de vacaciones consume primero el período más antiguo
   vigente. Las pendientes reservan saldo; la aprobación lo revalida.
6. **Acumulación (Art. 350).** Por defecto no se acumula: un período sin gozar en su totalidad
   genera alerta al vencer su año, **sin borrar días** (el derecho ya ganado se conserva y sigue
   siendo exigible). Admin puede autorizar **una sola** acumulación por empleado, de hasta
   **2 períodos**, con motivo obligatorio y registro auditado.
7. **Anticipos.** Política interna (no regulada en el Código). Saldo negativo permitido hasta un
   tope **configurable por empresa**, solo con aprobación de Admin. Queda marcado como anticipo y
   se descuenta del siguiente período al acreditarse.
8. **Programación (Art. 348).** Alerta cuando un período lleva 3 meses acreditado sin vacaciones
   programadas.
9. **Fraccionamiento (Art. 346/351).** Se permite dividir un período en varias solicitudes. El
   sistema avisa que es una excepción a la regla de días consecutivos y la marca en la solicitud.
10. **Suspensión (Art. 351).** Admin puede suspender vacaciones aprobadas en curso; los días no
    gozados vuelven al saldo del mismo período.
11. **Saldos históricos.** Para empleados existentes, Admin registra por cada período abierto los
    días ya tomados antes del ERP, como ajuste auditado con motivo.
12. **Ajustes auditados.** Toda corrección manual de saldo (apertura, corrección, acumulación,
    anticipo) es un movimiento con tipo, días (+/-), período, motivo obligatorio, autor y fecha.
    No se edita ni borra; se corrige con otro movimiento.
13. **Configuración de empresa.** Tope de anticipo y días de aviso. Los valores legales
    (escala, máximo de acumulación 2, una vez por empleado, 3 meses) no son configurables.

## Fuera de alcance de HR-02

Avisos, calendario de ausencias, exportaciones e historial de la ficha (siguiente bloque);
documentos y constancias firmadas; nómina y pago de vacaciones (Art. 349 y 352).

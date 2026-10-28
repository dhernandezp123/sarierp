# AUD-10 — Calendario y zonas horarias

Estado: implementado y validado localmente; abierto para publicación y UAT
visual/autenticado en destino. Fecha: 14/10/2026. Sin SQL ni librerías nuevas.

## Reglas conservadas y corregidas

| Área | Calendario | Regla |
| --- | --- | --- |
| Dashboard Miami | America/New_York, independiente del navegador | «Hoy» comprende desde la medianoche local inclusive hasta la siguiente medianoche exclusiva |
| Fechas de manifiestos/paquetes en el dashboard | America/New_York | DD/MM/YYYY con hora y etiqueta «hora Miami» |
| Histórico comercial | Calendario local del navegador, como el dashboard comercial existente | Filtrado y fecha visible interpretan el mismo timestamp en la misma zona |
| Vigencia de tarifa seleccionada | Fecha DATE del calendario local | Diferencia por días de calendario; un día de 23 horas no reduce la vigencia |
| CxP | America/Tegucigalpa, calculado por la vista SQL canónica de AUD-03 | Vence al terminar su fecha; hoy tiene cero días vencidos y vence desde el día siguiente si existe saldo abierto |

CxP ya cumplía esta regla mediante `supplier_payable_balances`: `as_of_date`
usa Honduras, compara `fecha_vencimiento < as_of_date` y calcula días y pagos del
mes en la misma zona. Listado y detalle consumen ese resultado. Se revisaron
código/migración vigente y se añadieron regresiones de contrato en la interfaz;
no se reintroduce un cálculo de vencimiento con la hora o zona del navegador.
No se cambian saldos, NC/ND, pagos, estados históricos ni timestamps persistidos.

## Miami

`miamiDayRange` en `src/lib/format.ts` convierte ambas medianoches por separado
usando Intl y la zona de Miami. Los resultados son instantes UTC para consultar
columnas timestamptz. La aritmética de 24 horas solo avanza el día nominal de
calendario; no se suma un plazo fijo al instante de la primera medianoche.

Ejemplos comprobados:

| Día en Miami | Inicio UTC inclusivo | Fin UTC exclusivo | Horas |
| --- | --- | --- | --- |
| 08/03/2026 | 08/03/2026 05:00Z | 09/03/2026 04:00Z | 23 |
| 01/11/2026 | 01/11/2026 04:00Z | 02/11/2026 05:00Z | 25 |

Los contadores `asignadosHoy` y `recibidosHoy` aplican `gte(start)` y `lt(end)`;
incluyen el inicio, excluyen exactamente la siguiente medianoche y fechas
futuras. Conservan los filtros de tenant/estado y la validación de las seis
respuestas de AUD-09. Listas de preview y contadores sin restricción de día
conservan su alcance anterior. Si no puede calcularse el día, no se consulta ni
se presenta un KPI cero como fallback.

`formatMiamiDateTime` admite formato numérico opcional para las dos listas del
dashboard. Sus consumidores previos, incluido el correo, conservan el formato
largo por defecto. No se cambia el instante almacenado al mostrarlo en Miami.
Los límites se recalculan en cada consulta/actualización; no hay un refresco
automático al cruzar medianoche. Para una pestaña que permanece abierta se usa
«Actualizar dashboard» antes de basarse en los contadores del nuevo día.

## Histórico

El filtro reutiliza `isInCreationPeriod`, ya usado por el dashboard comercial.
Evita cortar el prefijo UTC de created_at mientras la tabla muestra otro día
local. Un rango con inicio posterior a fin no incluye filas. Con filtros activos,
un timestamp inválido/ausente no se convierte en una fecha válida; sin filtros se
mantiene el registro y su fecha se presenta con fallback.

La columna de creación usa `formatDate`, con DD/MM/YYYY. La vigencia seleccionada
usa `calendarDaysUntil` y `formatDate`: no divide milisegundos entre 24 horas.
Fecha DATE imposible no muestra «Invalid Date» ni se normaliza a otro mes.
No se actualizan cotizaciones, agentes, fechas DATE o estados como efecto de
filtrar o mostrar vigencias.

«Local» conserva la convención actual del dashboard comercial: un usuario con
zona de navegador diferente puede ver otro día para el mismo instante, pero el
filtro coincide con ese día visible. No se crea una configuración de zona por
tenant ni se cambian los calendarios de otros módulos en esta etapa.

## Evidencia local

Antes del cambio, con reloj controlado:

- Miami, a las 21:30 locales del 14/10, pedía datos desde 15/10 UTC y sin límite
  superior. El día consultado no correspondía al día de la bodega.
- Histórico excluía de un filtro del 14/10 una cotización de 15/10 01:30Z que
  la propia tabla mostraba como 14/10 en Honduras.

Nueve regresiones nuevas (ocho en `calendar-flows.test.mjs` y una en el flujo de
CxP): invierno/verano, medianoches inclusiva/exclusiva, cambios DST de 23/25
horas y hora repetida, cambio de año y febrero bisiesto, rango local de Histórico,
vigencia a ocho días cruzando DST, fecha imposible y estados canónicos de CxP.
Se probaron zonas Honduras, Miami, UTC y Tokio, restaurando TZ y reloj simulado.

Validación: 294/294 pruebas Node y TypeScript sin errores; build con 82/82 páginas.
Seis archivos con ESLint limpio. Histórico conserva siete errores no-explicit-any
y dos avisos no-unused-vars previos; se comparó la versión anterior de esta etapa
y no se añadieron infracciones. No se declara limpio el lint global.

No se ejecutó SQL ni se inició Docker en esta etapa. Las regresiones montan
componentes/helpers reales con SDK y reloj simulados; no certifican RLS remoto,
consulta real del proveedor ni UAT de navegador. Sin correos, pagos, OCR externo
o movimientos de negocio reales.

## UAT pendiente

1. Publicar helper y pantallas juntos, con las dependencias previas de AUD-03/09.
   Confirmar la vista canónica financiera del destino; no recalcular sus estados
   desde JavaScript ni modificar datos para forzar vencimientos.
2. En un entorno de pruebas con respuestas interceptadas y reloj controlado,
   verificar Miami antes/después de medianoche, invierno/verano y las transiciones
   de 08/03/2026 y 01/11/2026. Inspeccionar ambos límites de assigned_at/received_at.
3. Ubicar filas justo antes del inicio, en el inicio, justo antes del fin, en el
   fin y después. Deben contarse solo las dos filas interiores en ambos KPIs.
   Repetir desde navegadores en Honduras y otra zona.
4. Confirmar que las listas muestran DD/MM/YYYY y hora Miami del instante real.
   Revisar móvil, desbordamiento de tablas, modo oscuro y textos de zona.
5. Histórico: en Honduras filtrar el 14/10/2026 y comprobar que incluye
   15/10/2026 01:30Z, pero excluye 15/10/2026 06:00Z. Repetir desde otra zona:
   el día filtrado debe coincidir con el día mostrado por esa interfaz.
6. Verificar filtros Desde/Hasta por separado, rango invertido, límites de mes,
   filtros/paginación de regreso y limpieza de filtros. Revisar fecha inválida
   sin presentar un día inventado.
7. Vigencia: el 08/03/2026 en Miami, una tarifa válida hasta 16/03 está a ocho
   días y no recibe el indicador de siete días. Verificar hoy, ayer y fecha DATE
   imposible con respuestas simuladas, sin actualizar tarifas reales.
8. CxP: estado y días vienen de la vista con fecha Honduras. Una AP que vence
   hoy no debe aparecer vencida ni sumar al KPI vencido; al día siguiente sí,
   cuando tenga saldo abierto. Repetir listado y detalle desde otra zona de
   navegador y verificar que los importes/movimientos no cambian por consultarlos.
9. Simular un fallo de consulta: conservar error/reintento y protección de datos
   anteriores de AUD-09; Demo y los envíos permanecen bajo sus controles existentes.

Pendientes: publicación, UAT visual/autenticado y comprobación de dependencias y
permisos/RLS del destino. Se depende del reloj del dispositivo y de sus datos IANA
de zona horaria; mantenerlos actualizados. AUD-11 sigue con la transacción de
incidencia/estado del paquete.

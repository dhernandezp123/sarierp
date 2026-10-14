# AUD-04 — Consultas completas y versiones manuales paginadas

Estado: implementado y validado localmente con pruebas de código real y red
simulada. Abierto para publicación y UAT autenticado/visual en el ambiente
destino. Sin commit, despliegue, cambios SQL ni modificaciones de permisos/RLS.

## Qué cambia

| Flujo | Comportamiento |
| --- | --- |
| Facturación | Lee todas las facturas, saldos, cobros y filas de la cola por facturar. Asocia por ID, sin confiar en órdenes independientes ni embeds truncados. Un saldo/cabecera faltante exige recargar; no se interpreta como cero. |
| Cierre y estado de cuenta | Utilizan los conjuntos completos de facturas/saldos/cobros. Se conservan fórmulas, monedas, estados y filtros existentes. |
| Histórico | Cabeceras, vigencias de agentes, contenedores y carga suelta completos; filtros y KPIs operan sobre todas las filas autorizadas. Se conserva el retorno al detalle y el estado de filtros. |
| Inventario Miami | Paquetes y documentos completos. El historial de cada paquete también se pagina hasta agotarse. Los errores permiten reintentar sin afirmar que no hay movimientos. |
| Embarques Miami | Sin topes ocultos de 500 paquetes o 10 embarques. Ambas tablas tienen paginación visual; selección, peso y lista impresa incluyen todos los seleccionados, también fuera de la página/filtro actual. Se conserva la RPC de despacho. |
| Alertas y campana | Fuentes completas de cotizaciones, pricing, operaciones, bookings, documentos, contenedores, revisiones y readiness. Un fallo indica indisponibilidad y permite reintentar; no muestra Sin alertas como resultado de un error. |
| Facturas manuales | GET paginado con conteo real, búsqueda literal por número/cliente y Cargar más versiones. Permite llegar a documentos anteriores a los últimos 100. Guardar sigue creando una nueva versión y actualiza el historial, sin descartar versiones antiguas en memoria con slice(0,100). |

Los lectores reutilizan `readAllReportRows`: orden estable con ID, avance según
filas recibidas hasta una página vacía y rechazo de errores/páginas repetidas.
Los filtros de relaciones agrupan como máximo 100 IDs por petición y paginan
cada grupo para evitar URLs enormes o truncamiento de sus resultados. Las
respuestas obsoletas no publican datos al desmontar/cambiar de usuario o tenant.

La cola por facturar conserva un estado de error independiente: una cola
indisponible no impide consultar documentos/saldos que sí se cargaron completos.
Sus contadores no se presentan como un resultado válido si la cola falló.

Las reglas comerciales/contables, transiciones, autorizaciones, documentos
congelados y operaciones de escritura permanecen en sus mecanismos existentes.
Las alertas conservan sus filtros de rol/propiedad; Finanzas no solicita fuentes
operativas descartadas por su flujo. El portal reutiliza el mismo escape literal
de búsqueda que antes, extraído a un helper común, sin cambiar su contrato.

## API de historial manual

`GET /api/manual-invoices?offset=0&pageSize=25&search=texto`

- Respuesta: `documents`, `total`, `nextOffset`, `hasMore`; sin cache HTTP.
- La UI solicita 25 documentos por carga. API acepta tamaños 25/50/100, offset
  entero entre 0 y 10,000,000 y búsqueda de hasta 120 caracteres.
- `nextOffset` usa filas realmente recibidas: si el servidor limita 100 a 50,
  la siguiente petición comienza en 50, sin saltarse registros.
- Conserva autorización por usuario aprobado/activo, roles vigentes del módulo,
  tenant y hostname Sari. El tenant se deriva del contexto validado.
- El filtro toma literalmente comillas, comas, porcentajes, guiones bajos y
  barras; no agrega operadores libres a la consulta.
- Un conteo no disponible o una página vacía inesperada es un error 503, no un
  historial vacío. El cliente rechaza páginas duplicadas o metadatos incoherentes.

## Publicación y límites

1. Publicar API y frontend juntos; actualizar pestañas con una versión anterior.
   No se necesita una migración nueva por AUD-04. El frontend completo del
   worktree también incluye AUD-01/02/03 y requiere sus migraciones pendientes
   en orden antes de publicarse.
2. Usar staging o datos ficticios autorizados para la matriz de abajo. No
   cargar fixtures de volumen, enviar correos de asignación ni despachar carga
   real como prueba en producción. Interceptar las respuestas de correo/OCR
   cuando se verifiquen los formularios relacionados.
3. Verificar con usuarios reales autorizados que PostgREST aplica orden/rango,
   los RPC devuelven todas sus páginas y RLS mantiene el aislamiento. Las pruebas
   con clientes simulados no certifican RLS desplegado ni latencia remota.
4. Validar móvil/teclado, navegación, selección y formatos/exportaciones. No se
   realizó una inspección visual en navegador conectado en esta entrega.

Los conjuntos que alimentan KPIs, filtros en memoria y exportaciones se leen
completos. Esto corrige el truncamiento, sin garantizar tiempos constantes para
volúmenes arbitrarios: aumenta memoria/red frente a la lectura incompleta.
Medir en staging; si el volumen lo requiere, evolucionar a agregados/búsqueda
de servidor. No ocultar registros restaurando límites silenciosos. Facturas
manuales tiene paginación explícita para evitar descargar todos sus JSON de golpe.

Las páginas sucesivas no son una única transacción. Escrituras concurrentes
pueden cambiar el conjunto; duplicados/desajustes detectados solicitan actualizar.
En el historial manual, una inserción concurrente puede desplazar páginas por
offset: el cliente detecta duplicados y requiere Actualizar. No se afirma una
instantánea inmutable ni reconstrucción histórica de saldos. Comparar sin
escrituras simultáneas y con los mismos filtros/períodos.

El alcance son las consultas identificadas por AUD-04 y sus relaciones necesarias;
no se afirma que todas las consultas de la aplicación hayan migrado a este patrón.
CxP ya utiliza lecturas completas desde AUD-03.

## Matriz de aceptación

| Escenario | Resultado esperado |
| --- | --- |
| Más de1,000 facturas/saldos, respuesta limitada a 50 | Todas las filas accesibles, correspondencia por ID, KPIs/estado de cuenta/cierre completos por moneda. |
| Más de1,000 cobros o líneas en una relación | No se truncan embeds ni se pierden registros al dividir IDs; reversos/fórmulas conservan su tratamiento existente. |
| Error en página posterior de facturas/saldos/cobros | Pantalla de error y Reintentar, sin exportar totales parciales. |
| Falla solo la cola por facturar | Mensaje de indisponibilidad de cola, sin lista parcial; documentos financieros completos disponibles. |
| Histórico con registro 1,301 | Buscar/navegar hasta ese registro; filtros, vigencias, cantidades y contadores completos. |
| Inventario y documentos con más de1,000 registros | Buscar paquete fuera de primera página, abrir sus documentos e historial completos. |
| Paquete disponible posterior al 500 | Aparece en Embarques; paquetes en tránsito se excluyen como antes. |
| Selección entre páginas y tipos de carga | Conteo, peso, impresión y RPC incluyen exactamente todos los seleccionados; deseleccionar un filtro conserva los demás. |
| Más de10 embarques persistidos | Acceso mediante páginas, sin cortar el historial a 10. |
| Alertas después de primera página, incluida readiness | Se incluyen en lista, resumen y campana según rol/propiedad. |
| Error al leer fuente de alertas | Centro y campana indican fallo; Reintentar recupera; no afirman ausencia de alertas. |
| Historial manual con 1,301 versiones | Cargar más hasta llegar al total, sin saltos con límite50; búsqueda de versión antigua por número/cliente. |
| Búsqueda sin coincidencias | Mensaje de búsqueda sin resultados, no afirmación de ausencia de documentos guardados. |
| Inserción concurrente entre páginas manuales | Si aparece duplicado, solicita Actualizar; no lo agrega ni muestra completitud falsa. |
| Guardar mientras se filtra el historial | Nueva versión confirmada, formulario conservado; historial se consulta con el filtro vigente. |
| Cambiar de usuario/tenant durante lectura | Respuesta anterior descartada; acceso limitado al tenant/rol actuales. |
| Parámetros manuales inválidos, perfil no autorizado u otro tenant | Respuesta 400/401/403 apropiada, sin datos de otra empresa ni conteo filtrado incorrecto. |
| Búsquedas con comillas, comas, %, _ o barras | Valor literal; sin ampliar permisos ni modificar la expresión del filtro. |

## Evidencia local

- Reproducción ejecutando el GET real de HEAD con 1,301 documentos y servidor
  simulado limitado a 50: retornaba 50 sin acceso a otra página. GET corregido:
 25 visibles, total 1,301 y siguiente página disponible.
- 18 regresiones nuevas: 9 lectores/filtros/relaciones, 5 API/contrato/búsqueda
  manual y 4 componentes reales con hooks/red simulados. Incluyen 1,301
  cabeceras/saldos, 2,602 cobros, 1,101 filas de cola, 1,005 líneas/documentos,
  alertas y paquetes posteriores a los límites anteriores, fallos y cambio de contexto.
- Sin escrituras de negocio remotas, migraciones ni correos. El despacho de la
  prueba de componente usa una RPC simulada y verifica solo el payload elegido.
- Resultados finales de Node, TypeScript, ESLint y build en HARDENING.md.

Pendientes: UAT autenticado, permisos/RLS desplegados, comportamiento real de
PostgREST con límites del ambiente y medición visual/rendimiento.

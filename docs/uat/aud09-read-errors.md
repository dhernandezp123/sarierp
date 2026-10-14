# AUD-09 — Errores de consulta y datos anteriores

Estado: implementado y validado localmente; abierto para publicación y UAT del
ambiente destino. Fecha: 14/10/2026. No hay SQL ni librerías nuevas en esta etapa.

## Comportamiento esperado

| Área | Primera consulta fallida | Actualización fallida | Recuperación |
| --- | --- | --- | --- |
| Dashboard Miami | Error visible y Reintentar; sin KPIs ni mensajes de listas vacías | Mantiene solo la última lectura completa del mismo usuario/tenant/rol, con aviso de datos desactualizados | Actualizar dashboard o Reintentar reemplaza las seis respuestas juntas al completarse correctamente |
| Campana | Error e indicador de desactualización; no afirma que no existan alertas | Conserva lista, badge y vistos del mismo contexto, con aviso; abrir el snapshot fallido no marca leído | Actualizar alertas o Reintentar elimina el aviso solo tras lectura correcta |
| Detalle CxP | Error y Reintentar; sin saldo/historial parcial ni acciones financieras | Oculta la vista financiera y bloquea sus acciones hasta recuperar todas las lecturas | Reintentar carga cuenta, saldo canónico, pagos y ajustes completos |

El comportamiento de CxP ya estaba implementado por AUD-02/03/04. Esta etapa
añade regresiones para las cuatro lecturas y para una actualización fallida;
no cambia cálculos, reglas financieras, RPCs ni su pantalla de producción.
Se conserva el bloqueo de la vista financiera: no se reutiliza un saldo antiguo
como base para registrar pagos o ajustes.

## Miami

`src/lib/miami-dashboard.ts` ejecuta las seis consultas existentes con filtro
explícito de tenant. Revisa `error` en cada respuesta, exige counts enteros no
negativos y listas válidas. Un count null no se convierte en cero y una lista
null no se convierte en vacía. Cero y `[]` siguen siendo resultados válidos
cuando la consulta se completó sin error.

La pantalla publica una única lectura completa. Un fallo en una lista impide
combinar métricas nuevas con listas anteriores. No representa una transacción
SQL: las consultas pueden observar cambios concurrentes de negocio entre sí.
Los listados conservan sus límites intencionales de preview de 10 manifiestos y
15 paquetes; los counts son exactos. La frontera UTC de «hoy» se conserva hasta
AUD-10, donde se revisarán calendario y zona horaria.

Al actualizar se conserva lo anterior con etiqueta de desactualización. Si la
lectura anterior estaba vacía, el texto dice «La última consulta no tenía…» y
no afirma que la situación actual esté resuelta. El snapshot se mantiene solo
en memoria; no se persiste contenido del dashboard en localStorage.

Se requiere usuario/perfil coincidentes, aprobación, actividad, tenant y permiso
`canAccessPath('/miami')`; la consola de plataforma no consulta Miami. El render
oculta inmediatamente un snapshot de otro contexto, incluso antes del efecto de
carga. La versión de solicitud impide aplicar respuestas reemplazadas o de una
pantalla desmontada. Los filtros y permisos de UI no sustituyen RLS.

## Campana

Los errores siguen viniendo del lector completo `getSystemAlerts` de AUD-04.
Una actualización fallida no elimina la lista anterior ni reescribe los vistos.
Mientras carga o falla, el dropdown etiqueta sus datos anteriores; un snapshot
vacío dice «La última consulta no tenía alertas». El indicador de error se ve
también con el dropdown cerrado. Una lectura nueva válida puede confirmar una
lista vacía y volver a mostrar «Sin alertas activas».

Solo una lectura completa del contexto activo permite marcar vistos al abrir la
campana. La lectura de alertas exige perfil coincidente, aprobado y activo,
tenant, permiso `/alerts` y ausencia de privilegio de plataforma. Se ocultan
datos de otro usuario/tenant/rol o de una sesión en transición y se descartan
respuestas tardías. Se conserva la persistencia existente de IDs vistos por
usuario; no se guarda contenido de alertas en esa persistencia.

## Validación local

Reproducción antes del cambio con componentes reales y red simulada:

- Seis respuestas fallidas de Supabase producían métricas cero, «No hay
  manifiestos abiertos» y «Todos los paquetes están asignados» en Miami.
- Una lectura inicial correcta de la campana seguida de fallo borraba su lista.

Once regresiones nuevas: nueve para helper/pantallas Miami y campana, dos para
CxP. Cubren cada subconsulta, resultados incompletos, cero válido, conservación
de lectura completa, vistos/badge, reintento, sesión/perfil/rol/tenant y respuestas
fuera de orden o después del desmontaje. El harness compartido admite props
para montar Topbar sin cambiar su contrato de producción.

Validaciones: 285/285 pruebas Node, TypeScript sin errores, build con 82/82
páginas y ESLint de siete archivos sin errores ni warnings. Fixtures y SDK
simulados; sin correos, pagos ni mutaciones de negocio reales, sin cambios en
Docker o bases de datos. No se certifican con estos mocks RLS remoto ni un
navegador autenticado.

## UAT del ambiente destino

Usar respuestas interceptadas en un entorno autorizado; no cambiar RLS ni
provocar fallos en una base compartida para probar la UI.

1. Publicar las pantallas/helper juntos y confirmar las dependencias financieras
   previas de AUD-02/03/04, incluida `supplier_payable_balances`.
2. Miami, con Admin u Operaciones aprobados/activos: fallar por separado los
   cuatro counts y las dos listas, en primera carga y actualización. Inicialmente
   solo debe aparecer el error con reintento; al actualizar debe conservarse lo
   anterior con etiqueta, sin mezclar contadores nuevos. Restaurar la red y
   comprobar que desaparece el error y se reemplaza toda la lectura.
3. Verificar una respuesta válida con cero/`[]`: los estados vacíos sí deben
   aparecer. Durante una actualización pendiente no deben afirmarse como actuales.
4. Campana: guardar una lectura con alertas altas, provocar fallo en una consulta
   y navegar. Conservar lista/badge/vistos, mostrar aviso e indicador incluso
   cerrada. Abrir durante fallo o carga no debe marcar vistos; recuperar y abrir
   una lectura válida sí conserva el comportamiento normal de vistos.
5. Repetir con una lectura anterior vacía y con error en la primera carga.
   «Sin alertas activas» requiere una consulta completa vigente.
6. Cambiar de usuario, tenant, rol, estado del perfil o cerrar sesión mientras
   una respuesta está pendiente. No debe aparecer información del contexto
   anterior. Completar después la respuesta vieja no debe reemplazar la nueva.
7. CxP: interceptar un error en cuenta, vista de saldo, pagos y ajustes,
   incluyendo una página posterior del historial. No mostrar USD 0.00 como
   fallback ni permitir registrar/reversar pagos o crear/anular ajustes desde
   una vista parcial. Restaurar red y reintentar; no se deben crear movimientos
   como consecuencia de una consulta.
8. Revisar móvil, modo oscuro, anuncios de error, foco/teclado de los botones y
   campana. No hubo validación visual en navegador durante esta etapa.

Pendientes: publicación, UAT visual/autenticado y verificación de permisos/RLS
del destino. Las advertencias no garantizan que el dato cacheado siga vigente;
el usuario debe completar una actualización antes de basarse en él. AUD-10
mantiene pendiente la corrección de fechas y zona horaria.

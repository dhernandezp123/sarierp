# UAT autenticada — Recursos Humanos HR-01 / HR-02

Estado: aceptación técnica local cerrada el 20/11/2026 para el candidato `release/hr-module-20261120`, basado en `origin/main` 2241df7. Integración y despliegue remotos pendientes.

Evidencia final: [validación del candidato aislado](hr-release-validation-2026-11-20.json): 65 grupos de API, 31 de navegador, 683 pruebas Node, SQL con rollback y conciliación de 35 períodos. Se probaron Auth y PostgREST reales, y el ERP completo en build de producción local. La [ejecución inicial de 63 comprobaciones](hr-authenticated-results-2026-11-20.json) queda como evidencia histórica; sus pendientes locales se cierran con la ejecución final.

## Preparación

- [x] Registrar rama candidata, base de main, fecha, ambiente, versiones de migraciones y hashes del código probado en la evidencia final. El commit de cierre se identifica en el historial de esa rama.
- [x] Usar ambiente local aislado y datos sintéticos, sin copiar documentos personales reales.
- [x] Aplicar HR-01 y HR-02 en orden; comprobar tablas, funciones, grants y RLS.
- [x] Disponer de Admin A, empleado A vinculado, empleado A sin vínculo, usuario Cliente, usuario inactivo/no aprobado y Admin B de otra empresa.
- [x] Autenticar mediante Supabase Auth; ejecutar lecturas y RPC por PostgREST con JWT de cada usuario. No usar service role para probar autorización.

## Accesos y aislamiento

- [x] Admin A administra únicamente su empresa (API/RLS).
- [x] Empleado vinculado ve su ficha, sus saldos y sus solicitudes; no accede a fichas ajenas cambiando UUID (API/navegador).
- [x] Usuario interno sin ficha recibe un estado comprensible y no obtiene datos ajenos (dos pestañas reales).
- [x] Cliente e inactivo/no aprobado no leen fichas ni pueden ejecutar las 8 RPC de administración probadas, crear solicitudes o consultar saldo/vista previa ajenos (matriz API).
- [x] Admin B no lee filas de A en las 8 tablas HR ni modifica sus empleados, solicitudes, saldos o ajustes. Su configuración se guarda únicamente en B (API).
- [x] Cerrar sesión/cambiar usuario con una carga pendiente no muestra datos de la sesión anterior (respuesta real retenida con CDP y cambio de sesión real desde otra pestaña; regresiones de hooks adicionales).

## Fichas y saldos

- [x] Crear ficha, vincular usuario y editar jornada sin perder datos existentes (API).
- [x] Verificar períodos de aniversario y escala 10/12/15/20; mínimo personalizado no inferior a la escala (SQL/API).
- [x] Registrar apertura histórica y corrección con motivo; ledger y saldo concilian (SQL/API, conciliación final).
- [x] Cambiar mínimo no modifica períodos ya ganados; cambio de ingreso incompatible con movimientos se rechaza (SQL/API).
- [x] Feriados y días fuera de jornada no descuentan saldo; sábado laborable consume un día (SQL/API).

## Solicitudes y decisiones

- [x] Empleado solicita vacaciones; vista previa y reserva coinciden con el saldo del servidor (API/navegador).
- [x] Admin aprueba/rechaza; empleado cancela una pendiente y recupera reserva (API/navegador; rechazo por API).
- [x] Rechazo y suspensión exigen motivo; la cancelación mantiene la política existente (SQL/API).
- [x] Suspender conserva los días gozados anteriores al reintegro y devuelve los restantes (SQL/API).
- [x] Cambiar feriados/jornada después de aprobar no altera las fechas originales descontadas (SQL/API; nueva regresión SQL de sábado gozando jornada L-S antes de cambiar a L-V).
- [x] Bajar tope de anticipo conserva la reserva previa al aprobar, pero impide ampliarla.
- [x] Solicitudes simultáneas no sobregiran saldo ni permiten traslapes (API concurrente y SQL).
- [x] Repetir request_id no duplica solicitud/ajuste; acumulación única no se duplica con dos sesiones.

## Interfaz y cierre

- [x] Admin y empleado completan navegación a 1280, 768 y 390 px en Chrome headless.
- [x] Los cinco diálogos HR devuelven el foco al control de origen tras Escape; ficha, vacaciones, solicitud, revisión y suspensión sin desbordamiento en los tamaños probados (navegador).
- [x] Fallos de lectura permiten reintentar; una respuesta perdida después del commit permite reenviar con el mismo request_id sin duplicados; vista previa fallida permite reintentar las mismas fechas (navegador). HR-04 corrige el botón de recálculo ausente.
- [x] Guardar evidencia anonimizada por rol y operación, resultados, límites y hashes del candidato.
- [x] Conciliar saldos y ledger finales: 35 períodos de 7 empleados sintéticos; datos y servicios desechables retirados.

Registrar por separado SQL/RLS, navegador autenticado y smoke tras despliegue. No declarar Production validada por pasar casos locales.

Limpieza de la ejecución del 20/11/2026: base y contenedores desechables retirados, credenciales temporales eliminadas y servidores detenidos. La réplica quedó sin tablas HR. TypeScript volvió a pasar al finalizar. El build `.next` usado apuntaba al entorno UAT local; recompilar para el ambiente de release.

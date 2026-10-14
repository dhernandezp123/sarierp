# Controles continuos

El workflow `Quality` ejecuta TypeScript, tests Node, baseline de ESLint y build
en cada PR y push a main/master. Otro job instala las migraciones en un stack
Docker desechable y ejecuta las ocho suites SQL/RLS de la auditoría. No usa
secretos de negocio ni conexiones remotas, tampoco ejecuta scripts de correo.

El job SQL comprueba una instalación limpia; los scripts de carreras reales
siguen siendo una validación adicional local antes de releases financieros o
de estados. No se afirma cobertura de todas las suites históricas del repositorio.

## Lint

`npm run lint` conserva el diagnóstico completo y puede fallar por deuda previa.
`npm run lint:ci` impide aumentar diagnósticos por archivo/regla/severidad/mensaje,
incluidos avisos y repeticiones. Se compara el título del diagnóstico, sin
extractos de código/rutas absolutas/números de línea de React Compiler para
que el mismo resultado sea portable entre Windows y Linux. Mover una infracción a otro archivo se considera
nueva. Los errores de parseo/configuración fallan siempre.

El baseline inicial refleja el árbol auditado antes de los cambios posteriores
de esta ronda. No es una aprobación de esa deuda. Reducirla por módulo y revisar
la disminución; actualizar mediante `node scripts/lint-baseline.mjs --write`
solo localmente con revisión del diff. Nunca agregar un diagnóstico nuevo para
hacer pasar CI sin tratarlo como una excepción explícita y justificada.

No se desactivan reglas globales. El gate tolera menos diagnósticos que el
baseline; actualizarlo al reducir deuda evita que una infracción eliminada vuelva.
La ronda inicial reduce tres no-explicit-any del helper pricing-catalogs mediante
tipos de cliente y filas, sin cambiar defaults ni reglas comerciales. El baseline
se reduce de 227 a 224 diagnósticos; esas tres infracciones ya no están permitidas.
La extracción posterior de carga retira además un helper local sin uso:
baseline final 223 (187 errores y 36 avisos); la excepción también se elimina.

## Activación

Publicar estos archivos no configura reglas de protección de ramas. Tras la
primera ejecución alojada, un administrador debe exigir `application` y
`database` para fusionar y comprobar permisos de Actions. Esa acción queda
pendiente; no se modificaron ajustes de GitHub desde el entorno local.

El [ensayo de navegador aislado](../uat/audit-browser-rehearsal.md) complementa
las pruebas Node y SQL sin un runner nuevo. Se ejecuta con componentes reales
y red interceptada; no constituye aceptación autenticada de negocio.

Las versiones de checkout/setup-node usadas se contrastaron con sus
[repositorios oficiales](https://github.com/actions/checkout) y
[documentación oficial de setup-node](https://github.com/actions/setup-node).
Runner alojado Ubuntu, Node 22 y dependencias de package-lock.json; sin librerías nuevas.

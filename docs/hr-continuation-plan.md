# Continuación de Recursos Humanos

Fecha: 20/11/2026. Rama de trabajo: `feat/hr-module`.

## Fase 1 — Cierre técnico de HR-01 y HR-02 (validación local cerrada)

Objetivo: dejar una versión candidata verificable de empleados, vacaciones y permisos.

- Revisar los ajustes locales de foco y ancho de los cinco diálogos.
- Validar TypeScript, ESLint de HR, pruebas de HR y estándar financiero.
- Antes del commit candidato, ejecutar build y suite completa; separar cualquier fallo ajeno a HR.
- Reconciliar la rama con `origin/main` antes de integrar: hay cambios de tarifas de clientes independientes de HR en el árbol de trabajo.
- Separar los archivos de HR y su registro de HARDENING de los cambios de clientes; no incluir archivos por un `git add .`.
- Ejecutar el guion [UAT autenticada](uat/hr-authenticated.md) en un ambiente local aislado con Auth y PostgREST reales.

Cierre: evidencia por caso, permisos y aislamiento entre empresas verificados, sin defectos críticos abiertos. Una prueba con Supabase simulado no cierra esta fase.

Resultado al 20/11/2026: candidato aislado `release/hr-module-20261120`, basado en `origin/main` 2241df7; HR-01/02 trasladados conservando los cambios de clientes ya publicados en main y excluyendo los cambios locales ajenos a HR. Se corrigió HR-04 (reintento explícito del cálculo previo tras error de red), se completó el [checklist local](uat/hr-authenticated.md) y se guardó la [evidencia final](uat/hr-release-validation-2026-11-20.json). El historial de esa rama identifica el commit de cierre. La siguiente fase es preparar la integración y el despliegue con sus migraciones y respaldo.

## Fase 2 — Preparación operativa y despliegue (pendiente)

- Confirmar ambiente destino y revisar migraciones efectivamente aplicadas.
- Preparar respaldo y recuperación antes de modificar el destino.
- Aplicar únicamente las migraciones HR-01 y HR-02 pendientes, en orden; no usar un push indiscriminado de migraciones.
- Configurar feriados, jornada y tope de anticipos; preparar fichas, vínculos de usuarios y aperturas históricas con datos revisados por Administración.
- Revisar la política laboral documentada antes de activar su uso operativo.
- Integrar y desplegar el candidato validado; comprobar menú, accesos y un flujo autenticado completo.

Trial continúa omitido por la decisión previa del usuario. Este plan no registra una aplicación SQL ni un despliegue ya realizado. La salida remota se presenta para aprobación con candidato, diff, resultados y pasos concretos.

Cierre: migraciones verificadas en destino, acceso Admin/empleado funcional y saldos iniciales conciliados.

## Fase 3 — Calendario, avisos y trazabilidad (pendiente)

- Calendario de ausencias aprobado, con filtros por período y empleado; reutilizar las solicitudes existentes.
- Avisos de solicitudes y decisiones, con destinatarios autorizados e idempotencia; revisar primero alertas/notificaciones existentes.
- Exportaciones de solicitudes y saldos limitadas al alcance autorizado.
- Historial de cambios de la ficha, distinto del ledger de vacaciones ya existente.

Cierre: escrituras auditadas, aislamiento por empresa, permisos de exportación y ausencia de avisos duplicados. Definir canal y destinatarios antes de habilitar envíos externos.

## Fase 4 — Documentos y constancias (pendiente)

- Constancias de concesión, acumulación y suspensión con datos congelados del acto correspondiente.
- Evidencia firmada en almacenamiento privado, acceso autorizado e historial de versiones.
- Definir con Administración el circuito de firma y conservación antes de implementar.

Cierre: documento conciliado con la solicitud, evidencia privada recuperable y trazabilidad de firma.

## Fase 5 — Nómina y liquidaciones (pendiente de definición funcional)

Definir conceptos, salarios, pago de vacaciones, deducciones, liquidación e integración contable antes de programar cálculos. Esta fase no altera los saldos históricos ni las reglas vigentes por inferencia.

## Evidencia de esta continuación

- TypeScript: `npx.cmd tsc --noEmit`, aprobado.
- HR: `node --test tests/hr.test.mjs`, 7/7 aprobadas.
- Estándar financiero: `npm.cmd run check:finance-ui`, aprobado.
- ESLint: `npx.cmd eslint src/components/hr src/lib/hr.ts`, aprobado.
- Suite completa: `npm.cmd test`, 682/682 aprobadas sobre el árbol de trabajo actual (incluye cambios ajenos a HR).
- Build: `npm.cmd run build`, aprobado, incluido postbuild del runtime PDF de OCR.
- Docker disponible tras abrir Docker Desktop: ambas suites SQL de HR aprobadas con rollback en la réplica; cero tablas HR persistidas allí.
- Auth/PostgREST reales sobre base desechable sin filas de negocio copiadas: 40 comprobaciones de acceso y flujo, más 6 de anticipo/concurrencia, aprobadas.
- ERP completo en modo producción local: 17 comprobaciones de navegador aprobadas, sin excepciones JavaScript; login Admin/empleado, proxy, layout protegido, solicitudes y aprobación reales, con capturas a 1280/768/390 px.
- El modo desarrollo presentó un error de inicialización del router; la aprobación de navegador corresponde al build de producción local. No se modificó código del ERP para sortearlo.
- Evidencia actual y hashes de los archivos probados: [resultados autenticados](uat/hr-authenticated-results-2026-11-20.json). No equivale a despliegue o certificación de Production ni cierra todos los casos del checklist UAT.
- Cierre posterior de fase 1 sobre candidato aislado: 683/683 Node, 16/16 HR/sesión enfocados, TypeScript, ESLint enfocado, estándar financiero, build y postbuild OCR aprobados. Las dos suites SQL del candidato pasan con rollback. 65 grupos API y 31 de navegador; conciliación final de 35 períodos. Detalle y límites en la evidencia final, que sustituye los pendientes locales de la ejecución inicial.
- Limpieza: base desechable y contenedores UAT retirados; servidores locales detenidos, credenciales temporales eliminadas y réplica verificada sin tablas HR. `.next` contiene el build local de UAT y debe recompilarse con el ambiente destino antes de cualquier release; `.env.local` no se modificó.

# Runbook de rollback — Release 4A–5C

Este runbook no autoriza cambios en producción. Solo puede ejecutarlo el
responsable aprobado durante una ventana formal.

## Principios

- Las migraciones son acumulativas y preservan columnas legacy.
- No borrar shipments, bookings, eventos, revisiones, cut-offs, VGM,
  excepciones ni snapshots.
- No usar `migration repair` para simular un rollback.
- No restaurar un backup si ya existen escrituras posteriores sin un plan para
  conciliarlas; se perderían datos.
- Ante datos operativos nuevos, preferir rollback del frontend y corrección
  hacia adelante.

## Preparación obligatoria

- Backup restaurable verificado.
- Hora exacta de inicio y fin de ventana.
- Commit anterior conocido: `43e11bb`.
- Commit candidato y hashes de migraciones registrados.
- Inventario de sesiones/locks.
- Responsable DBA, Operaciones y aplicación disponibles.
- Capacidad de detener nuevas escrituras durante la decisión.

## Escenario A — Falla antes de aplicar 4A

1. Detener el procedimiento.
2. No desplegar frontend.
3. Conservar logs predeploy.
4. Clasificar el hallazgo y mantener `NO-GO`.

No existe rollback de datos porque no se aplicó SQL.

## Escenario B — Falla durante las migraciones

1. Detener `db push`; no reintentar automáticamente.
2. Consultar `supabase_migrations.schema_migrations`.
3. Ejecutar únicamente consultas de inventario y objetos, no postdeploy
   completo si faltan dependencias.
4. Confirmar si hubo escrituras de usuarios desde el inicio de la ventana.
5. Si la ventana permaneció sin escrituras:
   - restaurar el backup completo en una instancia aislada;
   - validar la restauración;
   - sustituir el ambiente según el procedimiento DBA aprobado.
6. Si hubo escrituras:
   - mantener frontend anterior;
   - bloquear el release;
   - preparar migración compensatoria o forward-fix revisado;
   - no eliminar objetos parciales manualmente.

## Escenario C — SQL completo, frontend aún no desplegado

1. Mantener el frontend anterior `43e11bb`.
2. Ejecutar postdeploy y diagnósticos para determinar si el esquema aditivo es
   seguro sin consumidores nuevos.
3. Si no existen corrupciones, dejar el esquema desplegado y posponer frontend.
4. Si existe corrupción y no hubo escrituras posteriores, restaurar backup
   completo.

Como las columnas legacy se preservan, el frontend anterior es la primera
medida de contención.

## Escenario D — Frontend desplegado, falla funcional sin corrupción

1. Revertir frontend al commit anterior.
2. Mantener el esquema 4A–5C; no borrar evidencia.
3. Registrar hora, usuario, shipment/booking afectado y error.
4. Ejecutar diagnósticos de la fase afectada.
5. Preparar forward-fix y repetir rehearsal/UAT.

## Escenario E — Falla de RLS o exposición cruzada

1. Retirar inmediatamente el frontend candidato.
2. Revocar acceso al consumidor/RPC afectado mediante cambio aprobado.
3. Preservar logs y no divulgar datos observados.
4. Auditar accesos desde el inicio de la ventana.
5. Corregir RLS en una migración compensatoria.
6. Repetir pruebas por Admin, Operaciones y Cliente.

Este escenario siempre es `NO-GO` y requiere revisión de seguridad.

## Escenario F — Corrupción o relaciones cruzadas

1. Detener escrituras operativas.
2. Capturar postdeploy counts y diagnósticos.
3. Identificar la última escritura posterior al backup.
4. Si no hay escrituras posteriores, restaurar backup completo.
5. Si existen, exportar el delta para conciliación antes de cualquier restore.
6. No corregir FKs, `shipment_id`, primarios o reemplazos con updates ad hoc.

## Contención específica 5C

- Un cut-off se corrige con una versión nueva.
- Un VGM se corrige mediante supersesión.
- Una excepción se revoca con motivo.
- Un snapshot aprobado nunca se edita.
- Una transición incorrecta se corrige mediante el flujo canónico permitido.

## Validación posterior al rollback

- Frontend sirve el commit esperado.
- No hay migraciones parcialmente registradas.
- Conteos base conciliados.
- Booking/SI/shipment mantienen relaciones coherentes.
- Portal no presenta exposición cruzada.
- BL y documentos siguen accesibles.
- Operaciones firma la recuperación.

## Cierre

Registrar:

- incidente y causa;
- decisión adoptada;
- backup utilizado;
- pérdida o conciliación de escrituras;
- commit/frontend activo;
- migraciones presentes;
- diagnósticos finales;
- responsables y hora de reapertura.

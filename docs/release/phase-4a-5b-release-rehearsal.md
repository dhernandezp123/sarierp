# Release rehearsal acumulado 4A-5B

## Estado

- Ejecución representativa: **PENDIENTE**.
- Motivo: la base local disponible tiene cero cotizaciones, Shipping
  Instructions, shipments, bookings, contenedores, documentos, BL, eventos y
  revisiones.
- Las pruebas sintéticas sirven para validar contratos e integridad, pero no
  prueban el comportamiento del backfill sobre historia real.
- Este procedimiento nunca debe ejecutarse directamente en producción.

## Insumo obligatorio

Usar una copia restaurable de producción o un snapshot anonimizado que conserve:

- cardinalidades y relaciones;
- estados y fechas;
- valores nulos e incompletos;
- duplicados;
- tipos de servicio;
- documentos y BL estructurados;
- usuarios sustituidos por UUID estables.

No conservar archivos, nombres, correos, teléfonos, identificaciones fiscales,
direcciones, notas privadas ni URLs firmadas reales.

## Orden exacto

Aplicar, sin saltos:

1. `20260729120000_booking_canonical_foundation.sql` (4A)
2. `20260729130000_booking_canonical_consumers.sql` (4B)
3. `20260729140000_canonical_operational_events.sql` (4C)
4. `20260729150000_shipments_foundation.sql` (5A)
5. `20260729160000_booking_schedule_revisions.sql` (5B)

## Procedimiento reproducible

1. Restaurar el snapshot en una instancia aislada con la misma versión mayor de
   PostgreSQL y extensiones que Supabase.
2. Confirmar que el historial de migraciones termina en `20260728130000`.
3. Ejecutar `supabase/rehearsal/phase_4a_5b_pre_snapshot.sql` y conservar el CSV.
4. Capturar locks antes de migrar:

   ```sql
   select clock_timestamp(), pid, locktype, mode, granted,
          relation::regclass, waitstart
   from pg_locks
   where database = (select oid from pg_database where datname = current_database())
   order by granted, pid, locktype, mode;
   ```

5. Activar medición (`\timing on` en `psql`) y aplicar cada archivo por separado
   con `ON_ERROR_STOP=1`. Registrar inicio, fin, duración y error de cada fase.
6. Durante cada fase consultar `pg_stat_activity` y `pg_locks` desde una segunda
   sesión cada 5-10 segundos. Registrar bloqueos no concedidos y la duración
   máxima.
7. Ejecutar:

   - `supabase/rehearsal/phase_4a_5b_post_reconciliation.sql`
   - `supabase/rehearsal/phase_4a_5b_security_validation.sql`
   - todos los diagnósticos 4A-5B de `supabase/diagnostics/`;
   - todas las pruebas SQL 4A-5B de `supabase/tests/`.

8. Comparar el snapshot previo con la sección `COUNTS_AFTER`.
9. Ejecutar UAT autenticada con perfiles Admin, Operaciones, Ventas, Pricing y
   Cliente.
10. Descartar la instancia aislada al finalizar.

## Evidencia requerida

- CSV de métricas antes y después.
- Log completo de migraciones con `ON_ERROR_STOP=1`.
- duración por fase y total;
- locks no concedidos y tiempo máximo;
- resultado de cada diagnóstico;
- resultado de pruebas SQL;
- capturas o registro de UAT autenticada;
- versión de CLI, PostgreSQL y commit probado.

## Reconciliación obligatoria

- Conteos de cotizaciones, SI, shipments y bookings.
- Un shipment canónico por SI histórica no eliminada.
- Bookings activos, cancelados y reemplazados.
- Booking primario válido, activo y perteneciente a la SI/shipment.
- Relaciones `shipment_id` consistentes.
- Eventos legacy preservados y eventos canónicos sin duplicación.
- Una revisión `INITIAL` cuando existe schedule conocido.
- Original ETD/ETA preservadas.
- BL estructurados vinculados al mismo booking/SI.
- Portal v2 sin duplicados ni exposición cruzada.
- Cost Validation sin cambio de granularidad.
- Reportes con booking activo y shipment correctos.
- Estado agregado derivado correctamente.
- Registros históricos incompletos clasificados, no inventados.
- RLS y permisos de RPC por rol.

## Go

Solo proceder si:

- todos los conteos explican sus diferencias;
- no hay relaciones cruzadas ni pérdida de historia;
- no hay duplicados activos;
- los backfills ambiguos están clasificados y aprobados;
- todas las funciones v2/RPC requeridas existen y tienen permisos correctos;
- portal, Cost Validation y reportes pasan smoke test;
- no existe booking activo sin shipment;
- el tiempo y los locks caben en la ventana aprobada;
- la UAT autenticada sobre datos representativos fue aprobada.

## No-go

- Cualquier pérdida no explicada de conteos.
- SI sin shipment o booking con shipment incorrecto.
- Primary booking cancelado, reemplazado o de otra SI.
- Duplicados de shipment/SI o revisiones iniciales.
- RLS o RPC accesible por un rol no autorizado.
- Portal con exposición cruzada.
- Reportes o Cost Validation con granularidad alterada.
- Locks que exceden la ventana operacional.
- Solo existe evidencia sintética.

## Rollback del rehearsal

Restaurar o descartar la copia aislada. No intentar deshacer manualmente las
migraciones sobre el mismo snapshot. El rollback de producción se define por
migraciones compensatorias y reversión del frontend, nunca borrando historia.

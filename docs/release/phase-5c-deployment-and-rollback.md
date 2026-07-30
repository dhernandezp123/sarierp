# Despliegue y rollback de Fase 5C

## Estado

- Implementación y pruebas sintéticas locales: completadas.
- Rehearsal 4A–5B sobre datos representativos: pendiente.
- UAT 5C autenticada: pendiente.
- SQL remoto: no aplicado.

## Orden de despliegue

La migración 5C depende de 4A–5B. No desplegarla de forma aislada si el remoto
no contiene esas fases.

1. Tomar backup restaurable y snapshot anonimizado.
2. Ejecutar el rehearsal de
   `docs/release/phase-4a-5b-release-rehearsal.md`.
3. Aplicar, en orden, `20260729120000` a `20260729160000`.
4. Reconciliar conteos, relaciones, RLS, tiempos y locks.
5. Aplicar `20260729170000_booking_cutoffs_and_readiness.sql`.
6. Ejecutar:

   - `booking_cutoff_integrity.sql`;
   - `container_vgm_integrity.sql`;
   - `booking_readiness_consistency.sql`;
   - `pre_shipment_post_validation.sql`;
   - pruebas SQL 4A–5C;
   - `npx supabase db lint --linked --level warning`.

7. Desplegar el frontend compatible.
8. Ejecutar la matriz `docs/uat/phase-5c-booking-readiness.md`.
9. Mantener monitoreo reforzado durante el primer ciclo de cut-offs.

## Datos que crea el backfill

- Crea únicamente requisitos de readiness derivados del template por
  modalidad.
- No inventa cut-offs.
- No inventa VGM.
- No cambia el estado de bookings.
- No autoriza excepciones.
- Es idempotente y no duplica requisitos existentes.

## Go

- Rehearsal 4A–5B aprobado sobre datos representativos.
- Cero relaciones cruzadas o duplicados activos.
- Cada contenedor físico FCL está modelado individualmente.
- Todos los diagnósticos retornan cero hallazgos no explicados.
- Pruebas 4A–5C, TypeScript y build aprobados.
- RLS/RPC validados con Admin, Operaciones y Cliente.
- UAT por modalidad aprobada.
- Los bloqueos de `Listo para Embarque` y `Embarcado` son concretos y
  corregibles.
- Tiempo y locks caben en la ventana de mantenimiento.

## No-go

- El remoto no contiene alguna migración requerida 4A–5B.
- Solo existe evidencia sintética.
- Hay contenedores FCL agregados en una sola fila con cantidad mayor a uno.
- Existen cut-offs/VGM sin booking, shipment o contenedor coherente.
- Un rol Cliente puede escribir evidencia operativa.
- El backfill cambia estados o crea evidencia que no existía.
- Portal expone motivos internos, aprobadores o excepciones.
- Reportes, Cost Validation o portal cambian de cardinalidad sin explicación.

## Monitoreo posterior

- Alertas críticas de cut-offs vencidos y VGM rechazado.
- Conteo de intentos `READINESS_BLOCKED`.
- Bookings en `Listo para Embarque` sin snapshot aprobado.
- Más de un cut-off o VGM vigente para el mismo alcance.
- Errores de RPC por schema cache o permisos.
- Locks prolongados y latencia del evaluador.

## Rollback funcional

1. Revertir el frontend a la versión anterior.
2. Revocar temporalmente los RPC 5C de escritura mediante una migración
   compensatoria.
3. Restaurar el wrapper anterior de `transition_booking_status`,
   `rollover_booking_schedule`, `replace_booking` y
   `record_operational_event`.
4. Mantener tablas, columnas, eventos, snapshots, cut-offs y VGM en modo
   lectura.

No borrar historia ni ejecutar `DROP TABLE` como rollback normal. Si se
requiere restauración total por corrupción, detener escrituras y restaurar el
backup completo de la ventana; no mezclar restauración parcial con datos
posteriores.

## Rollback de un booking

- Corregir cut-offs mediante nueva versión, nunca edición destructiva.
- Corregir VGM mediante supersesión, nunca sobrescritura.
- Revocar una excepción con motivo y reevaluar.
- Si una transición fue incorrecta, usar el flujo canónico permitido; no
  modificar `shipment_status` directamente.

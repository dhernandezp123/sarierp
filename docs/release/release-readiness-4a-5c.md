# Release Readiness 4A–5C

## Veredicto actual

**NO-GO para producción.**

La implementación y el rehearsal sintético local están aprobados. Faltan dos
gates obligatorios:

1. rehearsal sobre copia representativa;
2. UAT autenticada firmada.

No se aplicó SQL ni frontend a producción.

## Estado verificado

- Branch: `main`.
- Baseline Git remoto: `43e11bb`.
- Baseline Supabase remoto: `20260728130000`.
- Migraciones pendientes remotas: exactamente seis, `120000`–`170000`.
- Dry-run remoto: aprobado; no aplicó cambios.
- PostgreSQL local del rehearsal: 17.6.
- Supabase CLI: 2.108.0.
- Rehearsal sintético: `LOCAL_REHEARSAL_OK`.
- Predeploy/postdeploy/security gates: aprobados.
- Suites SQL 4A, 4B, 4C, 5A, 5B y 5C: aprobadas.
- Diagnósticos 4A–5C: cero hallazgos sobre base local vacía.
- DB lint: sin errores ni warnings.
- `npx tsc --noEmit`: aprobado.
- `npm run build`: aprobado; 66/66 páginas.
- ESLint de componentes/helpers nuevos de Operaciones: aprobado.
- ESLint global conserva deuda preexistente: 384 hallazgos
  (312 errores y 72 warnings). No se amplió el release para corregir módulos
  ajenos; debe quedar como riesgo aceptado o gate adicional de la organización.

La evidencia cruda se genera en `release-evidence/` y está excluida de Git
porque una ejecución representativa puede contener conteos o identificadores.

## Paquete ejecutable

- Runner: `scripts/release/rehearse-phase-4a-5c.ps1`.
- Predeploy:
  - `supabase/release/phase_4a_5c/00_predeploy_gate.sql`;
  - `supabase/release/phase_4a_5c/01_predeploy_counts.sql`.
- Postdeploy:
  - `supabase/release/phase_4a_5c/02_postdeploy_gate.sql`;
  - `supabase/release/phase_4a_5c/03_postdeploy_counts.sql`;
  - `supabase/release/phase_4a_5c/04_security_gate.sql`.
- Inventario/hashes:
  `docs/release/migration-inventory-4a-5c.md`.
- UAT:
  `docs/uat/release-4a-5c-authenticated.md`.
- Rollback:
  `docs/release/rollback-runbook-4a-5c.md`.

## Ejecución reproducible

En una copia local/sandbox:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/release/rehearse-phase-4a-5c.ps1 `
  -EvidenceDirectory release-evidence/phase-4a-5c-representative
```

El runner:

1. resetea local exactamente a `20260728130000`;
2. ejecuta gate y conteos previos;
3. aplica únicamente 4A–5C;
4. ejecuta gate, conteos y seguridad posteriores;
5. ejecuta las seis suites SQL;
6. ejecuta quince diagnósticos;
7. ejecuta DB lint;
8. guarda hashes y resultado.

Para una copia representativa ya restaurada, no ejecutar un reset que destruya
el snapshot. Ejecutar manualmente los mismos SQL/órdenes sobre esa instancia o
adaptar el runner a su URL aislada, con aprobación del DBA.

## Conteos que deben conciliarse

- quotations;
- shipping instructions;
- shipments creados por backfill;
- bookings y bookings activos/históricos;
- contenedores y filas con cantidad distinta de uno;
- documentos y BL;
- eventos canónicos;
- revisiones iniciales;
- requisitos de readiness;
- cut-offs/VGM/excepciones/snapshots, que deben iniciar en cero salvo evidencia
  previamente cargada fuera del release.

Diferencias esperadas:

- un shipment por SI histórica activa;
- una revisión `INITIAL` por booking con evidencia de itinerario;
- requisitos de readiness faltantes según modalidad.

Diferencias no permitidas:

- pérdida de filas legacy;
- duplicados activos;
- relaciones cruzadas;
- cut-offs o VGM inventados;
- cambio silencioso de estados;
- exposición adicional de privilegios.

## GO

Solo aprobar si:

- hashes coinciden;
- baseline exacto;
- copia representativa restaurable;
- pre/post gates aprobados;
- todos los conteos explicados y firmados;
- cero hallazgos no aceptados;
- locks y duración caben en ventana;
- RLS/RPC aprobados por rol;
- UAT completa y firmada;
- rollback ensayado o revisado por DBA;
- commit candidato es el mismo probado.
- deuda ESLint global aceptada formalmente o resuelta fuera de este release.

## NO-GO

- falta copia representativa;
- solo existe evidencia sintética;
- UAT pendiente;
- hash diferente;
- objeto manual colisiona con una migración;
- baseline remoto distinto;
- relación cruzada o duplicado;
- contenedor FCL agregado impide VGM físico;
- RLS permite acceso no autorizado;
- backfill altera estados o inventa evidencia;
- portal/reportes cambian cardinalidad sin explicación;
- locks exceden ventana;
- no existe backup restaurable.

## Secuencia de producción — bloqueada

La siguiente secuencia es documental y no está autorizada todavía:

1. congelar escrituras y confirmar backup;
2. volver a validar baseline/hashes;
3. ejecutar predeploy y guardar evidencia;
4. aplicar las seis migraciones en orden;
5. ejecutar postdeploy, conteos, seguridad y diagnósticos;
6. tomar decisión GO/rollback antes de desplegar frontend;
7. desplegar exactamente el commit candidato;
8. ejecutar smoke/UAT crítica;
9. reabrir escrituras y monitorear.

Hasta aprobar rehearsal representativo y UAT, no ejecutar el paso 4.

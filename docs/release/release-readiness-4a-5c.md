# Release Readiness 4A–5C

## Veredicto actual

**SQL 4A–5C aplicado y postdeploy aprobado. Frontend pendiente.**

Las seis migraciones están registradas en producción y los gates estructurales,
de seguridad, conteos y diagnósticos aprobaron. El frontend no se desplegó
porque el repositorio no contiene un destino de hosting verificable y la única
cuenta Vercel autenticada no incluye un proyecto Sari ERP. No crear ni enlazar
un proyecto nuevo por suposición.

## Estado verificado

- Branch: `main`.
- Commit frontend aprobado: `856e2a4d347d9a27954786e0bb18c2febeb53e37`.
- Forward-fix 4A: `229d07b9ecbe148b6342ae9ae7153bc561e63017`.
- Forward-fix 5C: `618d3dd`.
- Baseline Supabase remoto previo: `20260728130000`.
- Baseline Supabase remoto actual: `20260729170000`.
- Historial remoto: las seis migraciones `120000`–`170000` alineadas.
- PostgreSQL local del rehearsal: 17.6.
- Supabase CLI: 2.108.0 para migraciones y 2.110.0 para consultas remotas.
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
- Producción: `POSTDEPLOY_GATE_OK`.
- Producción: 15 diagnósticos ejecutados sentencia por sentencia; todas las
  consultas de integridad devolvieron cero filas.
- Producción: 27 RPC del release son `SECURITY DEFINER`, ejecutables por
  `authenticated` y ninguna por `anon`.
- Producción: cero permisos directos `INSERT/UPDATE/DELETE` para
  `anon/authenticated` sobre tablas 5C.
- Producción: 12 SI = 12 shipments; 4 bookings = 4 revisiones; 48 requisitos;
  cero bookings/eventos sin shipment y cero diferencias de clasificación.
- El único `MANUAL_REVIEW` era el `master_bl` legacy de `RT0020`. El MBL
  canónico en `bills_of_lading`, estado `MBL Validado`, coincide con el cache
  del booking; el valor de SI es legacy obsoleto y no requiere corrección.

La evidencia cruda se genera en `release-evidence/` y está excluida de Git
porque una ejecución representativa puede contener conteos o identificadores.

## Registro de ejecución remota del 29/07/2026

- Proyecto enlazado confirmado: `sarierp` producción,
  `fwspgdzvlbtbgiupvrzo`.
- Commit candidato inicial confirmado y publicado:
  `856e2a4d347d9a27954786e0bb18c2febeb53e37`.
- El primer `db push` falló dentro de 4A al ejecutar el backfill mediante una
  RPC que requiere autenticación interactiva.
- La transacción fue revertida. `migration list` siguió terminando en
  `20260728130000` y un dump de esquema posterior no encontró objetos parciales
  de 4A.
- Se aplicó una corrección imprescindible a la migración 4A todavía no
  registrada: el backfill ahora realiza directamente la actualización y su
  auditoría, sin depender de `auth.uid()`.
- El paquete corregido volvió a aprobar el rehearsal completo:
  `LOCAL_REHEARSAL_OK`.
- El segundo `db push` aplicó 4A–5B y se detuvo en 5C porque el backfill real
  dejó eventos de constraint triggers diferidos antes de habilitar RLS.
- La transacción de 5C fue revertida; `migration list` confirmó 4A–5B
  registradas y 5C pendiente, y el dump remoto no encontró objetos 5C.
- El forward-fix mínimo fuerza `SET CONSTRAINTS ALL IMMEDIATE` después del
  backfill y antes de los `ALTER TABLE`.
- El ensayo local equivalente, dentro de una única transacción y con un
  booking FCL existente, confirmó `COMMIT`, 12 requisitos, RLS habilitada,
  `POSTDEPLOY_GATE_OK`, seguridad aprobada y cero hallazgos 5C.
- No se desplegó frontend ni se crearon operaciones durante los incidentes.

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

## Secuencia de producción

1. congelar escrituras y confirmar backup;
2. volver a validar baseline/hashes;
3. ejecutar predeploy y guardar evidencia;
4. aplicar las seis migraciones en orden;
5. ejecutar postdeploy, conteos, seguridad y diagnósticos;
6. tomar decisión GO/rollback antes de desplegar frontend;
7. desplegar exactamente el commit candidato;
8. ejecutar smoke/UAT crítica;
9. reabrir escrituras y monitorear.

Los pasos 4–6 se ejecutaron y aprobaron el 29/07/2026, después de confirmar
proyecto, baseline, hashes y dry-run. No quedó evidencia automatizada en este
repositorio del backup/congelamiento de los pasos 1–3. El paso 7 permanece
bloqueado hasta identificar el proyecto/destino de hosting correcto. La UAT
autenticada crítica debe completarse inmediatamente después del despliegue
frontend y antes de reabrir el release a uso operativo general.

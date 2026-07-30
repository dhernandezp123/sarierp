# Inventario exacto de migraciones 4A–5C

Fecha de congelamiento: 29/07/2026.

Baseline remoto verificado en modo de solo lectura:
`20260728130000_copy_mbl_containers_to_hbl.sql`.

`npx supabase db push --linked --dry-run` propone exactamente las seis
migraciones siguientes y ninguna adicional.

| Orden | Fase | Migración | SHA-256 |
|---:|---|---|---|
| 1 | 4A | `20260729120000_booking_canonical_foundation.sql` | `2E21D65AD37C3BBA53B7433D09894FACCCF8746E5D798E257E6E4319898E95B3` |
| 2 | 4B | `20260729130000_booking_canonical_consumers.sql` | `6E6492EA9AD84316CB2BDC40F793B0B3303A0643908979F1936E0D5774E83E05` |
| 3 | 4C | `20260729140000_canonical_operational_events.sql` | `33A00C76FFC39CE03B5CCD72DF6AECE4CF5318B8B0652768117D2B5B19927B2F` |
| 4 | 5A | `20260729150000_shipments_foundation.sql` | `8558521D4A4FD0FF1D52EF0420AEC264E8A76726FEDE44384298E0DA11B54A46` |
| 5 | 5B | `20260729160000_booking_schedule_revisions.sql` | `09EC3C22A6CF082BA64E3BDF2F29FFD35B6161F670B53076E6B5A9050FFFA477` |
| 6 | 5C | `20260729170000_booking_cutoffs_and_readiness.sql` | `8A9BB9F793FF419593D9A1646F889568B30035B16B3600EEA297561B3BFB3925` |

## Responsabilidad y dependencias

### 4A — Booking canónico

- Agrega `shipping_instructions.primary_booking_id`.
- Establece creación, actualización y selección primaria por RPC.
- Conserva columnas legacy; no las elimina.
- Depende del baseline `20260728130000`.

### 4B — Consumidores canónicos

- Migra portal, sincronización y proyecciones desde SI hacia bookings.
- No crea un agregado operativo nuevo.
- Depende de los RPC y de `primary_booking_id` de 4A.

### 4C — Timeline y transiciones

- Crea `operational_events`, RLS, backfill y timeline canónico.
- Controla transiciones y finalización de SI.
- Depende del booking canónico 4A–4B.

### 5A — Shipment canónico

- Crea `shipments`.
- Agrega `shipment_id` a bookings y eventos.
- Ejecuta backfill SI→shipment y crea la RPC idempotente de conversión.
- Depende de eventos 4C y de la relación booking/SI de 4A.

### 5B — Revisiones y rollover

- Agrega ciclo de vida y relaciones de reemplazo a bookings.
- Crea `booking_schedule_revisions` y su backfill `INITIAL`.
- Controla revisión, rollover, reemplazo, cancelación y corrección.
- Depende de `shipments` y `operational_events`.

### 5C — Cut-offs, VGM y readiness

- Crea cut-offs, VGM, requisitos, excepciones y snapshots.
- Envuelve transiciones, rollover y reemplazo con reglas de readiness.
- El backfill crea únicamente requisitos faltantes.
- No inventa cut-offs/VGM ni cambia estados.
- Depende de toda la cadena 4A–5B.

## Regla de integridad del paquete

Antes de cada rehearsal o despliegue volver a calcular:

```powershell
Get-FileHash -Algorithm SHA256 `
  supabase/migrations/20260729120000_booking_canonical_foundation.sql,`
  supabase/migrations/20260729130000_booking_canonical_consumers.sql,`
  supabase/migrations/20260729140000_canonical_operational_events.sql,`
  supabase/migrations/20260729150000_shipments_foundation.sql,`
  supabase/migrations/20260729160000_booking_schedule_revisions.sql,`
  supabase/migrations/20260729170000_booking_cutoffs_and_readiness.sql
```

Si cambia un hash después de aprobar rehearsal o UAT, toda aprobación queda
invalidada y debe repetirse.

No renombrar, reordenar, editar ni añadir migraciones dentro de este paquete
sin documentar el hallazgo imprescindible y reiniciar Release Readiness.

## Corrección imprescindible del 29/07/2026

El primer intento de `db push` remoto se detuvo dentro de 4A porque el backfill
invocaba una RPC interactiva que exige una sesión autenticada. El rol de
migración remoto no cumple esa precondición. PostgreSQL revirtió la migración
completa y `migration list` confirmó que ninguna versión 4A–5C quedó registrada.

Se reemplazó únicamente esa llamada del backfill por el `UPDATE` y el registro
de auditoría equivalentes dentro de la propia migración todavía no aplicada. No
se agregó, renombró ni reordenó ninguna migración. El nuevo hash anterior quedó
congelado después de repetir el rehearsal completo con resultado
`LOCAL_REHEARSAL_OK`.

El segundo intento aplicó 4A–5B y se detuvo transaccionalmente dentro de 5C:
el backfill con bookings reales dejó eventos de constraint triggers diferidos
antes de `ENABLE ROW LEVEL SECURITY`. Se agregó `SET CONSTRAINTS ALL IMMEDIATE`
entre el backfill y los `ALTER TABLE`, sin cambiar datos ni relaciones. El
ensayo equivalente dentro de una sola transacción, con un booking FCL y un
contenedor existentes, generó 12 requisitos, habilitó RLS y confirmó `COMMIT`.
Los gates, seguridad, conteos, suite 5C y diagnósticos posteriores aprobaron.

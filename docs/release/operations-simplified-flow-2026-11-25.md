# Publicación UX-OPS-04 — flujo operativo simplificado (25/11/2026)

El usuario autorizó merge y publicación en Production. La publicación comprende
la migración `20261125120000_operations_simplified_flow.sql` (PR #7) y su frontend.

## Preflight (Production `fwspgdzvlbtbgiupvrzo`)

- Ambiente `production`; 191 migraciones, última `20261123210000`.
- `advance_booking_flow` y `submit_booking_vgm_batch` no existían.
- Huella de `transition_bill_of_lading`: `a8ff77dae8acde0ddac97d9d29d817bc`, idéntica
  a la instalación limpia del repositorio en el stack aislado.
- Inventario: 11 bookings, 8 BL, 3 registros VGM, 80 eventos operativos.
- Respaldo de BD previo: `sarierp-backups` run 45651045947 (success) y salud
  posterior (success). Sin cambios de Storage.
- CI del PR #7 (application y database) en verde.

## Paquete

`node scripts/prepare-operations-flow-release.mjs` genera el SQL y su manifiesto en
`.ua/intermediate/` sin conectar. Una sola transacción: bloqueo consultivo,
guardas de ambiente, tenant, última versión, ausencia previa de las funciones y
huella de la función de BL; migración; registro de la fuente exacta en
`supabase_migrations.schema_migrations`; verificación de funciones y permisos
(sin `anon`, con `authenticated`) y de conteos y huellas de bookings, BL, VGM y
eventos sin cambios; recarga de PostgREST. Ensayado en el stack aislado con el
mismo estado previo (las guardas de ambiente/tenant no aplican allí): se aplica,
un segundo intento se detiene por historial y la suite SQL del flujo pasa.

## Resultado

| Comprobación | Resultado |
| --- | --- |
| Migración | 192 migraciones, última `20261125120000`; SHA-256 de la fuente registrada `a1dedee0500f4f866406a3ee26ecf5ac80a3e38d74a7ba305a216f80fbfec051` |
| Funciones | `advance_booking_flow` y `submit_booking_vgm_batch` presentes; sin EXECUTE anónimo; EXECUTE para `authenticated` |
| HBL | `transition_bill_of_lading` acepta `HBL Draft → Aprobado por Cliente` |
| Datos | 11 bookings, 8 BL, 3 VGM y 80 eventos sin cambios |
| Frontend | `main` adelantado por fast-forward a `1f1961a`; Vercel Production success |
| Smoke anónimo | `/` y `/login` 200; `/operations/dashboard`, `/operations/bookings` e `/invoicing` 404 sin sesión (rutas protegidas) |

## Recuperación

Si fuera necesario volver atrás: restaurar el despliegue anterior de Vercel. Las
funciones nuevas no se usan sin el frontend nuevo y la transición adicional del
HBL no afecta a los datos existentes, así que no se requiere revertir SQL; no
borrar historial de migraciones. UAT autenticada (booking FCL completo con VGM real
y un HBL) pendiente.

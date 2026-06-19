# PHASES.md — Seguimiento de Fases de Desarrollo

Este archivo es la fuente de verdad del estado de desarrollo del ERP.
Actualizar al finalizar cada fase o sesión de trabajo.
Leer este archivo al inicio de cada nueva sesión para recuperar contexto.

---

## Fases completadas

### Fase 1 — Componentes UI reutilizables
**Estado:** ✅ Completado | Commit: `8b557b7`

- `EmptyState` — estado vacío con icono, título, descripción y acción opcional
- `TableSkeleton` — skeleton animado para tablas en carga
- `ConfirmDialog` — modal de confirmación (reemplaza window.confirm)
- `Breadcrumbs` — navegación contextual en páginas de detalle
- `ui-classes.ts` — agregados `fieldClassSm` y `tableHeaderClass`

### Fase 2 — UX Audit: loading states, empty states, breadcrumbs
**Estado:** ✅ Completado | Commits: `8b557b7`, `5d5d5de`

Páginas actualizadas:
- `clientes/page.tsx` — TableSkeleton + EmptyState diferenciado
- `operations/shipping-instructions/page.tsx` — TableSkeleton + EmptyState + fix filtros assignFilter
- `alerts/page.tsx` — reestructura loading/empty fuera del table, EmptyState diferenciado
- `cost-validation/page.tsx` — TableSkeleton + AccessDenied rediseñado + EmptyState
- `dashboard/page.tsx` — ConfirmDialog para eliminar tareas
- `operations/bookings/page.tsx` — TableSkeleton
- `operations/dashboard/page.tsx` — TableSkeleton con placeholders KPI
- `admin/users/page.tsx` — TableSkeleton
- `historico/page.tsx` — TableSkeleton + polish empty state

Breadcrumbs añadidos en:
- `clientes/[id]/page.tsx`
- `clientes/[id]/edit/page.tsx`
- `invoicing/[id]/page.tsx`
- `operations/shipping-instructions/[id]/page.tsx`
- `quotations/[id]/page.tsx`
- `quotations/[id]/edit/page.tsx`

### Fase 3 — Landing page ForwardersLanding
**Estado:** ✅ Completado | Commit: `8b557b7`

- Mobile hamburger nav
- Formulario de contacto conectado a Supabase tabla `leads`
- Hero en español, badge, copy "Creado por Forwarders para Forwarders"
- Tabla de comparación expandida a 9 filas
- 5 tarjetas de features (añadido "Documentos y PDFs")
- Footer actualizado

### Fase 4 — Base de datos: Miami + Rol Cliente
**Estado:** ✅ Completado

Tablas creadas:
- `miami_packages` — tracking, carrier, peso, dims, status, warehouse_number, cliente_id, manifest_id
- `miami_manifests` — manifest_number (MAN-YYYYMMDD-NNN), status, received_by
- `miami_pre_alerts` — cliente_id, tracking_number, carrier, status, matched_package_id
- `client_addresses` — dirección Miami formato casillero
- `miami_incidencias` — package_id, tipo, descripcion, fotos, status
- `client_notifications` — profile_id, title, body, type, entity_type, entity_id, read_at
- `client_pickup_requests` — cliente_id, address, pickup_date, status, notes
- Bucket `miami-package-photos` en Supabase Storage
- RLS: cliente ve solo sus propios datos via `current_user_cliente_id()` function
- RPCs: `next_warehouse_number()` → `SPS-NNNNN`, `next_manifest_number()` → `MAN-YYYYMMDD-NNN`

### Fase 5 — Módulo Bodega Miami (para rol Operaciones/Admin)
**Estado:** ✅ Completado | Commit: `1fd68dc`

Páginas implementadas:
- `/miami` — Dashboard con métricas del día
- `/miami/ingreso` — Ingreso individual con auto-focus para scanner, asignación a cliente
- `/miami/manifiestos` — Lista de manifiestos con filtros
- `/miami/manifiestos/[id]` — Detalle: scan en lote, tabla de paquetes, asignación por cliente, cierre de manifiesto
- Sidebar actualizado con sección Miami Bodega
- Permisos: rutas `/miami` accesibles para Admin y Operaciones

### Fase 6 — Portal Cliente: Auth + Layout + Perfil
**Estado:** ✅ Completado | Commit: `ebb60cd`

- `src/app/portal/layout.tsx` — Shell del portal, guard rol=Cliente, top nav + mobile tabs
- `src/app/portal/login/page.tsx` — Login sin branding Sari Express
- `src/app/portal/page.tsx` — Dashboard con stats, paquetes, pre-alertas, banner dirección
- `src/app/portal/perfil/page.tsx` — Perfil completo con todas las secciones
- `src/app/portal/perfil/direccion-miami/page.tsx` — CRUD dirección Miami, copy-to-clipboard

### Fase 7 — Portal Cliente: Paquetería + Pre-alertas + Incidencias
**Estado:** ✅ Completado | Commit: `4c8eb56`

- `src/app/portal/paquetes/page.tsx` — Lista con búsqueda y filtros de estado
- `src/app/portal/paquetes/[id]/page.tsx` — Detalle con fotos (signed URLs), historial incidencias
- `src/app/portal/pre-alertas/page.tsx` — Lista con filtros, link a paquete matcheado
- `src/app/portal/pre-alertas/nueva/page.tsx` — Formulario registro pre-alerta
- `src/app/portal/incidencias/page.tsx` — Lista de incidencias activas
- `src/app/portal/incidencias/nueva/page.tsx` — Reporte con preselect via ?packageId=

### Fase 8 — Portal Cliente: Inicio + Funcionalidades extra
**Estado:** ✅ Completado | Commit: `cf8fba8`

- `sql/20260618_phase8_pickup_requests.sql` — tabla `client_pickup_requests` con RLS
- `src/app/portal/calculadora/page.tsx` — Calculadora FT³/CBM/dim-weight (in/cm toggle)
- `src/app/portal/contacto/page.tsx` — Oficinas Miami + TGU, horarios, Maps + Waze
- `src/app/portal/info/restringidos/page.tsx` — 6 categorías de material restringido
- `src/app/portal/info/terminos/page.tsx` — 10 secciones T&C
- `src/app/portal/info/nosotros/page.tsx` — Sobre nosotros con stats y valores
- `src/app/portal/pickup/page.tsx` — CRUD solicitudes de pickup
- `src/app/portal/perfil/page.tsx` — Reescritura completa: cuenta, dirección, herramientas, info, contraseña, cierre

### Fase 9 — Notificaciones in-app
**Estado:** ✅ Completado | Commit: `caffe7a`

- `src/lib/client-notifications.ts` — `notifyClientPackageAssigned()` (diferente de notifications.ts que es para ERP staff)
- `src/hooks/useClientNotifications.ts` — Supabase Realtime subscription, devuelve unreadCount
- `src/app/portal/notificaciones/page.tsx` — Lista, mark individual/all read, navega a entidad
- `src/app/portal/layout.tsx` — Integración campana + badge en top nav y mobile tab
- `src/app/(protected)/miami/ingreso/page.tsx` — Llama `notifyClientPackageAssigned` en asignación inmediata
- `src/app/(protected)/miami/manifiestos/[id]/page.tsx` — Llama `notifyClientPackageAssigned` en handleAssign

### Fase 10 — Integración + Auto-match + Pulido
**Estado:** ✅ Completado (pendiente de commit)

- `sql/20260618_phase10_auto_match.sql` — Trigger BEFORE INSERT en `miami_packages`:
  si el tracking coincide con una `miami_pre_alerts` pendiente, asigna automáticamente
  al cliente (sets cliente_id, warehouse_number, status='Asignado'), cierra la pre-alerta
  y envía notificación in-app al portal
- `src/app/(protected)/miami/ingreso/page.tsx` — Detecta auto-match: si pkg.status='Asignado'
  y no hubo asignación explícita → toast especial con WH#
- `src/app/(protected)/admin/users/page.tsx` — Agrega rol 'Cliente' (cyan badge),
  join con clientes, modal "Vincular a cliente" para linkear profiles.cliente_id
- `src/app/portal/paquetes/page.tsx` — Paginación server-side (PAGE_SIZE=20) con "Cargar más"

---

## Pendiente técnico

- **Push a GitHub:** commits `cf8fba8` (Fase 8), `caffe7a` (Fase 9), y Fase 10 pendientes de push
  → Ejecutar: `git push origin main`
- **SQL migrations ejecutar en Supabase:**
  - `sql/20260618_phase10_auto_match.sql` — trigger auto-match pre-alertas

---

## Roadmap visual

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Componentes UI reutilizables | ✅ |
| 2 | UX Audit general | ✅ |
| 3 | Landing page | ✅ |
| 4 | BD: Miami + Rol Cliente | ✅ |
| 5 | Módulo Bodega Miami (operativo) | ✅ |
| 6 | Portal Cliente: Auth + Perfil | ✅ |
| 7 | Portal Cliente: Paquetería + Pre-alertas | ✅ |
| 8 | Portal Cliente: Inicio + Extras | ✅ |
| 9 | Notificaciones (in-app) | ✅ |
| 10 | Integración + Auto-match + Pulido | ✅ |

---

## Decisiones técnicas confirmadas

- **Ingreso de trackings:** combinación escáner de barras + tipeo manual
- **Tipo de lote:** ambos (carga mezclada de varios clientes Y múltiples paquetes de un cliente)
- **Datos por paquete:** tracking, carrier, peso, dimensiones, fotos, descripción
- **Match cliente:** búsqueda manual por nombre/empresa + auto-match via pre-alerta (trigger DB)
- **Número WH:** `SPS-NNNNN` — secuencial global, generado al asignar al cliente
- **Número manifiesto:** `MAN-YYYYMMDD-NNN`
- **Portal cliente:** misma app Next.js, rol `Cliente` en Supabase, ruta `/portal/`
- **Notificaciones:** in-app (Supabase Realtime) implementado · email/WhatsApp/Push futuro
- **Fotos:** upload desde archivo local (cámara externa USB/SD); futuro: cámara dedicada
- **Biométrico / Actualizaciones:** placeholders en web, reales en la app móvil futura
- **Branding en portal:** "Mi Paquetería" — sin nombre "Sari" en páginas públicas/marketing
- **client-notifications.ts:** archivo separado de notifications.ts (ERP staff usa tabla diferente)

---

## Stack del proyecto

- Next.js 16 + App Router
- TypeScript strict
- TailwindCSS 4
- Supabase (PostgreSQL + Auth + RLS + Storage)
- Sonner (toasts)
- Lucide React (iconos)
- Migraciones SQL en `/sql/`
- UI classes en `src/lib/ui-classes.ts`
- Componentes reutilizables en `src/components/ui/`
- Landing page en `src/components/marketing/ForwardersLanding.tsx`

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

---

## Fases pendientes

### Fase 4 — Base de datos: Miami + Rol Cliente
**Estado:** 🔲 Pendiente — siguiente a implementar

Scope:
- Nueva tabla `miami_packages`:
  - tracking_number, carrier, weight_lbs, weight_kg, length_in, width_in, height_in,
    ft3 (calculado), cbm (calculado), description, photos (text[]), status, warehouse_number,
    cliente_id (nullable hasta asignar), manifest_id (nullable si es ingreso individual),
    received_at, received_by (profile_id), assigned_at, assigned_by, notes
- Nueva tabla `miami_manifests`:
  - manifest_number (formato: MAN-20250618-001, fecha + correlativo del día),
    status (Abierto / Cerrado), received_by, created_at, closed_at, total_packages, notes
- Nueva tabla `miami_pre_alerts`:
  - cliente_id, tracking_number, carrier, description, expected_date,
    status (Pendiente / Recibido / Cancelado), created_at
- Nueva tabla `client_addresses` (dirección Miami de entrega):
  - cliente_id, nombre_completo, company_name, address_line, suite, city, state, zip,
    phone, is_active
- Nueva tabla `miami_incidencias`:
  - package_id, cliente_id, tipo (Dañado / Incompleto / No reconozco / Otro),
    descripcion, fotos (text[]), status (Abierta / En revisión / Resuelta), created_at
- Nueva tabla `client_notifications`:
  - profile_id, title, body, type, entity_id, entity_type, read_at, created_at
- Formato número de warehouse: `SPS-NNNNN` (ej. SPS-00001, secuencial global)
- Formato número de manifiesto: `MAN-YYYYMMDD-NNN` (ej. MAN-20250618-001)
- Nuevo rol `Cliente` en tabla `profiles`
- Campo `cliente_id uuid` en `profiles` (nullable) → vincula usuario portal a ficha cliente
- Supabase Storage bucket `miami-package-photos`
- RLS: cliente solo ve sus propios paquetes, pre-alertas, incidencias y notificaciones
- Archivos SQL en `/sql/`

---

### Fase 5 — Módulo Bodega Miami (para rol Operaciones/Admin)
**Estado:** 🔲 Pendiente

Ruta base: `/miami/`
Acceso: Admin, Operaciones

Sub-páginas:
- `/miami` — Dashboard: paquetes sin asignar, manifiestos abiertos, métricas del día
- `/miami/ingreso` — Ingreso individual (tracking + carrier + peso + dims + foto + cliente opcional)
- `/miami/manifiestos` — Lista de manifiestos
- `/miami/manifiestos/[id]` — Detalle de manifiesto: tabla de paquetes + asignación a clientes
- `/miami/manifiestos/nuevo` — Crear manifiesto + escanear paquetes en lote
- `/miami/paquetes` — Todos los paquetes con filtros (sin asignar, por cliente, por fecha)
- `/miami/paquetes/[id]` — Detalle individual

Lógica clave:
- Ingreso individual: puede asignar al cliente al momento o dejarlo sin asignar
- Ingreso por lote: crea manifiesto → agrega paquetes sin asignar → cierra manifiesto
- Asignación posterior: en detalle del manifiesto o del paquete, buscar cliente por nombre
- Número WH (SPS-NNNNN) se genera al momento de asignar al cliente (no al ingresar)
- Auto-calcula FT3 = (L × W × H) / 1728, CBM = (L_cm × W_cm × H_cm) / 1000000
- Fotos: upload desde archivo local (cámara externa); futuro: cámara dedicada con cubicaje automático

---

### Fase 6 — Portal Cliente: Auth + Layout + Perfil
**Estado:** 🔲 Pendiente

Ruta base: `/portal/`
Rol: `Cliente` en Supabase Auth / profiles

Sub-páginas:
- `/portal/login` — Login exclusivo clientes (separado del login del ERP)
- `/portal` — Inicio (ver Fase 8)
- `/portal/perfil` — Editar datos personales
- `/portal/perfil/direccion-miami` — Mi dirección de entrega Miami (formato casillero)
- Formato dirección Miami:
  ```
  [Nombre Cliente]
  C/O Sari Express
  [Dirección bodega Miami]
  Casillero: SPS-XXXXX
  Miami, FL XXXXX, USA
  ```
- Sección de configuración con placeholders:
  - "Activación biométrica" → "Próximamente en app móvil"
  - "Buscar actualizaciones" → "Próximamente en app móvil"
  - "Tutoriales de uso" → placeholder
  - "Restablecer tutoriales" → placeholder
  - Versión de la app en el footer
  - Botón rojo "Cerrar Sesión"
- Admin puede crear cuentas de portal desde el panel `/admin/users`

---

### Fase 7 — Portal Cliente: Paquetería + Pre-alertas + Incidencias
**Estado:** 🔲 Pendiente

Sub-páginas:
- `/portal/paquetes` — Lista de paquetes asignados al cliente
- `/portal/paquetes/[id]` — Detalle: tracking, peso, dims, fotos, estado, historial, WH#
- `/portal/pre-alertas` — Lista de pre-alertas registradas
- `/portal/pre-alertas/nueva` — Registrar pre-alerta (tracking + carrier + descripción + fecha estimada)
- `/portal/incidencias` — Lista de incidencias activas ("Gestiona tus paquetes con incidencias")
- `/portal/incidencias/nueva` — Reportar problema: tipo, descripción, fotos, paquete afectado

---

### Fase 8 — Portal Cliente: Inicio + Funcionalidades extra
**Estado:** 🔲 Pendiente

Pantalla de Inicio `/portal`:
- Resumen: paquetes en bodega, pre-alertas pendientes, incidencias activas
- Calculadora FT3 / CBM (largo × ancho × alto, conversión en tiempo real)
- Bookings FCL (shipping instructions del cliente filtradas)
- Solicitudes de Pickup (formulario básico: dirección de origen, fecha, descripción)
- Contáctanos: dirección SPS + TGU con horarios + botón Google Maps / Waze

Sección informativa:
- Materiales Restringidos (lista estática, editable por Admin)
- Términos y Condiciones (contenido estático)
- Sobre Nosotros (contenido estático)

---

### Fase 9 — Notificaciones
**Estado:** 🔲 Pendiente

In-app (Fase 9a):
- Tabla `client_notifications` (creada en Fase 4)
- Campana en header del portal con badge de no leídas
- Marcar como leído individual o todo
- Trigger: al asignar paquete → crear notificación in-app al cliente

Email automático (Fase 9b):
- Al asignar paquete → enviar email con detalle (tracking, WH#, peso, dims)
- Proveedor: Supabase Edge Function + Resend (o SendGrid)
- Confirmar proveedor de email antes de implementar

WhatsApp / SMS (Fase 9c — FUTURO):
- No hay cuenta Twilio ni WhatsApp Business API actualmente
- Dejar estructura lista (campo `whatsapp_number` en perfil cliente)
- Implementar cuando se contrate el servicio

Push notifications (Fase 9d — FUTURO):
- Para la app móvil futura
- Dejar tabla `push_tokens` lista en BD

---

### Fase 10 — Integración + Auto-match + Pulido
**Estado:** 🔲 Pendiente

- Auto-match: al ingresar paquete, si existe pre-alerta con ese tracking → asignar automáticamente al cliente
- Vinculación Admin→Portal: crear cuenta de portal para un cliente existente desde `/admin/users`
- Paginación en listas largas (paquetes, pre-alertas, notificaciones)
- Prueba de flujo completo: bodega ingresa → cliente recibe notificación → cliente ve paquete
- Pulido visual y consistencia con el resto del ERP

---

## Roadmap visual

| Fase | Contenido | Est. sesiones | Estado |
|------|-----------|---------------|--------|
| 1 | Componentes UI reutilizables | 1 | ✅ |
| 2 | UX Audit general | 2 | ✅ |
| 3 | Landing page | 1 | ✅ |
| 4 | BD: Miami + Rol Cliente | 1 | 🔲 |
| 5 | Módulo Bodega Miami (operativo) | 2 | 🔲 |
| 6 | Portal Cliente: Auth + Perfil | 1-2 | 🔲 |
| 7 | Portal Cliente: Paquetería + Pre-alertas | 1-2 | 🔲 |
| 8 | Portal Cliente: Inicio + Extras | 1-2 | 🔲 |
| 9 | Notificaciones (in-app + email) | 1 | 🔲 |
| 10 | Integración + Auto-match + Pulido | 1 | 🔲 |

---

## Decisiones técnicas confirmadas

- **Ingreso de trackings:** combinación escáner de barras + tipeo manual
- **Tipo de lote:** ambos (carga mezclada de varios clientes Y múltiples paquetes de un cliente)
- **Datos por paquete:** tracking, carrier, peso, dimensiones, fotos, descripción
- **Match cliente:** búsqueda manual por nombre/empresa (+ auto-match via pre-alerta en Fase 10)
- **Número WH:** `SPS-NNNNN` — secuencial global, generado al asignar al cliente
- **Número manifiesto:** `MAN-YYYYMMDD-NNN`
- **Portal cliente:** misma app Next.js, rol `Cliente` en Supabase, ruta `/portal/`
- **Notificaciones:** in-app + email (ahora) · WhatsApp/SMS + Push (futuro, sin API aún)
- **Fotos:** upload desde archivo local (cámara externa USB/SD); futuro: cámara dedicada con cubicaje automático live
- **Biométrico / Actualizaciones:** placeholders en web, reales en la app móvil futura
- **WhatsApp Business API / Twilio:** no disponible aún, se deja estructura lista

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

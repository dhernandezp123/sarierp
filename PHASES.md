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

Páginas actualizadas con TableSkeleton + EmptyState:
- `clientes/page.tsx`, `operations/shipping-instructions/page.tsx`
- `alerts/page.tsx`, `cost-validation/page.tsx`, `dashboard/page.tsx`
- `operations/bookings/page.tsx`, `operations/dashboard/page.tsx`
- `admin/users/page.tsx`, `historico/page.tsx`

Breadcrumbs añadidos en: clientes, invoicing, shipping-instructions, quotations (ver/editar).

### Fase 3 — Landing page ForwardersLanding
**Estado:** ✅ Completado | Commit: `8b557b7`

- Mobile hamburger nav, formulario de contacto → tabla `leads`
- Hero en español, tabla de comparación 9 filas, 5 tarjetas de features, footer

### Fase 4 — Base de datos: Miami + Rol Cliente
**Estado:** ✅ Completado

Tablas: `miami_packages`, `miami_manifests`, `miami_pre_alerts`, `client_addresses`,
`miami_incidencias`, `client_notifications`, `client_pickup_requests`.
Bucket `miami-package-photos`. RLS + RPCs `next_warehouse_number()` / `next_manifest_number()`.

### Fase 5 — Módulo Bodega Miami (para rol Operaciones/Admin)
**Estado:** ✅ Completado | Commit: `1fd68dc`

- `/miami` — Dashboard métricas del día
- `/miami/ingreso` — Ingreso individual con auto-focus para scanner
- `/miami/manifiestos` — Lista + `/[id]` detalle con scan en lote y asignación por cliente

### Fase 6 — Portal Cliente: Auth + Layout + Perfil
**Estado:** ✅ Completado | Commit: `ebb60cd`

Portal en `/portal/`: login sin branding, layout rol=Cliente, dashboard con stats,
perfil completo, dirección Miami con CRUD.

### Fase 7 — Portal Cliente: Paquetería + Pre-alertas + Incidencias
**Estado:** ✅ Completado | Commit: `4c8eb56`

`/portal/paquetes`, `/portal/pre-alertas`, `/portal/incidencias` — lista + formularios.

### Fase 8 — Portal Cliente: Inicio + Funcionalidades extra
**Estado:** ✅ Completado | Commit: `cf8fba8`

Calculadora FT³/CBM, contacto con oficinas, material restringido, T&C, nosotros, pickup CRUD.

### Fase 9 — Notificaciones in-app
**Estado:** ✅ Completado | Commit: `caffe7a`

Supabase Realtime en portal: campana, badge, lista con mark read. Integrado en ingreso y manifiestos.

### Fase 10 — Integración + Auto-match + Pulido
**Estado:** ✅ Completado | Commit: `f51ce5a`

- Trigger auto-match pre-alertas al ingresar paquete
- Admin: modal "Vincular a cliente" para profiles.cliente_id
- Portal: paginación server-side (PAGE_SIZE=20) con "Cargar más"

> **SQL ejecutado en Supabase:**
> `sql/20260618_phase10_auto_match.sql` — trigger auto-match

---

### Fase 11 — ERP Core: Mejoras globales + módulos nuevos
**Estado:** ✅ Completado | Commits: `9179691` → `0331550` (13 commits, pushed `2026-06-19`)

#### 11-A: Cotizaciones y Dashboard comercial
- `reqClass` helper aplicado a 4 campos requeridos en nueva cotización
- Dashboard: filtro de fecha con presets (mes / trimestre / año / todo)
- Dashboard: tabla de pipeline por vendedor (Total, Pipeline, Ganadas, Perdidas, % Cierre)
- Dashboard: embudo de conversión visual (5 etapas, % de conversión entre etapas)

#### 11-B: Clientes
- Nuevos campos: `contacto_2`, `telefono_2`, `limite_credito`, `moneda_credito`, `dias_credito`
- SQL: `sql/20260619_add_clientes_extended_fields.sql` ✅ ejecutado
- Vista y edición de cliente actualizadas con sección "Crédito"

#### 11-C: Operaciones — Aviso de Llegada + BL
- Fix: `port_of_loading` y `port_of_discharge` siempre null → resuelto agregando `origen`/`destino` al join de cotización
- HBL auto-numeración: `SARI-HBL-YYYYMMDD-NNN` generado en `saveBL`
- Aviso de Llegada PDF: tabla de contenedores FCL insertada
- SQL: `sql/20260618_create_bills_of_lading.sql` ✅ ejecutado

#### 11-D: Pricing
- Fix: cotizaciones terrestres mostraban "Ocean Freight" en lugar de "Flete Terrestre"
- `getFreightDescription` ahora detecta `tipo_transporte = 'terrestre'` vía `normalizeText`

#### 11-E: Dashboard Financiero (rebuild completo)
- Filtro de fecha con presets + inputs personalizados
- 4 KPI cards: Revenue, GP cotizado (+ %), GP real, Pérdidas detectadas
- BarChart mensual Revenue vs GP + LineChart GP% mensual
- Top 8 clientes (BarChart horizontal) + Revenue por tipo de servicio (barras de progreso)
- Tabla de pérdidas reales (GP real < 0)
- Botón exportar CSV, `PageSkeleton` durante carga, dark mode completo

#### 11-F: Módulo Facturación
- SQL: `sql/20260619_create_invoices.sql` ✅ ejecutado
  - Tablas: `invoices`, `invoice_items`, `invoice_payments` con RLS
- `/invoicing` — lista con KPIs (por cobrar / cobrado / vencido), filtros tipo/estado/búsqueda
- `/invoicing/new` — crear proforma o factura con líneas, ISV 15%, auto-número `SARI-FAC/PRO-YYYYMM-NNN`
- `/invoicing/[id]` — detalle con flujo de estados, modal de pago, historial de pagos
- Sidebar: "Facturación" bajo grupo Finanzas (Admin + Contabilidad + Finanzas)

#### 11-G: Agentes — Tarifas por ruta
- SQL: `sql/20260619_create_agent_route_rates.sql` ✅ ejecutado
  - Tabla `agent_route_rates`: origen, destino, carrier, service_type, base_rate, transit_time, transshipment, free_days, vigencia
- Detalle del agente (`/agents/[id]`): sección "Tarifas por ruta" con agregar/editar inline/eliminar
- Página de lista de agentes: PageSkeleton + header con etiqueta "Catálogos"

#### 11-H: Integración tarifas → Pricing Comparison
- Al seleccionar un agente en pricing-comparison, se cargan sus `agent_route_rates`
- Panel "Tarifas guardadas del agente" filtra por tipo de servicio de la cotización
- Click en una tarifa auto-rellena: ocean_freight, transit_time, transshipment, free_days, valid_until, carrier
- Tarifas vencidas marcadas con ⚠

#### 11-I: Configuración de empresa + fix permisos
- SQL: `sql/20260619_create_company_settings.sql` ✅ ejecutado
  - Tabla `company_settings`: datos legales, RTN, dirección, contacto, logo_url, ISV, nota pie
  - Fila inicial pre-cargada con datos de Sari Express
- `/settings/company` — todos los roles pueden ver; solo Admin puede editar
- Sidebar: "Config. Empresa" bajo grupo Administración
- **Bug fix:** rol `Finanzas` no estaba en `permissions.ts` → usuarios con ese rol quedaban bloqueados
- `SETTINGS_READ_PATHS` — permite que todas las rutas `/settings/*` sean visibles por cualquier rol autenticado

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
| 11 | ERP Core: mejoras globales + módulos nuevos | ✅ |
| 12 | Facturación SAR Honduras (cumplimiento fiscal) | ✅ |
| 13 | BL: enmiendas + envío draft al cliente | ✅ |
| 14 | Usuarios: invitaciones + onboarding | ✅ |
| 15 | Calidad de código: tipos centralizados, error boundaries | ✅ |
| 16 | Retenciones ISV (agentes de retención SAR) | 🔲 |
| 17 | Proveedores + Cuentas por Pagar | ✅ |
| 18 | Reportes exportables PDF/CSV | 🔲 |

---

## Fase 12 — Facturación SAR Honduras (cumplimiento fiscal)
**Estado:** ✅ Completado | Commits: `14e04a5` → `b032c96`

### Entregado
- SQL ejecutados: `cai_ranges`, ALTER `invoices` (campos SAR), ALTER `company_settings` (`lugar_emision_defecto`, `exchange_rate_usd_hnl`), constraint NC/ND, `parent_invoice_id`, `motivo`
- `/settings/cai` — gestión de rangos CAI con card de estado, barra de uso, historial
- `/invoicing/new` — herencia CAI automática, número SAR `NNN-NNN-NN-NNNNNNNN`, ISV por línea (15%/18%/Exento), exonerado (OCE/constancia/SAG), tipo de cambio desde `company_settings`
- `invoice-pdf.tsx` — PDF SAR-compliant: totales desglosados, total en letras, pie CAI, Original/Copia
- Botón "Descargar PDF" en detalle de factura
- **Notas de Crédito y Débito** — vinculadas a factura original con `parent_invoice_id` + `motivo`; botones NC/ND en detalle; balance efectivo; PDF NC/ND referencia factura padre
- **Validaciones SAR**: RTN del cliente obligatorio en documentos fiscales; tipo de cambio requerido en facturas USD; aviso visual rojo en panel de cliente sin RTN

### Pendiente para futuro (no bloqueante)
- XML SAR (autoimpresor usa PDF; SAR aún en transición gradual 2025-2026)
- Retenciones ISV para agentes de retención → **Phase 16**

---

## Fase 13 — Bill of Lading: enmiendas + envío de draft
**Estado:** ✅ Completado

### Entregado
- SQL: `sql/20260619_bl_amendments.sql` — tablas `bl_amendments` + `bl_draft_sends` con RLS por rol (`Admin`, `Operaciones`)
- **Historial de enmiendas**: auto-detección de campos modificados (`TRACKED_FIELDS`) al guardar; diff `antes → después` guardado en `changed_fields` jsonb; nota opcional por el usuario; sección de historial al final de la página BL
- **Modal "Enviar Draft al Cliente"**: botón violeta visible en status `HBL Draft` / `Pendiente Aprobación Cliente`; email precompuesto con datos del BL; `mailto:` link; copiar al portapapeles; botón "Registrar envío" inserta en `bl_draft_sends`
- **Historial de envíos**: sección con todos los envíos registrados (destinatario + fecha)
- `savedFormRef` — snapshot del formulario al cargar; actualizado después de cada save para calcular diff incremental
- `TRACKED_FIELDS` — constante con 20 campos clave a monitorear


---

## Fase 14 — Usuarios: invitaciones + onboarding
**Estado:** ✅ Completado

### Entregado
- **API route** `POST /api/admin/invite` — usa `SUPABASE_SERVICE_ROLE_KEY` para llamar `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: '/onboarding', data: { rol } })`
- **Modal "Invitar usuario"** en `/admin/users` — botón en el header, dialog con email + rol, nota sobre la variable de entorno; el API valida Bearer token y perfil Admin activo antes de usar service role
- **Página `/onboarding`** — para usuarios invitados: escucha `onAuthStateChange`, pre-muestra el rol asignado, pide nombre y apellido, upserta profile con `status='Aprobado'` (auto-aprobado porque el Admin los invitó), redirige al dashboard
- El flujo self-registration existente (`/register` → `status='Pendiente'` → aprobación manual) se mantiene sin cambios

### Variables de entorno requeridas (`.env.local`)
- `SUPABASE_SERVICE_ROLE_KEY` — obtenla en Supabase Dashboard → Settings → API → service_role (secret)
- `NEXT_PUBLIC_SITE_URL` — URL base de la app (default: `http://localhost:3000`)

### También en Supabase Dashboard
- **Authentication → URL Configuration → Redirect URLs** — agregar `http://localhost:3000/onboarding` (y la URL de producción cuando aplique)

---

## Fase 15 — Calidad de código
**Estado:** ✅ Completado

### Entregado
- **`src/types/index.ts`** — tipos centralizados: `Profile`, `UserRole`, `UserStatus`. Disponibles para código nuevo con `import type { Profile } from '@/src/types'`
- **`src/components/ui/error-boundary.tsx`** — React error boundary (class component) con UI de error + botón "Reintentar". Envuelve el `<main>` del protected layout
- **`useUser.ts`** — tipado de `user` como `User | null` (Supabase); `profile` como `Profile | any` para backward compatibility con portal pages que no tienen guards estrictos
- **Console cleanup** — eliminados 19 `console.error` / `console.log` en 8 archivos: redundantes cuando ya hay toast.error, o reemplazados por comentario inline cuando el error es no-fatal
- **Bug fix bonus** — `portal/notificaciones` y `portal/pickup`: añadido `if (!user) return` en funciones de datos (eran accesos sin guard a `user.id`)
- Migración a `@supabase/ssr` diferida — riesgo alto sin infraestructura de tests; sigue en backlog

---

## Fase 17 — Proveedores + Cuentas por Pagar
**Estado:** ✅ Completado

### Entregado
- SQL: `sql/20260619_phase17_suppliers_ap.sql` — tablas `proveedores`, `cuentas_pagar`, `pagos_proveedor`
- RLS endurecido por rol (`Admin`, `Finanzas`, `Contabilidad`); se eliminó el `authenticated_full_access`
- `/suppliers` — lista con filtros, KPIs, estados activo/inactivo y enlace a detalle
- `/suppliers/new` — alta de proveedor con tipo, RTN, contacto, moneda, términos de pago y vinculación opcional a `agents`
- `/suppliers/[id]` — detalle/edición de proveedor + creación de cuentas por pagar vinculables a cotizaciones aprobadas
- `/accounts-payable` — lista de cuentas por pagar con filtros por moneda/estado, vencidas y pagado del mes basado en pagos reales
- `/accounts-payable/[id]` — detalle, registro de pagos, saldo, estado automático y anulación
- Sidebar: sección "Compras" con Proveedores y Cuentas por Pagar para roles financieros/admin
- Permisos: `/suppliers` y `/accounts-payable` habilitados para `Admin`, `Finanzas`, `Contabilidad`
- Hardening adicional: `POST /api/admin/invite` ahora exige Bearer token y perfil Admin activo antes de usar service role
- Validaciones: no se permiten pagos mayores al saldo pendiente; errores de update de estado ya no se ignoran

### Pendiente para siguiente fase
- Reportes exportables PDF/CSV con filtros comerciales, cargas, facturación, cuentas por cobrar y cuentas por pagar → **Fase 18**
- Botón directo desde cotización aprobada / shipment para crear cuenta por pagar prellenada

---

## SQL pendiente de ejecutar en Supabase

| Archivo | Estado |
|---------|--------|
| Todos (Fases 1-12) | ✅ Ejecutados |
| `sql/20260619_bl_amendments.sql` | ✅ Ejecutado |
| `sql/20260619_phase17_suppliers_ap.sql` | ✅ Ejecutado |

---

## Decisiones técnicas confirmadas

- **Ingreso de trackings:** combinación escáner de barras + tipeo manual
- **Tipo de lote:** carga mezclada de varios clientes Y múltiples paquetes de un cliente
- **Datos por paquete:** tracking, carrier, peso, dimensiones, fotos, descripción
- **Match cliente:** búsqueda manual + auto-match via trigger DB (pre-alerta)
- **Número WH:** `SPS-NNNNN` — secuencial global, generado al asignar al cliente
- **Número manifiesto:** `MAN-YYYYMMDD-NNN`
- **Número HBL:** `SARI-HBL-YYYYMMDD-NNN`
- **Número Factura:** `SARI-FAC-YYYYMM-NNN` (temporal) → migrar a formato SAR en Fase 12
- **Número Proforma:** `SARI-PRO-YYYYMM-NNN` (permanente, no es documento fiscal)
- **Portal cliente:** misma app Next.js, rol `Cliente` en Supabase, ruta `/portal/`
- **Notificaciones:** in-app (Supabase Realtime) implementado · email/WhatsApp/Push futuro
- **Fotos:** upload desde archivo local; futuro: cámara dedicada
- **Branding en portal:** "Mi Paquetería" — sin nombre "Sari" en páginas públicas/marketing
- **Facturación SAR:** ISV 15% estándar, ISV 18% para casos especiales, exonerados con OCE/constancia/SAG
- **Tarifas de agentes:** `agent_route_rates` por ruta/carrier/servicio; se sugieren automáticamente en pricing-comparison
- **company_settings:** una sola fila, Admin la edita desde `/settings/company`

---

## Stack del proyecto

- Next.js 16 + App Router
- TypeScript strict (`npx tsc --noEmit` requerido antes de cada commit)
- TailwindCSS 4
- Supabase (PostgreSQL + Auth + RLS + Storage + Realtime)
- Sonner (toasts)
- Lucide React (iconos)
- Recharts 3.8.1 (gráficas: BarChart, LineChart)
- React-PDF (PDFs del lado del cliente)
- Migraciones SQL en `/sql/`
- UI classes centralizadas en `src/lib/ui-classes.ts`
- Componentes reutilizables en `src/components/ui/`
- Landing page en `src/components/marketing/ForwardersLanding.tsx`

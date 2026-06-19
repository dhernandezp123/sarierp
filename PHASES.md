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

> **SQL pendiente de ejecutar en Supabase:**
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
| 12 | Facturación SAR Honduras (cumplimiento fiscal) | 🔲 |
| 13 | BL: flujo completo (email draft, enmiendas, PDF HBL) | 🔲 |
| 14 | Usuarios: invitaciones + onboarding | 🔲 |
| 15 | Calidad de código: tipos centralizados, error boundaries | 🔲 |

---

## Fase 12 — Facturación SAR Honduras (cumplimiento fiscal)
**Estado:** 🔲 Pendiente

### Contexto
El módulo `/invoicing` tiene estructura base pero NO cumple los requisitos del
Art. 10 y 11 del Reglamento del SAR Honduras para facturas de autoimpresor.

### Lo que ya existe ✅
- `company_settings`: `legal_name`, `trade_name`, `rtn`, `address`, `phone`, `email` → cubre datos del EMISOR (Art. 10)
- Módulo `/invoicing`: lista, nueva factura, detalle con pagos, flujo de estados
- ISV 15% calculado automáticamente en líneas
- Datos del cliente: nombre, RTN, dirección, email

### Gaps a implementar ❌

#### 1. Nueva tabla `cai_ranges`
```sql
id, cai text, rango_desde text, rango_hasta text,
fecha_limite_emision date, lugar_emision text,
is_active boolean, created_at, created_by
```
Un CAI cubre N facturas consecutivas. El sistema usa el rango activo al crear cada factura.
Formato número SAR: `NNN-NNN-NN-NNNNNNNN` (16 dígitos, ej. `000-001-01-00000001`).

#### 2. Campos nuevos en tabla `invoices`
```
cai, rango_desde, rango_hasta, fecha_limite_emision (heredados del rango activo)
lugar_emision text (heredado / editable)
es_exonerado boolean default false
orden_compra_exenta text nullable
no_constancia_exonerado text nullable
no_registro_sag text nullable
isv_18_rate numeric default 0
isv_18_amount numeric default 0
importe_exento numeric default 0
importe_exonerado numeric default 0
```

#### 3. Cambio en formato de número de factura
- Actual: `SARI-FAC-202506-001`
- SAR requiere: `NNN-NNN-NN-NNNNNNNN` dentro del rango autorizado
- Las Proformas conservan el formato actual (no son documentos fiscales)

#### 4. Formulario nueva factura — campos adicionales
- CAI se auto-hereda del rango activo (solo lectura)
- Rango autorizado y fecha límite visibles (solo lectura)
- Toggle "Cliente exonerado" → campos OCE, constancia, SAG
- Selector de tasa ISV por línea: 15% / 18% / Exento

#### 5. Página `/settings/cai` — administración de rangos CAI
- CRUD de rangos CAI, marcar activo
- Alerta cuando el rango esté cerca de agotarse o fecha límite próxima

#### 6. PDF de Factura SAR-compliant (`src/components/pdf/invoice-pdf.tsx`)
Cabecera: logo + razón social + RTN + nombre comercial + dirección + tel + email (de `company_settings`).
Número en formato SAR, fecha de emisión, modo DEMO si aplica.
Datos del cliente: nombre/razón social, RTN, dirección.
Cuerpo: líneas con descripción, qty, precio, ISV %, importe.
Totales SAR: OCE, constancia exoneración, SAG, descuento, importe exento, importe exonerado, importe gravado 15% y 18%, ISV 15% y ISV 18%, envío, **TOTAL en letras**.
Pie SAR: rango autorizado, fecha vencimiento CAI, CAI completo, lugar de emisión.
"Original: Cliente / Copia: Emisor".

#### 7. Campos adicionales en `company_settings`
```
lugar_emision_defecto text  — punto de emisión por defecto
exchange_rate_usd_hnl numeric  — tasa USD→HNL vigente (ej. 25.30), Admin la actualiza
```
El formulario de nueva factura lee esta tasa como valor por defecto.
Cada factura guarda la tasa usada en el momento de emisión (`exchange_rate` ya existe).

### Orden de implementación
1. SQL: `sql/20260619_phase12_sar_invoicing.sql` — tabla `cai_ranges` + ALTER `invoices` + ALTER `company_settings`
2. `/settings/cai` — CRUD de rangos CAI con alerta de agotamiento
3. Actualizar nueva factura: herencia CAI + campos exonerados + ISV por línea
4. PDF `invoice-pdf.tsx` SAR-compliant
5. Botón "Imprimir / Descargar PDF" en `/invoicing/[id]`

---

## Fase 13 — Bill of Lading: flujo completo
**Estado:** 🔲 Pendiente

### Lo que ya existe ✅
- Tabla `bills_of_lading` (`sql/20260618_create_bills_of_lading.sql`) ✅ ejecutado
- Página `/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]` — formulario BL
- HBL auto-numeración `SARI-HBL-YYYYMMDD-NNN`
- Flujo de estados: MBL Draft → MBL Validado → HBL Draft → Pendiente Aprobación → Aprobado → Emitido → Liberado

### Pendiente ❌
- Envío de HBL Draft por email al cliente (desde el sistema)
- Flujo de enmiendas (BL Amendment): registrar cambio + nueva versión
- PDF de HBL oficial (`src/components/pdf/house-bl-pdf.tsx`)
- Botón "Descargar PDF" en estado "Emitido"

---

## Fase 14 — Usuarios: invitaciones + onboarding
**Estado:** 🔲 Pendiente

- Admin puede invitar usuarios por email (Supabase Auth `inviteUserByEmail`)
- Formulario de registro post-invitación (nombre, apellido, rol solicitado)
- Aprobación por Admin en `/admin/users`
- Email de bienvenida automático al aprobar

---

## Fase 15 — Calidad de código
**Estado:** 🔲 Pendiente

- Centralizar tipos TypeScript reutilizables en `src/types/`
- Migrar Supabase client a `@supabase/ssr` (cookies en vez de localStorage)
- Error boundaries en layouts para evitar blank screens
- Eliminar `console.error` / `console.log` restantes en el codebase

---

## SQL pendiente de ejecutar en Supabase

| Archivo | Estado |
|---------|--------|
| `sql/20260618_phase10_auto_match.sql` | ⚠ Pendiente |
| Resto (Fases 1-11) | ✅ Ejecutados |

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

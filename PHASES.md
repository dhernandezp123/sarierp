# PHASES.md — Seguimiento de Fases de Desarrollo

Este archivo es la fuente de verdad del estado de desarrollo del ERP.
Actualizar al finalizar cada fase o sesión de trabajo.
Leer este archivo al inicio de cada nueva sesión para recuperar contexto.

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
| 16 | Retenciones ISV (agentes de retención SAR) | 🔲 PENDIENTE |
| 17 | Proveedores + Cuentas por Pagar | ✅ |
| 18 | Reportes exportables PDF/CSV + Pagos a Proveedores | ✅ |
| 19 | Cotizaciones: # containers + vencimiento + quitar Incoterm/ojo | ✅ |
| 20 | AWB + Carta Porte + Políticas en documentos | ✅ |
| 21 | Miami: tipos de carga + inventario + estados + lista de embarque | ✅ |
| 22 | Garantías Navieras | ✅ |
| 23 | Notificaciones operacionales automáticas | ✅ |
| 24 | Tutorial de onboarding por perfil + plantillas de correo | ✅ |
| 25 | Facturación: recibos + cierres + documentos de proveedores | ✅ |
| 26 | Portal cliente: rastreo de carga + tipo de carga | ✅ |
| 27 | Generar CxP desde cotización Ganada | ✅ |
| 28 | Estado de cuenta por cliente (PDF desde Facturación) | ✅ |

---

## SQL ejecutados en Supabase

| Archivo | Estado |
|---------|--------|
| Todos (Fases 1-12) | ✅ Ejecutados |
| `sql/20260619_bl_amendments.sql` | ✅ Ejecutado |
| `sql/20260619_phase17_suppliers_ap.sql` | ✅ Ejecutado |
| `sql/20260619_audit_harden_remaining_rls.sql` | ✅ Ejecutado |
| `sql/20260619_fix_client_rates_delete_policy.sql` | ✅ Ejecutado |
| `sql/20260619_phase22_garantias_navieras.sql` | ✅ Ejecutado |
| `sql/20260619_phase21_miami_cargo.sql` | ✅ Ejecutado |
| `sql/20260619_phase26_portal_tracking.sql` | ✅ Ejecutado |
| `sql/20260621_phase20_awb_carta_porte.sql` | ✅ Ejecutado |
| `sql/20260621_phase23_notifications.sql` | ✅ Ejecutado |
| `sql/20260621_phase24_onboarding.sql` | ✅ Ejecutado |
| `sql/20260621_phase25_invoicing.sql` | ✅ Ejecutado |
| `sql/20260621_fix_phases20_25.sql` | ✅ Ejecutado |
| `sql/20260621_fix_phase23_expiry_cron.sql` | ✅ Ejecutado |

---

## Fases completadas (historial)

### Fases 1–18
*(Ver commits históricos — todo completado y pusheado)*

---

### Fase 19 — Cotizaciones: mejoras tabla + alertas de expiración
**Estado:** ✅ Completado | Commit: sesión 2026-06-19 | Archivo: `src/app/(protected)/historico/page.tsx`

#### Entregado
- **Columna "# Unid."**: muestra suma de `quotation_containers.quantity` para FCL/FTL (label "X cont.") y suma de `quotation_cargo_lines.quantity` para LCL/Aéreo (label "X bts"); `—` si vacío
- **Columna "Vence"**: toma `valid_until` de la tarifa `is_selected = true` de `agent_quotes`. Badge con color:
  - Rojo: vencida (< hoy)
  - Naranja: vence en ≤ 7 días
  - Gris: vigente
- **Columna "Incoterm" eliminada** de la tabla del histórico
- **Columna "Detalle" + icono ojo eliminados** de la tabla del histórico
- Query ampliada para incluir `agent_quotes(valid_until, is_selected)`, `quotation_containers(quantity)`, `quotation_cargo_lines(quantity)`
- `TableSkeleton cols={7}` actualizado a la nueva cantidad de columnas
- Funciones helper: `isFclFtl()`, `getUnitCount()`, `getExpiryDisplay()`

#### Decisiones técnicas
- Solo tarifa `is_selected = true` se usa para calcular el vencimiento
- Los bultos para LCL/Aéreo se sacan de `quotation_cargo_lines.quantity`, no de `container_qty`

---

### Fix Bug — Ventas no podía guardar tarifas de cliente
**Estado:** ✅ Resuelto | SQL: `sql/20260619_fix_client_rates_delete_policy.sql`

**Causa raíz:** La política RLS `client_rates_delete_policy` solo permitía DELETE a `is_admin()`. Supabase bloqueaba silenciosamente el DELETE del rol Ventas, y luego el INSERT fallaba con 409 duplicate key (constraint única sigue ahí).

**Fix:** Cambiar la policy a `is_approved_active_user()` para que cualquier usuario autenticado y activo pueda borrar y re-insertar sus propias tarifas.

```sql
drop policy if exists "client_rates_delete_policy" on public.client_rates;
create policy "client_rates_delete_policy"
on public.client_rates
for delete to authenticated
using (public.is_approved_active_user());
```

---

### Fase 21 — Miami: tipos de carga + inventario + lista de embarque
**Estado:** ✅ Completado | Commit: `feat: phase 21 - miami cargo types, inventory and dispatch list`

#### SQL ejecutado
`sql/20260619_phase21_miami_cargo.sql` — agrega a `miami_packages`:
- `tipo_carga TEXT DEFAULT 'Paquetería' CHECK ('Paquetería' | 'LCL' | 'Aéreo Consolidado')`
- `cargo_status TEXT DEFAULT 'Recibido en Miami' CHECK ('Recibido en Miami' | 'En Consolidación' | 'En Tránsito' | 'Llegado Honduras' | 'Entregado')`

#### Páginas
- `/miami/ingreso` — agregado selector de Tipo de Carga; al insertar setea `cargo_status = 'Recibido en Miami'`
- `/miami/inventario` — vista de todo el inventario con:
  - 5 KPI cards por cargo_status (clickeables como filtro rápido)
  - Filtros: search (tracking/WH/cliente), cargo_status, tipo_carga
  - Botón "→ [siguiente estado]" por fila para avanzar el status
- `/miami/embarques` — lista de despacho con:
  - Solo muestra `cargo_status IN ('Recibido en Miami', 'En Consolidación')`
  - Checkbox multi-select por fila + select all
  - Botón "Marcar En Tránsito" (bulk update)
  - Botón "Imprimir lista" → HTML/CSS generado en JS, abre ventana y hace print()
  - Filtro por tipo_carga

#### Navegación
- Sidebar: "Inventario" (Database icon) y "Lista de Embarque" (Route icon) bajo "Miami Bodega"
- `permissions.ts`: Operaciones tiene acceso a `/miami/inventario` y `/miami/embarques`

#### Patrones clave
- `as unknown as Pkg[]` — cast necesario porque Supabase tipea el join como array, no coincide con el tipo local
- `EmptyState icon={<Plane className="h-6 w-6" />}` — el prop `icon` acepta `ReactNode` (JSX), NO componente

---

### Fase 22 — Garantías Navieras
**Estado:** ✅ Completado | Commit: `feat: phase 22 - garantias navieras module`

#### SQL ejecutado
`sql/20260619_phase22_garantias_navieras.sql` — tabla `garantias_navieras`:
- Campos: `booking_id`, `naviera`, `contenedor`, `bl_number`, `monto`, `moneda`, `fecha_deposito`, `fecha_vencimiento_libre`, `fecha_recuperacion`, `status CHECK ('Depositada' | 'Recuperada' | 'Vencida')`, `notas`, `created_by`
- RLS: `is_approved_active_user()` para SELECT/INSERT/UPDATE/DELETE

#### Página `/operations/garantias`
- KPI cards: total depositado USD, alertas ≤14 días, recuperadas
- Formulario inline de alta: booking selector, naviera, contenedor, BL, monto, moneda, fechas
- Componente `VencimientoBadge`: rojo (vencida), naranja (≤7 días), amarillo (≤14 días)
- Filtros: chips Activas/Todas/Depositada/Recuperada/Vencida + dropdown naviera
- Botón "Marcar recuperada" → update status + fecha_recuperacion = today

#### Navegación
- Sidebar: "Garantías Navieras" (ShieldAlert icon) bajo "Operaciones"
- `permissions.ts`: Operaciones tiene acceso a `/operations/garantias`

---

### Fase 26 — Portal cliente: rastreo de carga + tipo de carga
**Estado:** ✅ Completado | Commit: `feat: phase 26 - portal tracking timeline + cargo status dates`

#### SQL ejecutado
`sql/20260619_phase26_portal_tracking.sql` — agrega a `miami_packages`:
- `cargo_status_updated_at TIMESTAMPTZ DEFAULT now()` — registra cuándo cambió el cargo_status

#### Cambios en páginas internas
- `/miami/inventario` — al avanzar estado incluye `cargo_status_updated_at: new Date().toISOString()`
- `/miami/embarques` — al marcar "En Tránsito" incluye `cargo_status_updated_at`

#### Portal `/portal/paquetes/[id]`
- **Badge tipo de carga** en el header del paquete (Paquetería / LCL / Aéreo Consolidado) con colores:
  - Paquetería: gris
  - LCL: azul
  - Aéreo Consolidado: púrpura
- **Stepper de rastreo** "Seguimiento del envío":
  - 5 pasos: Recibido en Miami → En Consolidación → En Tránsito a Honduras → Llegado a Honduras → Entregado
  - Pasos completados: check verde; paso actual: check azul + badge "ACTUAL"; futuros: círculo gris
  - Fechas: paso 0 muestra `received_at`; paso actual muestra `cargo_status_updated_at`
  - Línea vertical conectora entre pasos (posicionada con `absolute`)
- **Label adaptivo**: para Aéreo Consolidado, el label "Carrier" cambia a "AWB / Carrier"
- El stepper solo aparece si `cargo_status` tiene valor (no rompe paquetes legacy sin el campo)

---

### Fase 27 — Generar CxP desde cotización Ganada
**Estado:** ✅ Completado | Commit: sesión 2026-06-19 | Archivo: `src/app/(protected)/quotations/[id]/page.tsx`

#### Entregado
- Botón **"Generar CxP"** visible en el menú "..." de cotizaciones con `status = 'Ganada'` para roles `Admin`, `Finanzas`, `Contabilidad`
- Handler `handleGenerarCxP`:
  1. Valida que haya tarifa seleccionada (`agent_quotes.is_selected = true`)
  2. Busca el proveedor via `proveedores.agente_id = selectedAgent.agent_id`
  3. Si no hay proveedor vinculado: toast.error descriptivo con instrucciones
  4. Calcula vencimiento = fecha hoy + `proveedores.terminos_pago` días
  5. Inserta en `cuentas_pagar` con: proveedor_id, quotation_id, descripción "Flete - {numero}", monto, moneda, fechas, notas
  6. Toast de éxito con nombre del proveedor

#### Decisiones técnicas
- Monto = `agent_quotes.costo` (campo correcto para costo del agente, no `exw_cost`)
- Link agente → proveedor: `agent_quotes.agent_id → agents.id → proveedores.agente_id` (buscar proveedor con `.eq('agente_id', selectedAgent.agent_id)`)
- Solo disponible en status `Ganada` (no en Aprobada ni Convertida — el usuario prefirió ser más restrictivo)

---

## Fases pendientes — detalle completo

### Fase 16 — Retenciones ISV (mayor riesgo)
**Estado:** 🔲 PENDIENTE — **Hacer de ÚLTIMA** (riesgo de romper facturación existente)

#### Contexto
En Honduras, los "agentes de retención" del ISV (ISV retenido) aplican cuando el comprador es un agente de retención autorizado por la SAR. En ese caso, el comprador retiene el ISV y lo paga directamente al fisco.

#### Scope
- Campo `es_agente_retencion BOOLEAN` en tabla `clientes`
- En `/invoicing/new`: si el cliente es agente de retención, mostrar sección de retención
  - El ISV NO se cobra al cliente (se retiene en origen)
  - La factura muestra: Subtotal, ISV retenido (no cobrado), Total a pagar = Subtotal
  - Se genera un "Constancia de Retención" adicional
- Tablas afectadas: `invoices` (agregar `isv_retenido`, `tiene_retencion`), `invoice_items`
- PDF: línea de ISV retenido visible pero tachada o en gris con leyenda "Retenido por [RTN cliente]"
- Reportes financieros: separar ISV cobrado vs ISV retenido en dashboard financiero

#### Riesgo
- Toca el core de facturación SAR que ya está funcionando
- Hacer DESPUÉS de Fases 23, 24, 25

---

### Fase 20 — AWB + Carta Porte + Políticas en documentos
**Estado:** ✅ Completado | Commit: sesión 2026-06-21 | SQL: `sql/20260621_phase20_awb_carta_porte.sql`

#### SQL ejecutado
`sql/20260621_phase20_awb_carta_porte.sql`:
- `company_settings`: agrega `condiciones_bl`, `condiciones_awb`, `condiciones_carta_porte TEXT`
- `bills_of_lading`: agrega `placa_camion`, `nombre_operador TEXT`

#### PDF Nuevos
- `src/components/pdf/awb-pdf.tsx` — Air Waybill con campos IATA: aeropuerto salida/destino, aerolínea, número de vuelo, cargo, condiciones
- `src/components/pdf/carta-porte-pdf.tsx` — Carta Porte con: transportista, placa, operador, ruta, cargo, condiciones; 3 bloques de firma

#### BL Page (`src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`)
- Query ampliada: trae `tipo_transporte` desde `quotations` vía booking → SI → quotation
- Carga `company_settings.condiciones_*` en `loadData`
- Sección "Buque/Vuelo" ahora es condicional:
  - `Aéreo`: muestra "Vuelo", "Flight No." (sin voyage)
  - `Terrestre`: muestra "Transporte Terrestre", campos Placa + Operador (sin vessel/voyage)
  - Marítimo/default: sin cambio
- Botón PDF al emitir HBL:
  - `tipo_transporte = 'Aéreo'` → Descargar AWB PDF
  - `tipo_transporte = 'Terrestre'` → Descargar Carta Porte PDF
  - Marítimo o sin tipo → Descargar HBL PDF (comportamiento anterior)

#### Settings (`src/app/(protected)/settings/company/page.tsx`)
- Nueva sección "Condiciones en documentos de transporte": 3 textareas para HBL, AWB, Carta Porte
- Solo Admin puede editar

#### Decisiones técnicas
- `tipo_transporte` se lee de la cotización vinculada al booking (no se almacena en `bills_of_lading`)
- Los campos de AWB reusan campos existentes del BL form: `carrier` → aerolínea, `vessel_name` → vuelo, `port_of_loading` → aeropuerto salida, `port_of_discharge` → aeropuerto destino
- `placa_camion` y `nombre_operador` se guardan en `bills_of_lading` vía SQL migration

---

### Fase 23 — Notificaciones operacionales automáticas
**Estado:** ✅ Completado | Commit: sesión 2026-06-21 | SQL: `sql/20260621_phase23_notifications.sql`

#### SQL ejecutado
`sql/20260621_phase23_notifications.sql`:
- `agent_quotes`: agrega `expiry_notified_at TIMESTAMPTZ` para deduplicar notificaciones

#### Entregado

**1. Cotización modificada con SI activa** (`src/app/(protected)/quotations/[id]/edit/page.tsx`)
- En `handleSave`, después del save exitoso: verifica si existe `shipping_instructions.quotation_id = quotationId`
- Si existe SI, obtiene todos los `profiles` con `rol = 'Operaciones'`
- Inserta notificación para cada uno via `createNotification()` (ya importado en esa página)
- Mensaje: "La cotización {numero} (SI: {routing_number}) fue modificada."

**2. Expiración de tarifas seleccionadas** (`src/lib/tarifa-expiry-check.ts`)
- Función `checkAndNotifyExpiredTarifas()`:
  - Busca `agent_quotes` donde `valid_until < hoy` AND `is_selected = true` AND `expiry_notified_at IS NULL`
  - Filtra a cotizaciones con `status = 'Cotizada'`
  - Notifica a todos los usuarios con `rol = 'Pricing'`
  - Marca `expiry_notified_at = now()` para evitar duplicados
- Se llama desde `/alerts` page en `useEffect` solo para roles `Pricing` y `Admin`

#### Decisión técnica
- Deduplicación por `expiry_notified_at` en lugar de cron server-side — cero infraestructura extra
- El check ocurre al abrir `/alerts` (página que ambos roles visitan regularmente)

---

### Fase 24 — Tutorial de onboarding por perfil + plantillas de correo
**Estado:** ✅ Completado | Commit: sesión 2026-06-21 | SQL: `sql/20260621_phase24_onboarding.sql`

#### SQL ejecutado
`sql/20260621_phase24_onboarding.sql`:
- `profiles`: agrega `tutorial_completed BOOLEAN DEFAULT false`
- `company_settings`: agrega `plantilla_cotizacion TEXT`

#### Entregado

**1. Tutorial de onboarding** (`src/components/onboarding/OnboardingTutorial.tsx`)
- Overlay fullscreen con backdrop blur, modal centrado
- Pasos por rol:
  - **Ventas** (3): Nueva Cotización → Histórico → Clientes
  - **Pricing** (3): Comparar Tarifas → Agentes → Cotizaciones
  - **Operaciones** (4): Shipping Instructions → Bookings → Garantías → Miami
  - **Finanzas / Contabilidad** (3): Facturación → CxP → Dashboard Financiero
  - **Admin** (3): Dashboard → Usuarios → Configuración
- Barra de progreso, botones Anterior / Siguiente / Finalizar / Saltar
- Cada paso tiene link directo a la sección
- Al Finalizar o Saltar: marca `tutorial_completed = true` en DB → no vuelve a aparecer
- Inyectado en el layout protegido (`src/app/(protected)/layout.tsx`)

**2. "Ver tutorial de nuevo"** (`src/app/(protected)/profile/page.tsx`)
- Botón en el header de la página de perfil
- Actualiza `tutorial_completed = false` en DB + `window.location.reload()` → tutorial re-aparece

**3. Modal de correo para cotizaciones** (`src/app/(protected)/quotations/[id]/page.tsx`)
- Icono Mail junto a PDF y Print en la barra de acciones
- Abre un modal con:
  - Para: `contact_email` o `clientes.email_1` (prellenado)
  - CC: email del usuario activo
  - Asunto: "Cotización {número} - Sari Express"
  - Cuerpo: datos del servicio + tarifa seleccionada (carrier, tránsito, ETD, costo, validez) + `plantilla_cotizacion`
  - Botón "Abrir en correo" → link `mailto:` con subject + body precargados
  - Botón "Copiar mensaje" → clipboard API
- `plantilla_cotizacion` se carga lazy desde `company_settings` al abrir el modal

**4. Settings** (`src/app/(protected)/settings/company/page.tsx`)
- Nueva sección "Plantilla de correo — Cotizaciones" con textarea para el texto de cierre

---

### Fase 25 — Facturación completa: recibos + cierres + documentos de proveedores
**Estado:** ✅ Completado | Commit: sesión 2026-06-21 | SQL: `sql/20260621_phase25_invoicing.sql`

#### SQL ejecutado
`sql/20260621_phase25_invoicing.sql`:
- `cuentas_pagar`: agrega `tipo TEXT DEFAULT 'AP'`, `parent_ap_id UUID REFERENCES cuentas_pagar(id)`, `documento_url TEXT`
- Storage: crea bucket `proveedor-docs` (público)

#### Entregado

**1. Recibos de pago** (`src/components/pdf/recibo-pago-pdf.tsx`)
- PDF A5 con: datos empresa (legal_name, RTN, dirección, tel), datos cliente, número de factura, monto en verde, fecha/método/referencia/notas, dos líneas de firma
- Botón con ícono `Printer` en cada fila de pagos en `/invoicing/[id]` → `PDFDownloadLink` descarga el recibo en PDF directamente
- Datos tomados de `companySetting` + `invoice` + `Payment` sin queries adicionales (ya cargados en la página)

**2. Cierre del mes** (`/invoicing/page.tsx`)
- Botón "Cierre del mes" en header, visible solo para roles `Admin` y `Finanzas`
- Modal con selector mes/año (2024–2027)
- Calcula 4 KPIs del período desde el estado local `invoices`: facturado, cobrado, por cobrar, vencido
- Botón "Imprimir" → `window.open()` con HTML inline generado en JS + `window.print()` automático

**3. Documentos de proveedores** (`/suppliers/[id]/page.tsx`)
- Columna "Doc." agregada a la tabla de CxP
- Sin documento: ícono `Upload` (label oculto con `input[type=file]`) → upload a bucket `proveedor-docs` → guarda URL en `cuentas_pagar.documento_url`
- Con documento: ícono `ExternalLink` → abre el archivo en nueva pestaña
- `CuentaPagar` type extendido con `documento_url: string | null`
- Select query ampliado para incluir `documento_url`

**4. NC/ND de proveedores** (`/accounts-payable/[id]/page.tsx`)
- Botón "NC / ND" en el header de la sección de pagos (siempre visible)
- Modal: tipo (NC / ND), descripción, monto, fecha
- Inserta en `cuentas_pagar` con `tipo`, `parent_ap_id = id del AP actual`, `proveedor_id` del padre, `status = 'Pendiente'`
- El registro NC/ND aparece en la lista de CxP del proveedor correspondiente

#### Decisiones técnicas
- Recibo PDF: usa `makeReceiptData()` calculado fuera del JSX (antes del `return`) para que `PDFDownloadLink` tenga acceso a `companySetting` e `invoice`
- Cierre: no usa react-pdf, usa `window.open()` con HTML/CSS vanilla para evitar un componente PDF adicional de bajo valor
- Documentos: bucket `proveedor-docs` privado; acceso mediante URL firmada para roles financieros

#### Correcciones posteriores a auditoría
- Migración compensatoria: `sql/20260621_fix_phases20_25.sql` (pendiente de ejecutar)
- `proveedor-docs` pasa a privado, limitado a PDF de 10 MB y roles financieros
- Los documentos se abren con URL firmada y se almacenan por ruta, no como URL pública
- NC/ND ajustan el saldo real de la CxP padre
- El cierre usa pagos reales, fechas de pago, vencimientos calculados y totales separados por moneda

---

### Fase 28 — Estado de cuenta por cliente
**Estado:** ✅ Completado | Sin SQL nuevo

- Disponible para Admin, Finanzas y Contabilidad desde `/invoicing`
- Calcula cada cuenta abierta como `Factura - NC emitidas + ND emitidas - pagos`
- Excluye proformas, documentos anulados, notas en borrador y saldos pagados
- Determina vencimiento por `due_date`, sin depender del estado almacenado
- Mantiene USD, HNL y otras monedas separadas en modal, PDF y correo
- PDF muestra monto original, NC/ND, pagos y saldo; evita cortar filas y agrega paginación
- Permite descargar el PDF y preparar un correo al cliente; el archivo se adjunta manualmente
- Los estados de cuenta no requieren bloques de firma

---

## Notas de arquitectura importantes

### Patrón Supabase join → array cast
Cuando un query de Supabase incluye join con `select('*, tabla_relacionada(campo)')`, el resultado tipado por TypeScript puede no coincidir con el tipo local definido. Usar:
```ts
setData((data || []) as unknown as MiTipo[])
```

### Separación de campos en miami_packages
- `status`: asignación al cliente (`Sin asignar` / `Asignado` / `Entregado` / `Con incidencia`) — tiene CHECK constraint, NO modificar
- `cargo_status`: recorrido físico (`Recibido en Miami` → `En Consolidación` → `En Tránsito` → `Llegado Honduras` → `Entregado`) — campo nuevo sin impacto en lógica existente

### Link agente → proveedor para CxP
```
agent_quotes.agent_id → agents.id → proveedores.agente_id
```
Para buscar el proveedor a partir de una tarifa seleccionada:
```ts
supabase.from('proveedores').select('*').eq('agente_id', selectedAgent.agent_id).maybeSingle()
```

### EmptyState icon prop
El componente acepta `icon?: ReactNode` — pasar JSX, no referencia al componente:
```tsx
// ✅ Correcto
<EmptyState icon={<Plane className="h-6 w-6" />} ... />

// ❌ Incorrecto
<EmptyState icon={Plane} ... />
```

### RLS — patrón de política permisiva
Para acciones que deben funcionar para todos los usuarios autenticados activos:
```sql
using (public.is_approved_active_user())
```
Evitar `is_admin()` en políticas de DELETE cuando el rol normal necesita editar (causó bug client_rates).

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
- **Retenciones ISV:** dejar para ÚLTIMO (Fase 16) — mayor riesgo de romper facturación existente
- **Monto CxP desde cotización:** usar `agent_quotes.costo`, NO `exw_cost`
- **cargo_status vs status en miami_packages:** campos independientes — uno para ciclo físico, otro para asignación al cliente

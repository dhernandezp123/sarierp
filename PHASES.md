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
| 20 | AWB + Carta Porte + Políticas en documentos | 🔲 PENDIENTE |
| 21 | Miami: tipos de carga + inventario + estados + lista de embarque | ✅ |
| 22 | Garantías Navieras | ✅ |
| 23 | Notificaciones operacionales automáticas | 🔲 PENDIENTE |
| 24 | Tutorial de onboarding por perfil + plantillas de correo | 🔲 PENDIENTE |
| 25 | Facturación: recibos + cierres + documentos de proveedores | 🔲 PENDIENTE |
| 26 | Portal cliente: rastreo de carga + tipo de carga | ✅ |
| 27 | Generar CxP desde cotización Ganada | ✅ |

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
**Estado:** 🔲 PENDIENTE

#### Contexto
El módulo BL actual genera HBLs para embarques marítimos. Faltan los documentos equivalentes para Aéreo y Terrestre.

#### Scope
- **AWB (Air Waybill)**: cuando el embarque es Aéreo Consolidado, el BL debe ser tipo AWB con formato IATA simplificado
  - Lógica: si `quote_type` o `tipo_transporte` = aéreo → `bl_type = 'AWB'`
  - Nuevo PDF `awb-pdf.tsx` con campos IATA básicos
- **Carta Porte**: para terrestre/FTL
  - Campo adicional: placa del camión, operador, ruta
  - PDF `carta-porte-pdf.tsx`
- **Políticas / Condiciones generales**: texto de condiciones al pie de HBL, AWB y Carta Porte
  - Almacenar en `company_settings.condiciones_bl` y `condiciones_awb`
  - Admin puede editar desde `/settings/company`
- No tocar la lógica de BL existente (HBL marítimo sigue igual)

---

### Fase 23 — Notificaciones operacionales automáticas
**Estado:** 🔲 PENDIENTE

#### Scope
**Cambio en cotización con SI activo:**
- En `saveCotizacion()`, después de guardar, verificar si existe Shipping Instruction vinculada (`shipping_instructions.quotation_id = id`)
- Si existe → `supabase.from('notifications').insert(...)` para todos los usuarios con rol Operaciones
- Mensaje: "La cotización {numero} (con SI activa) fue modificada: campo X cambió de A a B"
- Usar la función `notifyClientPackageAssigned` como referencia de patrón de inserción de notificación
- Tabla `notifications`: `user_id`, `title`, `body`, `href`, `is_read`

**Expiración de tarifas:**
- Cron o consulta periódica: `agent_quotes WHERE valid_until = today - 1 AND quotation.status = 'Cotizada'`
- Notificar a rol Pricing con link a la cotización

#### Archivos clave
- `src/app/(protected)/quotations/[id]/page.tsx` — función `handleSave` es donde agregar el check
- `src/lib/client-notifications.ts` — ver patrón de inserción de notificaciones
- `src/lib/permissions.ts` — para obtener todos los user_ids con rol Operaciones (necesita query a `profiles`)

---

### Fase 24 — Tutorial de onboarding por perfil + plantillas de correo
**Estado:** 🔲 PENDIENTE

#### Scope
**Tutorial de onboarding:**
- Agregar campo `tutorial_completed BOOLEAN DEFAULT false` en `profiles` via SQL
- Al primer login (detectado en el layout protegido), mostrar overlay/modal de bienvenida
- Pasos diferenciados por rol:
  - Ventas: Nueva cotización → Histórico → Clientes
  - Operaciones: Shipping Instructions → Bookings → Garantías → Miami
  - Finanzas: Facturación → Cuentas por Pagar → Dashboard Financiero
- Botón "Siguiente" avanza el paso, "Saltar" marca `tutorial_completed = true`
- Botón "Ver tutorial de nuevo" en `/profile`
- Implementación: componente overlay ligero sin librería externa (evitar paquetes nuevos)

**Plantillas de correo (envío de cotización):**
- En `/quotations/[id]`, agregar botón "Enviar por correo"
- Abre modal con:
  - Para: email del cliente (prellenado)
  - CC: usuario actual
  - Asunto: "Cotización {número} - Sari Express"
  - Cuerpo: plantilla prellenada con resumen de servicio, tarifa seleccionada, validez
  - Botón "Copiar texto" + link `mailto:` para abrir cliente de correo
- Sin servidor de email externo por ahora (igual que el draft BL)
- Texto de plantilla configurable desde `company_settings.plantilla_cotizacion`

---

### Fase 25 — Facturación completa: recibos + cierres + documentos de proveedores
**Estado:** 🔲 PENDIENTE

#### Scope
**Recibos de pago:**
- Al registrar un pago en `/invoicing/[id]`, botón "Imprimir recibo"
- PDF `recibo-pago-pdf.tsx`: Sari Express datos, cliente, factura referenciada, monto pagado, fecha, método de pago, firma
- Sin tabla nueva — el recibo se genera on-demand desde `invoice_payments`

**Cierres de período:**
- Botón "Cierre del mes" en `/invoicing` (solo Admin/Finanzas)
- Genera resumen: total facturado, total cobrado, total pendiente, total vencido del período
- Exportable como PDF — similar al patrón de reportes existente

**Documentos de proveedores:**
- En `/suppliers/[id]`, sección "Documentos recibidos"
- Subir PDF de factura del proveedor → Storage bucket `proveedor-docs` (crear si no existe)
- Vincular documento a `cuentas_pagar.id` (campo `documento_url TEXT` en la tabla)
- SQL: `ALTER TABLE cuentas_pagar ADD COLUMN IF NOT EXISTS documento_url TEXT;`
- Preview del PDF inline (link + icono)

**ND/NC de proveedores:**
- En `/accounts-payable/[id]`, botón "Registrar NC/ND proveedor"
- Inserta en `cuentas_pagar` con tipo `NC` o `ND` y `parent_ap_id` referenciando la CxP original
- Ajusta el saldo de la CxP padre al calcular el total real

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

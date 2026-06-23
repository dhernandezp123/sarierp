# Sari Express ERP — Hardening y Trial

Este archivo es el registro versionado del plan de correcciones del ERP.
Debe actualizarse en el mismo commit de cada fix para que el estado viaje con
Git entre computadoras y ambientes.

## Reglas del registro

- No eliminar hallazgos completados; conservarlos como historial.
- No marcar `Completado` si falta SQL, RLS, pruebas o una acción manual.
- Registrar por separado código desplegado y SQL ejecutado.
- Todo SQL nuevo debe ser una migración versionada e idempotente.
- Toda corrección debe ejecutar, como mínimo:
  - `npx tsc --noEmit`
  - `npm run lint`
  - pruebas relacionadas
  - `npm run build` antes de cerrar una fase
- Estados permitidos: `Pendiente`, `En progreso`, `Bloqueado`, `En validación`,
  `Completado`.

## Baseline de auditoría

Fecha: 22/06/2026

| Validación | Resultado inicial |
|---|---|
| TypeScript | Correcto |
| Build de producción | Correcto |
| ESLint | 277 errores, 94 advertencias en baseline; 95 en validación de Fase 0 |
| Pruebas automatizadas | 0 archivos |
| npm audit | 2 vulnerabilidades moderadas |
| Migraciones | 64 SQL manuales, sin runner formal |
| Esquema real vs registro | Se detectó deriva en Fase 21 |

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Baseline, backup y auditoría real de esquema/RLS | Completado |
| 1 | Seguridad, RLS y escalamiento de usuarios | Completado |
| 2 | Migraciones y constraints de integridad | Completado |
| 3 | Autenticación SSR, sesión y permisos | Completado |
| 4 | Facturación, CAI, CxC, CxP y pagos | En progreso |
| 5 | Transacciones de cotización, pricing y operaciones | Pendiente |
| 6 | Miami: embarques persistentes e historial | Pendiente |
| 7 | Estados, alertas y notificaciones | Pendiente |
| 8 | Reportes, dashboards, monedas, GP y fechas | Pendiente |
| 9 | UX, responsive y protección de formularios | Pendiente |
| 10 | Calidad, modularización, documentación y CI | Pendiente |
| 11 | Ambiente Trial aislado | Pendiente |
| 12 | E2E, UAT freight-forwarding y release | Pendiente |

## Hallazgos

### Seguridad y acceso

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| SEC-001 | RLS de `agent_quotes` y `pricing_items` permite acceso a cualquier usuario aprobado, incluido Cliente | Crítica | Completado |
| SEC-002 | RLS de `client_rates` puede exponer o permitir modificar tarifas privadas | Crítica | Completado |
| SEC-003 | `garantias_navieras` tiene RLS activo pero ninguna política; queda bloqueada para usuarios autenticados | Alta | Completado |
| SEC-004 | Verificar posible escalamiento mediante onboarding, metadata y escritura de `profiles` | Crítica | Completado |
| SEC-005 | Protección de rutas solo del lado cliente; proxy no usa sesión SSR real | Alta | Completado |
| SEC-006 | Cliente puede intentar acceder a Settings/CAI por excepción global de permisos | Alta | Completado |
| SEC-007 | Políticas de `notifications` y `profiles` no están completamente versionadas | Alta | Completado |
| SEC-008 | Auditar funciones `SECURITY DEFINER`, grants y `search_path` | Alta | Completado |
| SEC-009 | Políticas `USING/WITH CHECK (true)` permiten acceso total autenticado en agentes, catálogos, historial, validación de costos y borradores BL | Crítica | Completado |
| SEC-010 | Las 55 tablas y funciones públicas conservan grants `ALL` para `anon`; RLS reduce el impacto pero amplía innecesariamente la superficie | Alta | Completado |
| SEC-011 | Cinco funciones `SECURITY DEFINER` no fijan `search_path`: `auto_match_pre_alert`, `generate_quotation_number`, `handle_new_quotation_status_history`, `handle_new_user` y `prevent_role_change_by_non_admin` | Crítica | Completado |
| SEC-012 | Invitaciones ignoran el rol elegido y onboarding intenta autoaprobar/cambiar rol contra RLS | Crítica | Completado |
| SEC-013 | Portal no permite solicitar Cliente y el alta pública no distingue acceso interno de acceso cliente | Alta | Completado |
| SEC-014 | Invitado aprobado no puede iniciar sesión porque onboarding no establece contraseña | Alta | Completado |
| SEC-015 | Portal no ofrece recuperación segura de contraseña ni callback PKCE | Alta | Completado |

### Integridad y finanzas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FIN-001 | Se permiten documentos fiscales sin CAI activo | Crítica | Completado |
| FIN-002 | Numeración CAI se calcula en cliente y es vulnerable a concurrencia | Crítica | Completado |
| FIN-003 | Activación de CAI no es atómica y no garantiza uno solo | Crítica | Completado |
| FIN-004 | Pago y cambio de estado se guardan en operaciones separadas | Alta | Pendiente |
| FIN-005 | Pagos pueden eliminarse físicamente sin reverso ni auditoría suficiente | Alta | Pendiente |
| FIN-006 | Cuentas por cobrar ignora pagos parciales, NC y ND en reportes | Alta | Pendiente |
| FIN-007 | Facturas vencidas no actualizan estado automáticamente | Alta | Pendiente |
| FIN-008 | CxP puede generarse varias veces desde la misma cotización | Alta | Completado |
| FIN-009 | Falta segregación creador/aprobador/pagador | Media | Pendiente |
| FIN-010 | Validar tratamiento de ISV en costo real y GP con Contabilidad | Media | Pendiente |
| FIN-011 | Implementar fase pendiente de retenciones ISV después del hardening | Media | Pendiente |

### Flujos y datos

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FLOW-001 | Estados legacy y actuales de cotización no coinciden | Crítica | Pendiente |
| FLOW-002 | Selección de tarifa y regeneración de pricing no son atómicas | Crítica | Pendiente |
| FLOW-003 | Operaciones `delete + insert` pueden perder contenedores, carga, BL o pricing | Crítica | Pendiente |
| FLOW-004 | Creación de cotización y tablas hijas no tiene rollback | Alta | Pendiente |
| FLOW-005 | Repricing puede actualizar SI y bookings parcialmente | Alta | Pendiente |
| FLOW-006 | No existe constraint de una tarifa seleccionada por cotización | Alta | Completado |
| FLOW-007 | No existe protección suficiente contra SI/CxP/proveedor duplicados | Alta | Completado |
| FLOW-008 | Numeración de manifiestos basada en `COUNT` es concurrente | Alta | Completado |
| FLOW-009 | Código muerto en duplicación de cotización | Baja | Pendiente |

### Miami y tracking

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| MIA-001 | Lista de embarque no crea un embarque/consolidación persistente | Alta | Pendiente |
| MIA-002 | Paquetes no conservan historial completo de milestones | Alta | Pendiente |
| MIA-003 | Falta vincular paquetes con vuelo, camión, contenedor o despacho | Alta | Pendiente |
| MIA-004 | Falta POD, reversos controlados y auditoría por evento | Media | Pendiente |
| MIA-005 | Agregar CHECK de `tipo_carga` y `cargo_status` al esquema real | Alta | Completado |
| MIA-006 | Revisar unicidad y tratamiento de tracking duplicado | Media | Completado |

### Bugs funcionales

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| BUG-001 | Reporte Pagos a Proveedores tiene código inalcanzable | Alta | Pendiente |
| BUG-002 | Notificaciones de tarifa vencida filtran estado legacy `Cotizada` | Alta | Pendiente |
| BUG-003 | Proveedores busca cotizaciones legacy `Aprobada` | Alta | Pendiente |
| BUG-004 | `/profile` no está autorizado para roles no Admin | Alta | Completado |
| BUG-005 | Tutorial Admin enlaza `/users` en vez de `/admin/users` | Media | Completado |
| BUG-006 | Sidebar cuenta notificaciones que nunca se marcan como leídas | Alta | Pendiente |
| BUG-007 | Tres sistemas de notificación están desconectados | Alta | Pendiente |

### Reportes y fechas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| REP-001 | Reportes pueden sumar USD y HNL y etiquetar con una sola moneda | Crítica | Pendiente |
| REP-002 | Dashboard financiero llama Revenue a venta cotizada, no facturada | Alta | Pendiente |
| REP-003 | GP real mezcla operaciones con y sin costos reales completos | Alta | Pendiente |
| REP-004 | Filtros usan fecha de creación en lugar de fecha de negocio | Media | Pendiente |
| REP-005 | Uso de UTC puede adelantar fechas un día en Guatemala | Alta | Pendiente |
| REP-006 | Fechas `DATE` pueden mostrarse como el día anterior | Alta | Pendiente |
| REP-007 | Crear helper único de fecha, moneda y tipo de cambio | Alta | Pendiente |

### UX y documentación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| UX-001 | ERP interno no tiene sidebar/navegación móvil | Alta | Pendiente |
| UX-002 | Eliminaciones sensibles no piden confirmación | Alta | Pendiente |
| UX-003 | Formularios largos no tienen autosave ni guard de cambios | Alta | Pendiente |
| UX-004 | Filtros activos mantienen estilos inconsistentes | Media | Pendiente |
| UX-005 | Branding del sidebar difiere de configuraciones anteriores | Baja | Pendiente |
| UX-006 | Documento raíz usa `lang="en"` en una aplicación española | Baja | Pendiente |
| UX-007 | Revisar campos operativos del PDF por modalidad | Alta | Pendiente |
| UX-008 | Mejorar errores, loaders, navegación y accesibilidad | Media | Pendiente |

### Calidad y operación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| QA-001 | ESLint inicia con 277 errores y 94 advertencias | Alta | Pendiente |
| QA-002 | No existen pruebas automatizadas | Crítica | Pendiente |
| QA-003 | No existe CI como puerta de calidad | Alta | Pendiente |
| QA-004 | Páginas críticas superan 1,000–4,900 líneas | Alta | Pendiente |
| QA-005 | Uso extendido de `any` y casts inseguros | Alta | Pendiente |
| QA-006 | README continúa siendo el de `create-next-app` | Media | Pendiente |
| QA-007 | No existe un runner formal de migraciones | Crítica | Pendiente |
| QA-008 | `AGENTS.md`, `PHASES.md`, estados y código están desalineados | Alta | Pendiente |
| QA-009 | Auditoría npm mantiene dos vulnerabilidades moderadas sin fix | Media | Pendiente |

### Legal y privacidad

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| LEG-001 | La página pública no identifica todavía denominación legal, RTN/ID y domicilio contractual de DHer | Crítica | Bloqueado por datos del titular |
| LEG-002 | SLA, respaldos, retención, exportación y eliminación deben reflejar capacidades y planes realmente ofrecidos | Alta | Pendiente de definición comercial |
| LEG-003 | Términos, privacidad, tratamiento de datos y limitación de responsabilidad requieren revisión de abogado hondureño | Alta | En validación jurídica |
| LEG-004 | Falta registrar versión y aceptación expresa de términos por organización/usuario | Alta | Pendiente |

## Ambiente Trial

El Trial se implementará después de completar las fases 0–10.

### Requisitos

- Deployment y Supabase separados de producción.
- Cero datos reales de Sari Express.
- Workspace aislado por prospecto.
- Registro autónomo con correo verificado.
- Vigencia configurable de 3, 7, 14 o 30 días.
- Dataset ficticio precargado.
- Banner de días restantes.
- Expiración y bloqueo automáticos.
- Panel interno para extender, revocar o convertir trials.
- Rate limiting, protección antiabuso y auditoría.
- Emails de bienvenida, recordatorio y expiración.

### Decisión Supabase Pro

Estado: `Pendiente de evaluación en Fase 11`.

Antes de adquirir Supabase Pro se evaluará:

- Si el ambiente Trial requiere proyecto separado permanente.
- Cantidad esperada de trials simultáneos.
- Necesidad de branching, PITR, backups y retención de logs.
- Uso estimado de base de datos, storage, realtime y funciones.
- Necesidad de cron y límites de ejecución.
- Costo de un proyecto demo compartido con workspaces frente a proyectos
  aislados por prospecto.

No se recomienda comprar un plan únicamente por anticipación. La decisión se
tomará con la arquitectura Trial definida y una estimación real de uso.

## Bitácora de cambios

Agregar una entrada por fix:

```md
### YYYY-MM-DD — ID — Título

- Estado: En validación | Completado
- Código:
  - `ruta/archivo.ts`
- SQL:
  - `sql/YYYYMMDD_descripcion.sql`
- Validaciones:
  - `npx tsc --noEmit`: OK
  - `npm run lint`: OK / deuda restante documentada
  - Tests: descripción
  - Build: OK
- Verificación manual/RLS: descripción
- Riesgos pendientes: ninguno / detalle
- Commit: hash pendiente
```

### 2026-06-22 — BASELINE — Registro inicial

- Estado: Completado
- Se creó el plan maestro de hardening y ambiente Trial.
- Se registraron los hallazgos iniciales de la auditoría integral.
- Se añadió a `AGENTS.md` la obligación de mantener esta bitácora.
- Supabase Pro queda pendiente de evaluación en Fase 11.
- Commit: `f591015`

### 2026-06-22 — LEGAL — Términos de uso y privacidad

- Estado: En validación jurídica; no marcar como versión contractual final.
- Código:
  - `src/app/politicas/page.tsx`
  - `src/components/marketing/ForwardersLanding.tsx`
- Validaciones:
  - ESLint: cero errores; una advertencia previa de `<img>` en la landing.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
- Cambios:
  - Se separaron alcance contractual, privacidad, subprocesadores, cookies,
    retención, documentos logísticos, propiedad intelectual, confidencialidad,
    responsabilidad, terminación, Trial y ley aplicable.
  - Se eliminaron promesas absolutas de disponibilidad, seguridad, retención y
    respuesta que no estaban ligadas a un SLA o contrato.
- Pendiente del titular:
  - Denominación legal, RTN/identificación y domicilio de DHer.
  - Jurisdicción/ciudad o cláusula arbitral, política real de backups/retención,
    SLA ofrecido y confirmación de correos/dominio.
  - Revisión y aprobación por abogado hondureño.
- Commit: `5f263b9`

### 2026-06-22 — FASE-1 — Settings, perfiles y notificaciones

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/lib/permissions.ts`
  - `src/app/(protected)/layout.tsx`
  - `src/lib/notifications.ts`
- SQL:
  - `supabase/migrations/20260622210000_phase1_notifications_profiles.sql`
- Pruebas:
  - `supabase/tests/phase1_notifications_profiles.sql`
  - `supabase db reset --local`: OK.
  - Suites RLS de Fase 1: OK, con rollback.
  - `supabase db lint --local --level error`: OK.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos TypeScript modificados: OK.
- Cambios:
  - Settings Empresa queda disponible al personal interno; CAI solo a
    Admin/Contabilidad/Finanzas; Cliente vuelve al portal sin bucle.
  - Matching de rutas exige segmento completo y evita prefijos accidentales.
  - Directorio de perfiles excluye Cliente y pendientes para roles no Admin.
  - Notificaciones internas se crean mediante RPC autorizada y el usuario solo
    puede cambiar `is_read`.
  - Notificaciones de portal permiten inserción de Admin/Operaciones y Cliente
    solo puede cambiar `read_at`.
- Producción:
  - Migración aplicada y registrada como `20260622210000`.
  - Historial local/remoto alineado y `db push --dry-run` sin pendientes.
- Commit: `f8e209e`

### 2026-06-22 — UI — Filtros, navegación y alertas

- Estado: Completado
- Código:
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/financial-dashboard/page.tsx`
  - `src/components/layout/sidebar.tsx`
  - `src/components/layout/topbar.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
- Cambios:
  - Presets activos azules y estado personalizado en ambos dashboards.
  - Match exacto de Dashboard Bodega para no activarlo en Manifiestos.
  - Badge superior basado en alertas altas nuevas, persistido por usuario.
- Commit: `0a0038d`

### 2026-06-22 — NEXT-001 — Convención Proxy

- Estado: Completado
- Código:
  - `src/proxy.ts`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK; Next reconoce `Proxy (Middleware)`.
- Cambio:
  - Se migró `middleware.ts` a la convención `proxy.ts` de Next.js 16.
- Riesgo pendiente:
  - SEC-005: todavía requiere migrar la sesión a SSR real.
- Commit: `4d3a5c7`

### 2026-06-22 — UX — Landing de freight forwarders

- Estado: Completado
- Código:
  - `src/components/marketing/ForwardersLanding.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
  - ESLint del archivo: cero errores, una advertencia por imagen externa.
- Commit: `897a1d0`

### 2026-06-22 — UX — Paginación y filtros reutilizables

- Estado: Completado
- Código:
  - `src/components/ui/Pagination.tsx`
  - `src/lib/ui-classes.ts`
  - Listados de CxP, clientes, histórico, facturación, inventario y operaciones.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK.
  - Reinicio de página movido a eventos de filtro para evitar renders en cascada.
- Commit: `b995bd9`

### 2026-06-22 — FASE-0 — Baseline reproducible y auditoría real

- Estado: Completado
- Código/configuración:
  - `package.json`: Supabase CLI 2.107.0 agregado como devDependency.
  - `package-lock.json`: dependencia bloqueada.
  - `supabase/config.toml`: configuración local inicial creada.
  - `supabase/seed.sql`: seed local vacío para evitar datos reales.
  - `.gitignore`: carpeta `/backups/` excluida de Git.
- Verificaciones:
  - CLI ejecutable con `npx supabase --version`: 2.107.0.
  - Proyecto vinculado coincide con `NEXT_PUBLIC_SUPABASE_URL`.
  - Metadata local `.temp` correctamente ignorada por Git.
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK (solo avisos esperados de CRLF en Windows).
  - Docker Desktop y WSL 2 instalados; Docker Engine verificado.
  - Backup remoto de roles, esquema y datos completado en `/backups/`.
  - Migración baseline creada: `supabase/migrations/20260622175445_baseline.sql`.
  - Historial local y remoto alineado en `20260622175445`.
  - `supabase start`: stack local iniciado correctamente.
  - `supabase db reset --local`: reconstrucción desde cero completada.
  - Diff `migrations -> linked` para `public`: sin diferencias.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK (Next.js 16.2.6, 57 páginas estáticas).
  - `npm run lint`: deuda existente, 277 errores y 95 advertencias.
- Riesgos observados:
  - El dump de datos advierte relaciones circulares en `profiles`,
    `quotations`, `bills_of_lading`, `invoices`, `cuentas_pagar` y
    `clientes`; la restauración local debe validarse con constraints/triggers.
  - 55/55 tablas tienen RLS habilitado; `garantias_navieras` no tiene políticas.
  - Se detectaron 22 políticas con expresiones permisivas `true`.
  - Se detectaron grants `ALL` a `anon` en las 55 tablas públicas.
  - 38 funciones son `SECURITY DEFINER`; cinco no fijan `search_path`.
- Próximo paso:
  - Fase 1: corregir RLS, funciones privilegiadas, grants y escalamiento de rol.
- Commit: `f591015`

### 2026-06-22 — FASE-1 — Hardening inicial de RLS y perfiles

- Estado: Completado y aplicado en remoto; SEC-005 continúa en Fase 3 (SSR).
- SQL:
  - `supabase/migrations/20260622190000_phase1_rls_hardening.sql`
- Pruebas:
  - `supabase/tests/phase1_rls.sql`
  - Matriz validada para Admin, Pricing, Ventas, Operaciones, Contabilidad,
    Finanzas, Cliente y anon.
  - `supabase db reset --local`: OK.
  - Prueba RLS transaccional con rollback: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
- Cambios principales:
  - Se agregaron los roles de esquema `Finanzas` y `Cliente` ya usados por UI.
  - Cliente dejó de calificarse como usuario interno aprobado.
  - Se bloqueó la edición propia de rol, aprobación, actividad y vínculo cliente.
  - Agentes, catálogos, costos, historial, BL y garantías usan la matriz aprobada.
  - Funciones privilegiadas fijan `search_path` y `anon` solo puede crear leads.
- Producción:
  - Migración aplicada y registrada como `20260622190000`.
  - `supabase db push --dry-run`: base remota al día.
  - Dump remoto posterior: 36 políticas nuevas, cero políticas legacy abiertas.
  - `anon`: únicamente `USAGE` del esquema e `INSERT` sobre `leads`.
  - El warning posterior de caché `pg-delta` no afectó la migración; se desactivó
    el motor experimental local para usar `migra` de forma estable.
- Commit: `f591015`

### 2026-06-22 — FASE-2 — Integridad inicial de Miami

- Estado: En validación; aplicado en remoto, pendiente de auditar y limpiar datos legacy.
- SQL:
  - `supabase/migrations/20260622223000_phase2_miami_integrity.sql`
  - `supabase/preflight/phase2_integrity_audit.sql`
- Pruebas:
  - `supabase/tests/phase2_miami_integrity.sql`
  - `supabase db reset --local`: OK.
  - Prueba transaccional con rollback: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 58 páginas estáticas.
  - `npx tsc --noEmit`: OK.
  - `npm run lint`: deuda global preexistente, 277 errores y 93 advertencias;
    los archivos de esta entrega son SQL y documentación.
- Cambios:
  - La numeración de manifiestos deja de depender de `COUNT` y usa una secuencia
    global protegida, segura ante solicitudes concurrentes.
  - El RPC de numeración queda restringido a Admin y Operaciones.
  - Se agregan constraints `NOT VALID` para tipo de carga, estado, medidas no
    negativas y total de paquetes no negativo; protegen escrituras nuevas sin
    bloquear todavía por datos legacy.
  - El preflight audita duplicados y valores inválidos antes de imponer o validar
    constraints adicionales sobre pricing, SI, CxP, tracking y Miami.
- Riesgos pendientes:
  - Ejecutar el preflight contra remoto y limpiar cualquier fila reportada.
  - Validar los constraints después de la limpieza.
  - Los números de secuencia pueden tener saltos; esto es esperado y evita
    reutilizar identificadores tras errores o transacciones revertidas.
- Producción:
  - Migración aplicada y registrada como `20260622223000`.
  - `supabase db push --linked --dry-run`: remoto al día.
- Commit: `c1cb17a`

### 2026-06-22 — FASE-2 — Constraints validados y unicidad operativa

- Estado: Completado para FLOW-006, FLOW-008 y MIA-005; FLOW-007 continúa
  en progreso por la generación idempotente de CxP pendiente.
- SQL:
  - `supabase/migrations/20260622231500_phase2_validate_integrity.sql`
- Pruebas:
  - Preflight remoto: ocho verificaciones con cero grupos en conflicto.
  - `supabase/tests/phase2_validated_integrity.sql`: OK, con rollback.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
- Cambios:
  - Se validaron los cuatro constraints de tipo, estado y cantidades de Miami.
  - Solo puede existir una tarifa activa seleccionada por cotización.
  - Solo puede existir una Shipping Instruction activa por cotización.
  - Una factura AP no anulada no puede repetir su número para el mismo proveedor;
    la comparación ignora mayúsculas y espacios exteriores.
- Decisiones de dominio:
  - No se hizo único el tracking: varias piezas pueden compartir referencia.
  - No se hizo única la combinación proveedor/factura en líneas de costo real:
    una factura puede contener varios conceptos legítimos.
- Producción:
  - Migración aplicada y registrada como `20260622231500`.
- Riesgo pendiente:
  - La creación automática de CxP desde una cotización necesita una clave de
    idempotencia/RPC transaccional para distinguir duplicados de costos legítimos.
- Commit: `0d114b2`

### 2026-06-22 — FASE-2 — CxP de flete idempotente

- Estado: Completado; cierra FIN-008 y FLOW-007 y completa la Fase 2.
- Código:
  - `src/app/(protected)/quotations/[id]/page.tsx`
- SQL:
  - `supabase/migrations/20260622234500_phase2_idempotent_freight_payable.sql`
- Pruebas:
  - `supabase/tests/phase2_idempotent_freight_payable.sql`: OK, con rollback.
  - Dos llamadas consecutivas retornan el mismo ID y solo una crea la CxP.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 58 páginas estáticas.
  - ESLint del archivo modificado conserva deuda previa: 10 errores y 11
    advertencias; el bloque nuevo no introduce `any` ni efectos adicionales.
- Cambios:
  - La CxP automática se crea mediante un RPC transaccional autorizado solo para
    Admin, Finanzas y Contabilidad.
  - Una clave de generación por cotización evita duplicados por doble clic,
    reintentos o solicitudes concurrentes sin bloquear otros costos legítimos.
  - El RPC valida cotización Ganada, tarifa seleccionada, costo positivo y un
    único proveedor activo vinculado al agente.
  - La UI informa si creó la CxP o si ya existía.
- Producción:
  - Migración aplicada y registrada como `20260622234500`.
- Riesgos pendientes:
  - Si un agente tiene más de un proveedor activo vinculado, el RPC lo bloquea
    con un error explícito hasta corregir el catálogo.
- Commit: `5bc4e71`

### 2026-06-22 — FASE-3 — Sesión SSR y protección de rutas

- Estado: En validación; protección anónima comprobada, pendiente de prueba manual
  con sesiones reales de personal y Cliente antes de cerrar SEC-005.
- Código:
  - `src/proxy.ts`
  - `src/lib/supabase/client.ts`
  - `src/lib/supabase/server.ts`
  - `src/app/(protected)/layout.tsx`
  - `src/components/layout/protected-shell.tsx`
  - `src/hooks/useUser.tsx`
  - `src/app/portal/layout.tsx`
  - Páginas del portal ajustadas para identidad nullable segura.
  - `src/lib/permissions.ts`
  - `src/components/onboarding/OnboardingTutorial.tsx`
- Dependencias:
  - Se agregó `@supabase/ssr` 0.12.0.
  - Se eliminó `@supabase/auth-helpers-nextjs`.
  - `@supabase/supabase-js` resolvió a 2.108.2, compatible con el peer de SSR.
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 58 rutas; las rutas ERP ahora son dinámicas por sesión.
  - ESLint de los archivos modificados: cero errores, siete advertencias legacy.
  - `npm run lint`: deuda global reducida a 268 errores y 89 advertencias.
  - `npm audit --omit=dev`: dos vulnerabilidades moderadas heredadas de PostCSS
    dentro de Next; no se ejecutó `--force` porque propone un downgrade rompedor.
  - HTTP local sin sesión:
    - `/login`, `/portal/login` y `/politicas`: 200.
    - `/dashboard` y `/miami/inventario`: 307 a `/login`.
    - `/portal`: 307 a `/portal/login`.
- Cambios:
  - Las sesiones pasan de `localStorage` a cookies gestionadas por Supabase SSR.
  - Proxy valida claims, refresca cookies y bloquea rutas privadas antes del render.
  - El layout ERP vuelve a comprobar usuario y perfil aprobado/activo en servidor.
  - Cliente no puede renderizar el ERP interno y se redirige a `/portal`.
  - `useUser` comparte una sola carga de identidad por árbol, evitando decenas de
    consultas duplicadas por página.
  - `/portal/login` deja de quedar bloqueado por el layout autenticado del portal.
  - Perfil queda disponible para todos los roles internos y el tutorial Admin usa
    `/admin/users`.
- Riesgos pendientes:
  - Los usuarios con una sesión legacy en `localStorage` deberán iniciar sesión de
    nuevo para crear la cookie SSR.
  - Probar login/logout y expiración con Admin, rol interno y Cliente reales.
  - La autorización fina de rutas sigue complementada por RLS y el guard de rol;
    se revisará la estrategia de permisos de servidor antes de cerrar la fase.
- Commit: `b833e8f`

### 2026-06-22 — SEC-012 — Invitaciones y onboarding autorizados

- Estado: Completado en código; el envío real de correo depende de la
  configuración SMTP/redirect URL de Supabase.
- Código:
  - `src/app/api/admin/invite/route.ts`
  - `src/app/onboarding/page.tsx`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint de ambos archivos: cero errores y cero advertencias.
  - `npm run build`: OK, 58 rutas.
- Cambios:
  - El backend Admin asigna y aprueba el rol seleccionado después de invitar.
  - Las invitaciones ahora admiten también Cliente, coherente con el selector UI.
  - Onboarding solo actualiza nombre, apellido y correo; ya no intenta escalar rol,
    estado ni actividad desde una sesión no administrativa.
- Riesgos pendientes:
  - Probar entrega de invitación y callback con `NEXT_PUBLIC_SITE_URL` del ambiente.
  - Un Cliente invitado debe vincularse a un registro de cliente para ver datos.
- Commit: `80e7e5f`

### 2026-06-22 — SEC-013 — Registro e invitación de clientes

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/app/portal/register/page.tsx`
  - `src/app/portal/login/page.tsx`
  - `src/app/portal/layout.tsx`
  - `src/app/(protected)/admin/users/page.tsx`
  - `src/app/api/admin/invite/route.ts`
  - `src/app/onboarding/page.tsx`
  - `src/proxy.ts`
- SQL:
  - `supabase/migrations/20260622235900_phase3_client_registration.sql`
- Pruebas:
  - `supabase/tests/phase3_client_registration.sql`: OK, con rollback.
  - Solicitud Cliente crea perfil `Cliente/Pendiente`, sin aprobación ni vínculo.
  - Metadata que solicita Admin se degrada a `Ventas/Pendiente`.
  - `supabase db reset --local`: OK.
  - `supabase db lint --local --level error`: OK.
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos modificados: cero errores y cero advertencias.
  - `npm run build`: OK, 59 rutas.
- Cambios:
  - Portal Login ofrece “Solicitar cuenta” y `/portal/register` recopila persona,
    empresa, teléfono, correo y contraseña.
  - El registro público solo puede pedir Cliente y siempre queda Pendiente.
  - Admin ve empresa/teléfono, vincula el perfil a `clientes` y solo entonces
    puede aprobarlo.
  - “Invitar usuario” incluye Cliente; las invitaciones Cliente también quedan
    pendientes de vínculo, mientras los roles internos conservan alta directa.
  - Onboarding respeta rol/estado asignados por Admin y nunca se autoaprueba.
- Producción:
  - Migración aplicada y registrada como `20260622235900`.
- Riesgos pendientes:
  - Verificar política real de confirmación de correo y SMTP en Supabase Auth.
  - Probar manualmente solicitud, vínculo, aprobación y primer login Cliente.
- Commit: `1f7531f`

### 2026-06-23 — SEC-014 — Contraseña de invitado y caché de perfiles

- Estado: Completado y aplicado en remoto.
- Código:
  - `src/app/onboarding/page.tsx`
- SQL:
  - `supabase/migrations/20260623001500_phase3_profile_schema_cache.sql`
- Validaciones:
  - Migración local: OK; columnas ya existentes confirmadas.
  - `supabase db lint --local --level error`: OK.
  - `npx tsc --noEmit`: OK.
  - ESLint de onboarding: cero errores y cero advertencias.
  - `npm run build`: OK, 59 rutas.
- Cambios:
  - Onboarding exige crear y confirmar una contraseña de al menos 8 caracteres
    antes de completar el perfil invitado.
  - Se fuerza `pgrst reload schema` para que la API reconozca inmediatamente
    `registration_company` y `registration_phone`.
- Producción:
  - Migración aplicada como `20260623001500`; ambas columnas ya existían, lo que
    confirmó que el error observado era caché de PostgREST.
- Acción manual:
  - El invitado existente debe abrir su correo de invitación y completar
    onboarding para establecer contraseña; aprobarlo no genera una contraseña.
- Commit: `37da8d4`

### 2026-06-23 — SEC-015 — Recuperación de contraseña Cliente

- Estado: Completado en código; pendiente verificar entrega real del correo.
- Código:
  - `src/app/portal/forgot-password/page.tsx`
  - `src/app/portal/reset-password/page.tsx`
  - `src/app/auth/callback/route.ts`
  - `src/app/portal/login/page.tsx`
  - `src/app/portal/layout.tsx`
  - `src/proxy.ts`
- Validaciones:
  - `npx tsc --noEmit`: OK.
  - ESLint de archivos modificados: cero errores y cero advertencias.
  - `npm run build`: OK, 62 rutas.
  - Se corrigió el requisito Next 16 de `Suspense` para `useSearchParams`.
- Cambios:
  - Portal Login incorpora “¿Olvidaste tu contraseña?”.
  - El formulario envía un correo sin revelar si la cuenta existe.
  - `/auth/callback` intercambia el código PKCE por una sesión SSR y solo acepta
    destinos internos bajo `/portal/`.
  - La sesión temporal permite establecer y confirmar una contraseña nueva;
    después se cierra y vuelve al login.
- Acción manual:
  - Autorizar `/auth/callback` para localhost y producción en Supabase Auth URL
    Configuration y probar un correo real.
- Commit: `7d87b1f`

### 2026-06-23 — FASE-3 — Cierre de autenticación y portal Cliente

- Estado: Completado con validación manual del titular.
- Validación manual:
  - Admin inicia sesión y accede a Dashboard/Profile.
  - Logout invalida acceso y `/dashboard` redirige a `/login`.
  - Registro, vínculo, aprobación y acceso Cliente funcionan correctamente.
  - Recuperación de contraseña Cliente envía enlace y permite restablecer acceso.
- Resultado:
  - SEC-005 queda cerrado; sesión SSR, cookies, proxy, perfil activo, permisos y
    portal Cliente fueron comprobados de extremo a extremo.
- Próximo paso:
  - Fase 4: CAI, numeración fiscal, facturación, CxC, CxP y pagos.
- Commit: `aee39c9`

### 2026-06-23 — FASE-4 — Preflight financiero y fiscal

- Estado: Completado; auditoría local y remota sin conflictos.
- SQL:
  - `supabase/preflight/phase4_finance_audit.sql`
- Validaciones:
  - Ejecución contra base local reconstruida: OK, 11 verificaciones.
  - Ejecución manual contra Supabase remoto: OK, 11/11 conteos en cero.
  - El script es de solo lectura y devuelve únicamente conteos agregados.
- Alcance:
  - Rangos CAI activos, formato, orden y vencimiento.
  - Documentos fiscales sin CAI o fuera del rango estampado.
  - Facturas sin líneas o con subtotal inconsistente.
  - Pagos en moneda distinta, sobrepagos y pagos sobre facturas anuladas.
- Próximo paso:
  - Con los conteos remotos, implementar activación CAI atómica, correlativo fiscal
    transaccional y creación conjunta de factura/líneas.
- Commit: `839df3e`

### 2026-06-23 — FASE-4 — CAI y creación fiscal atómica

- Estado: Completado; código y migración aplicados en remoto.
- Hallazgos: FIN-001, FIN-002 y FIN-003.
- Archivos:
  - `supabase/migrations/20260623010000_phase4_cai_atomic.sql`
  - `supabase/tests/phase4_cai_atomic.sql`
  - `src/app/(protected)/settings/cai/page.tsx`
  - `src/app/(protected)/invoicing/new/page.tsx`
- Cambios:
  - Rangos CAI separados por Factura, Nota de Crédito y Nota de Débito.
  - Activación transaccional con un solo rango activo por tipo documental.
  - Correlativo CAI persistente y bloqueado en base de datos para evitar
    duplicados concurrentes.
  - Factura, líneas, impuestos y avance del correlativo se guardan en una sola
    transacción mediante `create_invoice_with_items`.
  - Proformas usan una secuencia independiente y segura ante concurrencia.
  - La UI ya no calcula números fiscales ni guarda encabezado y líneas por
    separado.
- Validaciones ejecutadas:
  - Preflight remoto: 11/11 verificaciones con cero conflictos.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las dos páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 62 páginas generadas.
  - `supabase db reset --local`: OK con todas las migraciones.
  - `supabase/tests/phase4_cai_atomic.sql`: OK; correlativos consecutivos,
    impuestos, atomicidad, permisos y rollback verificados.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `supabase db push --linked --dry-run`: remoto al día después del despliegue.
- Incidencias detectadas durante pruebas:
  - La primera prueba local detectó una referencia inválida a `clientes.email`;
    se corrigió a `clientes.email_1`. La transacción abortó antes de insertar
    documentos. La segunda ejecución confirmó los correlativos `00000101` y
    `00000102`, y detectó una columna ambigua únicamente en la aserción del test;
    se calificó como `invoice_items.tax_amount`; la tercera ejecución pasó.
- Producción:
  - Migración aplicada y registrada como `20260623010000`.
  - No quedan migraciones locales pendientes contra remoto.
- Riesgo residual:
  - Los tipos y rangos reales deben coincidir con la autorización vigente de SAR
    y ser confirmados por Contabilidad; este hardening no sustituye revisión
    fiscal/legal.
- Commit: pendiente.

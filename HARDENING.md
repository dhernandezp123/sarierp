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
| 5 | Transacciones de cotización, pricing y operaciones | En progreso |
| 6 | Miami: embarques persistentes e historial | En progreso |
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
| SEC-016 | Portal de envíos abre tablas internas y puede exponer notas/contactos operativos | Crítica | En validación |

### Integridad y finanzas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FIN-001 | Se permiten documentos fiscales sin CAI activo | Crítica | Completado |
| FIN-002 | Numeración CAI se calcula en cliente y es vulnerable a concurrencia | Crítica | Completado |
| FIN-003 | Activación de CAI no es atómica y no garantiza uno solo | Crítica | Completado |
| FIN-004 | Pago y cambio de estado se guardan en operaciones separadas | Alta | En validación |
| FIN-005 | Pagos pueden eliminarse físicamente sin reverso ni auditoría suficiente | Alta | En validación |
| FIN-006 | Cuentas por cobrar ignora pagos parciales, NC y ND en reportes | Alta | En validación |
| FIN-007 | Facturas vencidas no actualizan estado automáticamente | Alta | En validación |
| FIN-008 | CxP puede generarse varias veces desde la misma cotización | Alta | Completado |
| FIN-009 | Falta segregación creador/aprobador/pagador | Media | Pendiente |
| FIN-010 | Validar tratamiento de ISV en costo real y GP con Contabilidad | Media | Pendiente |
| FIN-011 | Implementar fase pendiente de retenciones ISV después del hardening | Media | Pendiente |

### Flujos y datos

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| FLOW-001 | Estados legacy y actuales de cotización no coinciden | Crítica | En validación |
| FLOW-002 | Selección de tarifa y regeneración de pricing no son atómicas | Crítica | En validación |
| FLOW-003 | Operaciones `delete + insert` pueden perder contenedores, carga, BL o pricing | Crítica | En validación |
| FLOW-004 | Creación de cotización y tablas hijas no tiene rollback | Alta | En validación |
| FLOW-005 | Repricing puede actualizar SI y bookings parcialmente | Alta | En validación |
| FLOW-006 | No existe constraint de una tarifa seleccionada por cotización | Alta | Completado |
| FLOW-007 | No existe protección suficiente contra SI/CxP/proveedor duplicados | Alta | Completado |
| FLOW-008 | Numeración de manifiestos basada en `COUNT` es concurrente | Alta | Completado |
| FLOW-009 | Código muerto en duplicación de cotización | Baja | En validación |
| FLOW-010 | `pricing_items_delete_policy` solo permite Admin; DELETE silencioso acumula pricing Miami en cada guardado | Crítica | En validación |

### Miami y tracking

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| MIA-001 | Lista de embarque no crea un embarque/consolidación persistente | Alta | En validación |
| MIA-002 | Paquetes no conservan historial completo de milestones | Alta | En validación |
| MIA-003 | Falta vincular paquetes con vuelo, camión, contenedor o despacho | Alta | En validación |
| MIA-004 | Falta POD, reversos controlados y auditoría por evento | Media | En validación |
| MIA-005 | Agregar CHECK de `tipo_carga` y `cargo_status` al esquema real | Alta | Completado |
| MIA-006 | Revisar unicidad y tratamiento de tracking duplicado | Media | Completado |

### Bugs funcionales

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| BUG-001 | Reporte Pagos a Proveedores tiene código inalcanzable | Alta | En validación |
| BUG-002 | Notificaciones de tarifa vencida filtran estado legacy `Cotizada` | Alta | En validación |
| BUG-003 | Proveedores busca cotizaciones legacy `Aprobada` | Alta | En validación |
| BUG-004 | `/profile` no está autorizado para roles no Admin | Alta | Completado |
| BUG-005 | Tutorial Admin enlaza `/users` en vez de `/admin/users` | Media | Completado |
| BUG-006 | Sidebar cuenta notificaciones que nunca se marcan como leídas | Alta | En validación |
| BUG-007 | Tres sistemas de notificación están desconectados | Alta | Pendiente |

### Reportes y fechas

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| REP-001 | Reportes pueden sumar USD y HNL y etiquetar con una sola moneda | Crítica | En validación |
| REP-002 | Dashboard financiero llama Revenue a venta cotizada, no facturada | Alta | En validación |
| REP-003 | GP real mezcla operaciones con y sin costos reales completos | Alta | En validación |
| REP-004 | Filtros usan fecha de creación en lugar de fecha de negocio | Media | Pendiente |
| REP-005 | Uso de UTC puede adelantar fechas un día en Guatemala | Alta | En progreso |
| REP-006 | Fechas `DATE` pueden mostrarse como el día anterior | Alta | En progreso |
| REP-007 | Crear helper único de fecha, moneda y tipo de cambio | Alta | En progreso |

### UX y documentación

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| UX-001 | ERP interno no tiene sidebar/navegación móvil | Alta | En validación |
| UX-002 | Eliminaciones sensibles no piden confirmación | Alta | En validación |
| UX-003 | Formularios largos no tienen autosave ni guard de cambios | Alta | En validación |
| UX-004 | Filtros activos mantienen estilos inconsistentes | Media | Pendiente |
| UX-005 | Branding del sidebar difiere de configuraciones anteriores | Baja | Pendiente |
| UX-006 | Documento raíz usa `lang="en"` en una aplicación española | Baja | Completado |
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
| QA-006 | README continúa siendo el de `create-next-app` | Media | Completado |
| QA-007 | No existe un runner formal de migraciones | Crítica | Pendiente |
| QA-008 | `AGENTS.md`, `PHASES.md`, estados y código están desalineados | Alta | Pendiente |
| QA-009 | Auditoría npm mantiene dos vulnerabilidades moderadas sin fix | Media | Completado |

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
- Commit: `0b5b7e3`

### 2026-06-23 — FASE-4 — Pagos atómicos y reversos auditables

- Estado: En validación manual; migración aplicada en remoto y pruebas
  automatizadas completadas.
- Hallazgos: FIN-004 y FIN-005.
- Archivos:
  - `supabase/migrations/20260623014500_phase4_payment_atomic.sql`
  - `supabase/tests/phase4_payment_atomic.sql`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/invoicing/page.tsx`
- Cambios:
  - Registro de pago, cálculo de saldo, estado y fecha de pago se ejecutan en una
    sola transacción mediante `register_invoice_payment`.
  - Se incorpora el estado `Parcialmente Pagada` para representar cobros reales.
  - Los pagos dejan de eliminarse: `reverse_invoice_payment` conserva el
    movimiento, usuario, fecha y motivo del reverso.
  - Escrituras directas sobre `invoice_payments` quedan revocadas para usuarios
    autenticados; solo los RPC autorizados pueden registrar o revertir.
  - Se bloquean sobrepagos, monedas distintas, fechas futuras, pagos por Ventas,
    anulación con pagos aplicados y estado Pagada con saldo pendiente.
  - CxC, cierre mensual y estado de cuenta excluyen pagos reversados.
  - Registro y reverso generan eventos en `activity_logs`.
- Validaciones ejecutadas:
  - `supabase db reset --local`: OK con todas las migraciones.
  - `supabase/tests/phase4_payment_atomic.sql`: OK; pago parcial/total, bloqueo
    de sobrepago/anulación/DELETE, reverso, permisos, auditoría y rollback.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las dos páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 62 páginas generadas.
  - Migración remota aplicada como `20260623014500`.
- Validación manual pendiente:
  - Registrar un pago parcial y completar el saldo desde una factura aprobada.
  - Reversar uno de los pagos indicando motivo y confirmar que permanece visible,
    deja de sumar y recalcula estado/saldo.
  - Confirmar que no se puede anular una factura con pagos aplicados.
- Riesgo residual:
  - Los constraints de monto positivo y moneda válida protegen escrituras nuevas
    como `NOT VALID`; su validación histórica se hará junto al cierre de CxC.
- Commit: `c0c89a6`

---

### 2026-06-23 — FLOW-010 — Fix acumulación de pricing items en flujo Miami

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgo: FLOW-010.
- Causa raíz: `pricing_items_delete_policy` solo permitía `is_admin()` para DELETE.
  El flujo de guardado Miami en `quotations/[id]/edit` ejecuta DELETE + INSERT para
  reemplazar los pricing items. El DELETE devolvía éxito sin error (Supabase no
  retorna error cuando RLS filtra todas las filas), pero no borraba nada. Cada
  guardado acumulaba un set adicional de items en lugar de reemplazarlos.
- Archivos SQL:
  - `supabase/migrations/20260623030000_fix_pricing_items_delete_rls.sql`
- Cambio:
  - Se reemplaza la política exclusiva de Admin por una matriz explícita para
    Admin, Pricing, Ventas y Operaciones con acceso a la cotización.
  - Contabilidad y Cliente permanecen sin permiso de eliminación.
  - Sigue el mismo patrón de `quotation_cargo_lines_delete_policy` y
    `quotation_containers_delete_policy`.
  - No hay cambios de código TypeScript; el error era exclusivamente de RLS.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK, sin errores.
  - `supabase/tests/phase5_pricing_delete_rls.sql`: OK con cinco roles y rollback.
  - Migración remota aplicada y registrada como `20260623030000`.
- Validación manual pendiente:
  - Abrir una cotización Miami LCL con pricing existente.
  - Guardar desde `/edit` con un monto de pickup distinto.
  - Verificar que el "Detalle de Servicios" en el PDF muestra exactamente un set
    de items (no acumulación).
  - Guardar por segunda vez y confirmar que el set se reemplaza, no se duplica.
- Riesgo residual:
  - La auditoría `supabase/tests/cleanup_duplicate_pricing_items.sql` es de solo
    lectura. No se eliminarán supuestos duplicados sin revisión y respaldo por
    Pricing/Contabilidad.
- Commit: `2f44573`

### 2026-06-23 — FASE-4 — CxC ajustada y vencimientos automáticos

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgos: FIN-006 y FIN-007.
- Archivos:
  - `supabase/migrations/20260623021500_phase4_receivables.sql`
  - `supabase/tests/phase4_receivables.sql`
  - `src/app/(protected)/invoicing/page.tsx`
  - `src/app/(protected)/invoicing/[id]/page.tsx`
  - `src/app/(protected)/reports/page.tsx`
- Cambios:
  - `invoice_receivables` centraliza factura menos NC, más ND, menos pagos
    aplicados y excluye pagos reversados.
  - Facturación, detalle, CxC, vencidas y estado de cuenta consumen el saldo
    ajustado en lugar del total bruto.
  - Se agrega estado `Saldada` para facturas compensadas totalmente por NC.
  - Notas nuevas deben pertenecer al mismo cliente y moneda de la factura.
  - Registro/reverso de pagos usa el total ajustado para bloquear sobrepagos.
  - `refresh_invoice_receivable_statuses` y una tarea diaria `pg_cron` a las
    00:05 UTC sincronizan estados vencidos.
- Validaciones ejecutadas:
  - `supabase db reset --local`: OK con todas las migraciones locales presentes.
  - `supabase/tests/phase4_receivables.sql`: OK; NC/ND, pago parcial/final,
    sobrepago, moneda, vencimiento, cron y rollback.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a las tres páginas modificadas: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260623021500`.
- Riesgos o trabajo pendiente:
  - Validar manualmente Reportes > Cuentas por cobrar y Vencidas con datos reales.
- Commit: `546fbb2`

### 2026-06-23 — PORTAL — Envíos freight con exposición segura

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgo: SEC-016.
- Archivos:
  - `supabase/migrations/20260623020000_phase5_portal_shipments.sql`
  - `supabase/tests/phase5_portal_shipments.sql`
  - `src/app/portal/layout.tsx`
  - `src/app/portal/page.tsx`
  - `src/app/portal/envios/page.tsx`
  - `src/app/portal/envios/[id]/page.tsx`
- Cambios:
  - El portal incorpora listado, detalle, ruta, hitos, fechas, transporte y
    referencias documentales de los envíos freight del cliente.
  - Se descartaron políticas SELECT directas sobre `quotations` y
    `shipping_instructions`; RLS de filas no protege columnas internas.
  - `get_client_shipments` verifica rol Cliente y vínculo `cliente_id`, y devuelve
    únicamente campos comerciales permitidos.
  - Los contadores usan conteos reales y las fechas evitan desfase UTC/Honduras.
- Validaciones ejecutadas:
  - `supabase/tests/phase5_portal_shipments.sql`: OK; aislamiento entre dos
    clientes, acceso directo bloqueado, columnas internas ausentes y rollback.
  - `npx tsc --noEmit`: OK.
  - ESLint dirigido a Portal, Facturación y Reportes: OK, sin advertencias.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260623020000`.
- Validación manual pendiente:
  - Confirmar listado y detalle con un Cliente que tenga una SI vinculada.
- Commit: `ec786fc`

### 2026-06-24 — Sincronización del historial remoto

- Estado: Completado.
- Acción manual:
  - Se registraron como aplicadas las migraciones `20260623020000`,
    `20260623021500`, `20260623030000` y `20260623040000` después de su ejecución
    satisfactoria en Supabase SQL Editor.
- Validación:
  - `supabase migration list --linked`: Local y Remote coinciden en todas las
    versiones hasta `20260623040000`.
- Riesgos pendientes:
  - Mantener SEC-016, FIN-006/007 y FLOW-010 en validación hasta probar sus flujos
    de interfaz con datos reales.
- Commit: `5c6196a`

### 2026-06-24 — FASE-5 — Selección atómica de tarifa de agente

- Estado: En validación manual; migración aplicada en remoto.
- Hallazgos: FLOW-001 y FLOW-002.
- Archivos:
  - `supabase/migrations/20260624010000_phase5_atomic_agent_selection.sql`
  - `supabase/tests/phase5_atomic_agent_selection.sql`
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/lib/tarifa-expiry-check.ts`
- Cambios:
  - La selección de tarifa, deselección anterior, reemplazo de pricing y
    sincronización comercial se ejecutan en una sola transacción mediante RPC.
  - El RPC valida rol Pricing/Admin, pertenencia de la tarifa, motivo y valores
    no negativos antes de modificar datos, y registra el evento en
    `activity_logs`.
  - Las alertas de vencimiento usan los estados vigentes del flujo en lugar del
    estado legacy `Cotizada`.
  - El proceso global de vencimientos deja de ser ejecutable por `anon` y
    `authenticated`; queda reservado a `service_role` y tareas internas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
  - `supabase db reset --local --yes`: OK desde baseline hasta
    `20260624010000`.
  - `supabase/tests/phase5_atomic_agent_selection.sql`: OK; selección única,
    reemplazo total, sincronización, rollback ante línea inválida y permisos.
  - `supabase db lint --local --level error`: OK, sin errores.
  - `npm run build`: OK, 63 páginas generadas.
  - Migración remota aplicada y registrada como `20260624010000`.
  - `supabase migration list --linked`: historial local/remoto alineado.
  - `supabase db push --linked --dry-run`: remoto actualizado, sin pendientes.
  - ESLint dirigido: conserva 31 errores y 5 advertencias preexistentes del
    archivo histórico de Pricing; el cambio no agrega nuevos usos de `any`.
- Riesgos o trabajo pendiente:
  - Probar manualmente el cambio de tarifa en Pricing Comparison con dos
    alternativas y confirmar el motivo, totales y refresco visual.
- Commit: `8c30148`

### 2026-06-24 — FASE-5 — Corrección: Race condition en selección de tarifa

- Estado: Completado
- Hallazgos: FLOW-002 (race condition)
- Archivos:
  - `supabase/migrations/20260624010000_phase5_atomic_agent_selection.sql` (modificado)
  - `supabase/migrations/20260624020000_fix_phase5_atomic_selection_race_condition.sql` (migración de corrección)
- Cambios:
  - Se reemplazó el UPDATE combinado `is_selected = (id = p_agent_quote_id)` por dos UPDATEs secuenciales:
    1. Deseleccionar todas las tarifas de la cotización donde `is_selected = true`
    2. Seleccionar solo la nueva tarifa mediante `UPDATE WHERE id = p_agent_quote_id SET is_selected = true`
  - Esto elimina la race condition donde PostgreSQL detectaba `duplicate key value violates unique constraint "agent_quotes_one_selected_per_quotation_idx"` durante cambios de tarifa.
  - La causa raíz era que el UPDATE combinado permitía que PostgreSQL viera temporalmente dos registros con `is_selected = true` en el mismo `quotation_id` durante el apply del índice único.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK, sin errores.
  - Nueva migración `20260624020000` creada y aplicada exitosamente.
  - `supabase migration list --linked`: confirmado sincronización local/remoto en ambas migraciones.
  - Cambio es idempotente y refuerza la integridad del constraint único.
- Riesgos o trabajo pendiente:
  - Ninguno; ya puede seleccionar tarifas sin error de constraint.
- Commit: [en progreso]

### 2026-06-27 — FASE-5 — Sincronización operacional tras cambio de tarifa aceptada

- Estado: En validación manual.
- Hallazgos: FLOW-002, FLOW-003, FLOW-004, FLOW-005 y FLOW-009.
- Código:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/page.tsx`
  - `src/app/(protected)/operations/shipping-instructions/[id]/bookings/[bookingId]/bl/[blId]/page.tsx`
  - `src/app/(protected)/quotations/[id]/page.tsx`
  - `src/app/(protected)/suppliers/[id]/page.tsx`
  - `src/components/pdf/shipping-instruction-order-pdf.tsx`
- SQL:
  - `supabase/migrations/20260627010000_phase5_atomic_operational_repricing.sql`
    agrega RPC transaccional para sincronizar Shipping Instruction y bookings
    editables desde la tarifa seleccionada.
  - `supabase/migrations/20260627020000_phase5_atomic_quotation_children_replace.sql`
    agrega RPC transaccional para reemplazar contenedores, carga suelta y cargos
    Miami sin riesgo de `delete + insert` parcial.
  - `supabase/migrations/20260627030000_phase5_atomic_quotation_create.sql`
    agrega RPC transaccional para crear cotización con contenedores, carga suelta
    y cargos Miami en una sola operación.
  - `supabase/migrations/20260627040000_phase5_atomic_operations_container_replace.sql`
    agrega RPCs transaccionales para reemplazar contenedores de Booking y BL.
  - `supabase/migrations/20260624030000_sales_activities.sql` ajustada para
    recrear policies de forma idempotente si el remoto quedó parcialmente aplicado.
  - Sin migración nueva para selección de tarifa; depende de `20260624010000_phase5_atomic_agent_selection.sql`
    y `20260624020000_fix_phase5_atomic_selection_race_condition.sql`.
- Cambios:
  - Pricing Comparison prepara y sincroniza agente, contacto, email, carrier, ETD,
    tránsito y días libres hacia la Shipping Instruction afectada.
  - Shipping Instruction permite actualizar datos operativos desde la tarifa
    seleccionada en Pricing cuando una tarifa aceptada debe reemplazarse por
    cancelación o falta de espacio del agente.
  - El Routing Order PDF toma `transshipment` desde la cotización cuando no está
    presente en la ruta.
  - La sincronización operacional desde Pricing/Shipping Instruction deja de hacer
    updates secuenciales desde el cliente y pasa por
    `sync_shipping_instruction_from_selected_agent_quote`.
  - La edición de cotizaciones reemplaza tablas hijas mediante
    `replace_quotation_child_lines`, evitando que una falla de insert deje
    contenedores, carga o pricing eliminados.
  - La creación de cotizaciones usa `create_quotation_with_child_lines` para
    evitar encabezados creados sin contenedores, carga o pricing automático.
  - Operaciones reemplaza contenedores de Booking/BL mediante
    `replace_booking_containers` y `replace_bl_containers`, evitando deletes
    silenciosos bloqueados por RLS y reemplazos parciales.
  - La acción de duplicar cotización usa únicamente
    `/quotations/new?duplicateFrom=...`; el flujo viejo de inserción directa
    queda fuera de ejecución.
  - Proveedores lista cotizaciones `Ganada` para asociar CxP manual, en lugar
    del estado legacy `Aprobada`.
  - Las notificaciones de tarifa vencida ya usan estados vigentes del flujo en
    código y SQL de Fase 5.
  - La migración de actividades comerciales ahora elimina policies existentes
    antes de recrearlas para permitir reintentar `supabase db push`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Validación manual pendiente:
  - Con una cotización ya aprobada, seleccionar una nueva tarifa de agente con
    motivo documentado.
  - Confirmar que queda una sola tarifa `is_selected = true`.
  - Confirmar que la Shipping Instruction y bookings no confirmados reflejan el
    nuevo agente/carrier/ETD/tránsito/días libres.
  - Confirmar que bookings con número confirmado, carrier booking o MBL no se
    sobrescriben silenciosamente.
  - Editar una cotización FCL cambiando contenedores y confirmar reemplazo
    correcto.
  - Editar una cotización LCL/Miami cambiando líneas de carga y confirmar que no
    se pierden líneas si una validación falla.
  - Crear una cotización FCL con múltiples contenedores y confirmar encabezado e
    hijos.
  - Crear una cotización Miami/LCL con líneas de carga y confirmar pricing
    automático.
  - Guardar contenedores de un Booking con rol Operaciones y confirmar reemplazo.
  - Guardar contenedores de un BL con rol Operaciones y confirmar reemplazo.
  - En Proveedores, confirmar que el selector de cotización muestra cotizaciones
    `Ganada`.
  - Ejecutar o verificar la notificación de tarifas vencidas con estados vigentes.
- Riesgos o trabajo pendiente:
  - Si la migración `20260624020000` no está aplicada en Supabase remoto, el cambio
    de tarifa puede seguir fallando por el índice único de tarifa seleccionada.
- Commit: pendiente.

### 2026-07-01 — UX-003 — Guard de cambios sin guardar en formularios críticos

- Estado: En validación manual; cubre el guard de navegación. El autosave
  queda como mejora posterior.
- Hallazgo: UX-003.
- Causa raíz: los formularios largos (cotización nueva de 2,300+ líneas,
  edición, factura fiscal, clientes, proveedores) perdían todo lo capturado al
  refrescar, cerrar la pestaña o tocar cualquier link del sidebar.
- Código:
  - `src/components/ui/UnsavedChangesGuard.tsx` (nuevo): componente
    auto-contenido que detecta edición vía eventos `input`/`change` del
    documento; muestra el aviso nativo en refresh/cierre (`beforeunload`) e
    intercepta clics en links internos con el `ConfirmDialog` existente
    (sin `window.confirm`, prohibido por AGENTS.md). Exporta `markFormSaved()`
    para páginas que guardan sin navegar.
  - Montado en:
    - `src/app/(protected)/quotations/new/page.tsx` (con `markFormSaved()`
      tras crear, porque la página permanece y resetea el formulario)
    - `src/app/(protected)/quotations/[id]/edit/page.tsx`
    - `src/app/(protected)/invoicing/new/page.tsx`
    - `src/app/(protected)/clientes/nuevo/page.tsx`
    - `src/app/(protected)/clientes/[id]/edit/page.tsx`
    - `src/app/(protected)/suppliers/new/page.tsx`
- SQL:
  - No aplica.
- Decisiones de diseño:
  - La navegación programática (`router.push` tras guardar o al cancelar) no
    se intercepta a propósito: los flujos de guardado/cancelación existentes
    siguen funcionando sin cambios.
  - La carga inicial de datos (setState) no dispara eventos DOM, por lo que
    abrir un formulario de edición no lo marca sucio; solo la escritura real
    del usuario.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del componente nuevo: cero errores; las páginas montadas conservan
    deuda previa documentada en QA-001.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - En `/quotations/new`, escribir en un campo y hacer clic en un link del
    sidebar: debe aparecer el modal "Cambios sin guardar".
  - "Seguir editando" debe conservar el formulario; "Salir sin guardar" debe
    navegar.
  - Refrescar la pestaña con cambios debe mostrar el aviso del navegador.
  - Crear una cotización y verificar que después del guardado exitoso ya no
    aparece el aviso al navegar.
- Riesgos pendientes:
  - Controles custom que no emiten eventos `input`/`change` (botones de
    combobox) no marcan el formulario sucio por sí solos; la mayoría de la
    captura es tipeo y selects nativos, que sí lo hacen.
  - El autosave (borradores) sigue pendiente dentro de UX-003.
- Commit: `f7eb997`

### 2026-07-01 — UX-001 — Navegación móvil del ERP interno

- Estado: En validación manual.
- Hallazgo: UX-001.
- Causa raíz: el layout protegido renderizaba el sidebar fijo de 256 px en
  todas las resoluciones; en móvil ocupaba la pantalla o quedaba inutilizable
  y no existía otra forma de navegar.
- Código:
  - `src/components/layout/protected-shell.tsx`
  - `src/components/layout/topbar.tsx`
- SQL:
  - No aplica.
- Cambio:
  - En pantallas menores a `lg` el sidebar se oculta y el Topbar muestra un
    botón hamburguesa que abre el mismo Sidebar como drawer con backdrop.
  - El drawer se cierra al navegar (patrón de ajuste de estado en render,
    compatible con la regla `react-hooks/set-state-in-effect`) o al tocar el
    fondo.
  - El título del Topbar se oculta en pantallas muy pequeñas y el padding del
    contenido baja a `p-4` en móvil.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint de ambos archivos: cero errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Abrir el ERP en un viewport móvil (DevTools o teléfono), navegar con el
    drawer y confirmar que se cierra al elegir una sección.
- Riesgos pendientes:
  - Las tablas anchas de algunos módulos siguen requiriendo scroll horizontal
    en móvil; eso queda dentro de UX-008.
- Commit: `46a36e3`

### 2026-07-01 — QA-009 — npm audit sin vulnerabilidades

- Estado: Completado.
- Hallazgo: QA-009.
- Causa raíz: Next.js 16.2.6 fija PostCSS 8.4.31, afectado por
  GHSA-qx2v-qp2m-jg93 (XSS en salida de stringify). El `npm audit fix --force`
  oficial proponía degradar Next a 9.3.3, lo cual es inviable.
- Código/configuración:
  - `package.json`: override `next > postcss: ^8.5.10`.
  - `package-lock.json`: PostCSS de Next resuelto a 8.5.14 (deduplicado con la
    versión que ya usaba Tailwind).
- Validaciones ejecutadas:
  - `npm audit`: 0 vulnerabilidades.
  - `npm run build`: OK, 65 páginas, sin cambios de comportamiento CSS.
  - `npx tsc --noEmit`: OK.
- Riesgos pendientes:
  - Al actualizar Next en el futuro, revisar si ya incluye PostCSS >= 8.5.10 y
    retirar el override para volver a la versión que Next fija oficialmente.
- Commit: `46a36e3`

### 2026-07-01 — REP-001 — Totales de reportes agrupados por moneda

- Estado: En validación manual.
- Hallazgo: REP-001.
- Causa raíz: `totalAmount` sumaba `__amount` de todas las filas sin importar
  `__currency`, y el total se etiquetaba con la moneda de la primera fila o el
  filtro. Un reporte con facturas USD y HNL mostraba una suma sin sentido.
- Código:
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Los totales (tfoot, métricas y PDF) se agrupan por moneda y se muestran
    como `USD 5,000.00 · HNL 12,000.00` cuando hay más de una.
  - El margen promedio solo se calcula cuando hay una sola moneda; con mezcla
    muestra `-` en lugar de un porcentaje engañoso.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del archivo: sin errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Reportes > Facturación/CxC con documentos en USD y HNL: confirmar totales
    separados por moneda en pantalla y PDF.
- Riesgos pendientes:
  - No hay conversión por tipo de cambio (parte de REP-007); los totales se
    presentan por moneda, no consolidados.
- Commit: `55c0761`

### 2026-07-01 — REP-002/REP-003 — Venta cotizada y GP real comparable

- Estado: En validación manual.
- Hallazgos: REP-002 y REP-003.
- Causa raíz:
  - El dashboard financiero llamaba "Revenue" al `total_sale` de cotizaciones
    Ganadas, que es venta cotizada y no facturación.
  - "GP real" restaba los costos reales de algunas operaciones al revenue de
    todas, inflando el resultado; la varianza comparaba costo real parcial
    contra costo cotizado total.
- Código:
  - `src/app/(protected)/financial-dashboard/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - KPI y charts renombrados a "Venta cotizada (Ganadas)" / "Venta", con
    subtítulo "No es facturación" y descripción que remite a Facturación.
  - GP real ahora es `venta de operaciones con costos reales - costos reales`
    y muestra la cobertura (`X de Y ops con costos reales`).
  - La varianza compara costo real contra costo cotizado solo de esas mismas
    operaciones.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos (deuda previa de hoisting documentada en QA-001).
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Con una operación con costos reales y otra sin ellos, confirmar que GP real
    solo considera la primera y que la cobertura se muestra en el KPI.
- Riesgos pendientes:
  - El cierre definitivo de REP-002 (KPI de facturación real emitida) queda
    para cuando Reportes consuma `invoices` en este dashboard.
- Commit: `55c0761`

### 2026-07-01 — UX-002 — Confirmación en eliminaciones sensibles

- Estado: En validación manual.
- Hallazgo: UX-002.
- Causa raíz: los botones de eliminar rango CAI y tarifa de agente ejecutaban
  el DELETE con un solo clic. El resto de eliminaciones sensibles auditadas
  (tarifas de agente en Pricing Comparison, items de costo real, documentos de
  booking, tareas del dashboard) ya usaban modal o motivo obligatorio.
- Código:
  - `src/app/(protected)/settings/cai/page.tsx`
  - `src/app/(protected)/agents/[id]/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Ambas eliminaciones pasan por el `ConfirmDialog` existente con acción
    destructiva marcada en rojo; el rango CAI muestra CAI y rango a eliminar.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Intentar eliminar un rango CAI inactivo y una tarifa de agente: debe
    aparecer el modal y solo borrar al confirmar.
- Riesgos pendientes:
  - Los deletes tipo replace dentro de flujos de guardado (client_rates,
    cargo lines) no piden confirmación porque son parte del guardado; su
    atomicidad se maneja en FLOW-003/FLOW-004.
- Commit: `55c0761`

### 2026-07-01 — BUG-001 — Reporte Pagos a Proveedores inalcanzable

- Estado: En validación manual.
- Hallazgo: BUG-001.
- Causa raíz: en `reports/page.tsx` el `return` del reporte de vencidas
  (`overdue`) no estaba condicionado por `activeReport`, por lo que los bloques
  de filas y columnas de `supplier_payments` eran código inalcanzable. El
  reporte Pagos a Proveedores mostraba siempre los datos de Vencidas. La
  consulta a `pagos_proveedor` sí se ejecutaba correctamente.
- Código:
  - `src/app/(protected)/reports/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - El branch de vencidas queda dentro de `if (activeReport === 'overdue')`
    tanto en `baseRows` como en `columns`, habilitando los bloques de
    `supplier_payments` ya existentes.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint del archivo: sin errores nuevos.
  - `npm run build`: OK, 65 páginas.
- Verificación manual/RLS pendiente:
  - Con rol Admin/Finanzas/Contabilidad, abrir Reportes > Pagos a Proveedores y
    confirmar columnas de proveedor, período, método y monto.
  - Confirmar que Reportes > Vencidas sigue mostrando CxC y CxP vencidas.
- Riesgos pendientes:
  - Ninguno adicional; el fix no cambia consultas ni permisos.
- Commit: `3c1c535`

### 2026-07-01 — BUG-006 — Notificaciones del sidebar se marcan leídas

- Estado: En validación manual.
- Hallazgo: BUG-006.
- Causa raíz: el helper `markCurrentUserNotificationsAsRead` existía pero
  ningún componente lo llamaba, y el sidebar contaba `is_read = false` una sola
  vez al montar. El badge de Alertas crecía indefinidamente.
- Código:
  - `src/lib/notifications.ts`
  - `src/app/(protected)/alerts/page.tsx`
  - `src/components/layout/sidebar.tsx`
- SQL:
  - No aplica; la política RLS de Fase 1 ya permite al usuario actualizar
    `is_read` de sus propias notificaciones.
- Cambio:
  - Al abrir `/alerts`, las notificaciones del usuario se marcan leídas y se
    emite el evento `sari:notifications-read`.
  - El sidebar recalcula el conteo en cada cambio de ruta y escucha el evento
    para poner el badge en cero de inmediato.
  - El update de lectura filtra `is_read = false` para no reescribir filas ya
    leídas.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint: sin errores nuevos en los archivos tocados.
  - `npm run build`: OK, 65 páginas.
- Verificación manual/RLS pendiente:
  - Generar una notificación interna, confirmar el badge, entrar a `/alerts` y
    confirmar que el badge desaparece y no reaparece al navegar.
- Riesgos pendientes:
  - BUG-007 (tres sistemas de notificación desconectados) sigue pendiente; este
    fix solo cubre `notifications` internas del badge de Alertas.
- Commit: `3c1c535`

### 2026-07-01 — REP-005/REP-006/REP-007 — Helper de formato y fechas locales

- Estado: En progreso; corregidos los casos detectados en reportes, dashboards
  y portal. Queda auditoría del resto de módulos y el tipo de cambio.
- Hallazgos: REP-005, REP-006 y REP-007.
- Causa raíz:
  - `new Date('YYYY-MM-DD')` interpreta columnas `DATE` como medianoche UTC y
    en Honduras (UTC-6) muestra el día anterior.
  - `new Date(año, mes, 1).toISOString().slice(0, 10)` devuelve siempre el
    último día del mes anterior, por lo que el preset "Este mes" de dashboards
    y reportes incluía datos del mes previo; `toISOString()` para "hoy"
    devuelve mañana después de las 18:00 hora local.
- Código:
  - `src/lib/format.ts` (nuevo): `parseDateValue`, `formatDate`,
    `formatDateShort`, `formatDateTime`, `toDateInputValue` y `formatMoney`.
  - `src/app/(protected)/reports/page.tsx`
  - `src/app/(protected)/dashboard/page.tsx`
  - `src/app/(protected)/financial-dashboard/page.tsx`
  - `src/app/portal/page.tsx`
  - `src/app/portal/pre-alertas/page.tsx`
  - `src/app/portal/pickup/page.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Presets e iniciales de rango de fecha usan `toDateInputValue` (zona local).
  - `expected_date` y `scheduled_date` del portal se formatean sin desfase.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - ESLint de los archivos nuevos: cero errores.
  - `npm run build`: OK, 65 páginas.
- Verificación manual pendiente:
  - Confirmar el preset "Este mes" en Dashboard, Dashboard Financiero y
    Reportes: `from` debe ser el día 1 del mes actual.
- Riesgos o trabajo pendiente:
  - Quedan usos de `toISOString().slice(0, 10)` en facturación, CAI, agentes,
    pricing-comparison y operaciones por auditar caso por caso.
  - REP-007 queda parcial: falta centralizar tipo de cambio y migrar los
    formateadores locales duplicados al helper.
- Commit: `3c1c535`

### 2026-07-01 — UX-006 — Idioma del documento raíz

- Estado: Completado.
- Hallazgo: UX-006.
- Código:
  - `src/app/layout.tsx`
- Cambio:
  - `<html lang="en">` pasa a `lang="es"`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `npm run build`: OK, 65 páginas.
- Riesgos pendientes:
  - Ninguno.
- Commit: `3c1c535`

### 2026-07-01 — QA-006 — README del proyecto

- Estado: Completado.
- Hallazgo: QA-006.
- Código:
  - `README.md`
- Cambio:
  - Se reemplazó el README de `create-next-app` por documentación real: stack,
    variables de entorno, comandos de desarrollo y validación, flujo de
    migraciones Supabase, estructura de carpetas y convenciones del ERP.
- Validaciones ejecutadas:
  - `npm run build`: OK (sin impacto en código).
- Riesgos pendientes:
  - Ninguno.
- Commit: `3c1c535`

### 2026-07-01 - UX-012 - Vista tabla FCL en comparativo de pricing

- Estado: En validacion.
- Hallazgo: UX-012.
- Causa raiz: El comparativo de tarifas FCL solo tenia vista de cards, lo que
  dificultaba comparar agentes horizontalmente por concepto.
- Codigo:
  - `src/app/(protected)/pricing-comparison/page.tsx`
  - `src/components/pricing/FclAgentComparisonTable.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego un switch `Cards` / `Tabla` para cotizaciones FCL.
  - `Cards` permanece como vista por defecto y conserva la UI existente.
  - La nueva tabla reutiliza las tarifas ya cargadas y el mismo handler de
    seleccion de tarifa mediante confirmacion existente.
  - La tabla resalta mejor costo, tarifa mas rapida y tarifa seleccionada.
  - MBL y PS se toman como cargos por contenedor y se multiplican por la
    cantidad real de contenedores de la cotizacion.
  - Bank Transfer Fee queda fijo en USD 25.
  - DTHC queda editable por naviera; Entrega Local y Redestino se comparten
    entre columnas para comparar con el mismo valor.
  - Los cargos alimentan un total ajustado local en la tabla.
  - Se retiraron filas no usadas de WR and Stuffing, Demurrage / Dia y
    Cancellation Fee.
  - Se agrego `Guardar tabla` para persistir los ajustes FCL en `localStorage`
    por cotizacion; al alternar Cards/Tabla los valores ya no se pierden.
  - Se elimino la fila duplicada `Agente`, porque el agente ya aparece como
    encabezado de cada columna.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Probar `/pricing-comparison` con cotizacion FCL y alternar Cards/Tabla.
  - Seleccionar una tarifa desde la tabla y confirmar que usa el flujo actual.
- Riesgos pendientes:
  - Algunos cargos opcionales solo apareceran si existen como campos en
    `agent_quotes`; no se agregaron queries ni estructura nueva.
  - Los cargos editados son comparativos locales de la tabla y se guardan solo
    en el navegador; no se persisten en Supabase ni cambian la seleccion
    guardada.
- Commit: hash pendiente

### 2026-07-01 - UX-013 - OOCL en catalogo de navieras

- Estado: En validacion.
- Hallazgo: UX-013.
- Causa raiz: OOCL no estaba disponible en el catalogo compartido de carriers,
  por lo que no aparecia en comboboxes ni badges de navieras.
- Codigo:
  - `src/lib/constants/carriers.ts`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego OOCL como carrier tipo `ocean`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - No aplica RLS ni migraciones.
  - Confirmar que OOCL aparece en los selectores de carrier/naviera maritima.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-29 - FLOW-003 - RPC de hijos de cotizacion sin ambiguedad

- Estado: En validacion manual; SQL aplicado en remoto.
- Hallazgo: FLOW-003.
- Causa raiz: `replace_quotation_child_lines` retorna una columna llamada
  `quotation_id` y dentro del cuerpo usaba `where quotation_id = p_quotation_id`
  sin alias de tabla. En PL/pgSQL eso vuelve ambigua la referencia entre columna
  real y variable de salida, provocando el error al guardar desde
  `/quotations/[id]/edit`.
- SQL:
  - `supabase/migrations/20260629090000_fix_replace_quotation_child_lines_ambiguous_id.sql`
- Codigo:
  - Sin cambios TypeScript; el formulario ya llama al RPC correcto.
- Cambio:
  - Se recrea el RPC calificando los deletes como `qc.quotation_id`,
    `qcl.quotation_id` y `pi.quotation_id`.
  - El `return query` ahora expone aliases explicitos para evitar nuevas
    colisiones con variables de salida.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - Editar una cotizacion FCL/LCL/Miami desde `/quotations/[id]/edit` y guardar.
  - Confirmar que contenedores, carga suelta y pricing Miami se reemplazan sin
    error y sin duplicados.
- Riesgos pendientes:
  - No marcar como completado hasta aplicar SQL remoto y probar el flujo.
- Commit: hash pendiente

### 2026-06-29 - UX-009 - Compatibilidad de scroll suave en Next 16

- Estado: Completado.
- Hallazgo: UX-009.
- Causa raiz: Next.js 16 ya no sobrescribe por defecto `scroll-behavior: smooth`
  durante transiciones SPA. Como `globals.css` define smooth scrolling en
  `html`, Next mostraba el aviso `missing-data-scroll-behavior`.
- Codigo:
  - `src/app/layout.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego `data-scroll-behavior="smooth"` al elemento raiz `<html>` para que
    Next desactive temporalmente el smooth scroll durante cambios de ruta.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS:
  - No aplica RLS. Verificar navegacion entre rutas sin warning en consola.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-29 - UX-010 - Cargos adicionales de origen en Miami automatico

- Estado: En validacion manual.
- Hallazgo: UX-010.
- Causa raiz: El flujo rapido Miami Consolidado permitia agregar cargos
  adicionales de destino, pero no cargos de origen seleccionados desde las
  tarifas activas del perfil del cliente.
- Codigo:
  - `src/components/quotations/MiamiQuotationSection.tsx`
  - `src/hooks/useMiamiQuotation.ts`
  - `src/lib/miami-pricing-items.ts`
- SQL:
  - No aplica.
- Cambio:
  - Se agrego la seccion `Cargos adicionales en origen` para Miami LCL y Miami
    Aereo.
  - El selector usa tarifas activas del cliente en categoria `Otros Cargos`,
    excluyendo fletes, minimos, pickup y cargos automaticos ya controlados por el
    flujo Miami.
  - Al seleccionar una tarifa se precargan descripcion y monto; el monto e ISV
    quedan editables para la cotizacion puntual.
  - Los cargos seleccionados se guardan como `pricing_items` con
    `item_type = origin_charge`.
  - Miami Aereo permite marcar `Agregar Documentos/Manejo`; el monto se toma de
    la tarifa activa `documentos_manejo` del perfil del cliente y se guarda como
    cargo de origen.
  - Se normalizaron valores de inputs y checkboxes nuevos para evitar cambios de
    uncontrolled a controlled durante hidratacion/Fast Refresh.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS pendiente:
  - En `/quotations/new`, seleccionar cliente con tarifas Miami activas.
  - Probar Miami Consolidado Aereo y Miami Consolidado Maritimo LCL.
  - En Miami Aereo, marcar `Agregar Documentos/Manejo` y confirmar que precarga
    la tarifa del cliente.
  - Agregar un cargo adicional de origen, crear/previsualizar la cotizacion y
    confirmar que aparece en el PDF y en pricing items como cargo de origen.
- Riesgos pendientes:
  - Confirmar con datos reales si algun cargo del catalogo de cliente debe
    mostrarse tambien como destino o mantenerse reservado para reglas
    automaticas.
- Commit: hash pendiente

### 2026-06-29 - UX-011 - Sidebar sin encogimiento en paginas anchas

- Estado: Completado.
- Hallazgo: UX-011.
- Causa raiz: El layout protegido usa flex horizontal y el sidebar no tenia
  `shrink-0`. En paginas con tablas/filtros anchos, como Historico/Cotizaciones,
  el contenido principal podia forzar que el sidebar se encogiera.
- Codigo:
  - `src/components/layout/sidebar.tsx`
  - `src/components/layout/protected-shell.tsx`
- SQL:
  - No aplica.
- Cambio:
  - Se fijo el sidebar como columna no encogible con `shrink-0`.
  - Se agrego `min-w-0` a la columna principal y al `main` para que el overflow
    se maneje dentro del area de contenido.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
- Verificacion manual/RLS:
  - No aplica RLS. Revisar `/historico` y paginas con tablas anchas.
- Riesgos pendientes:
  - Ninguno.
- Commit: hash pendiente

### 2026-06-27 — FASE-6 — Embarques Miami persistentes e historial inicial

- Estado: En validación manual; migraciones aplicadas en Supabase remoto.
- Hallazgos: MIA-001, MIA-002, MIA-003 y MIA-004.
- Código:
  - `src/app/(protected)/miami/embarques/page.tsx`
- SQL:
  - `supabase/migrations/20260627050000_phase6_miami_persistent_shipments.sql`
  - `supabase/migrations/20260627060000_phase6_miami_status_events.sql`
  - `supabase/migrations/20260627070000_phase6_miami_status_reversals.sql`
- Cambios:
  - Agrega `miami_shipments` para conservar cada lista de embarque/despacho Miami
    como entidad persistente.
  - Agrega `miami_shipment_packages` para vincular paquetes a un despacho único.
  - Agrega `miami_package_events` para registrar el primer milestone de despacho
    por paquete y permitir historial posterior.
  - Agrega `next_miami_shipment_number()` y `create_miami_shipment(...)` con RLS
    y validación de rol Operaciones/Admin.
  - La pantalla de Lista de Embarque deja de actualizar paquetes directamente y
    pasa por el RPC transaccional; también muestra embarques recientes.
  - La Lista de Embarque captura modo de transporte (`Aereo`, `Maritimo`,
    `Terrestre` o `Courier`) y lo persiste en el despacho.
  - Inventario avanza estados de paquetes mediante
    `advance_miami_package_status`, dejando evento y cambio de estado en una
    sola transacción.
  - Inventario permite consultar el historial operativo de movimientos por
    paquete desde la misma tabla.
  - Inventario permite reversar un estado Miami con motivo obligatorio mediante
    `reverse_miami_package_status`, conservando auditoría en eventos y
    `activity_logs`.
  - El portal del cliente muestra el historial real de movimientos desde
    `miami_package_events`.
- Validaciones ejecutadas:
  - `npx tsc --noEmit`: OK.
  - `git diff --check`: OK.
- Validación manual pendiente:
  - En `/miami/embarques`, seleccionar paquetes en bodega y crear despacho.
  - Confirmar que se crea un registro en `miami_shipments`.
  - Confirmar que cada paquete queda vinculado en `miami_shipment_packages`.
  - Confirmar que cada paquete recibe evento `dispatch` en `miami_package_events`.
  - Confirmar que paquetes ya despachados no pueden volver a entrar en otro
    embarque.
  - Confirmar que el modo de transporte seleccionado queda guardado en
    `miami_shipments.transport_mode`.
  - Desde Inventario, avanzar un paquete y confirmar que aparece un evento
    `status_change` en `miami_package_events`.
  - Desde Inventario, abrir `Historial` en ese paquete y confirmar que lista los
    eventos.
  - Ejecutar `npx supabase db push --linked` para aplicar
    `20260627070000_phase6_miami_status_reversals.sql`.
  - Desde Inventario, reversar un estado con motivo y confirmar evento
    `status_reverse`.
  - Desde el portal cliente, abrir el paquete y confirmar que el historial de
    movimientos muestra despacho y cambios de estado.
- Riesgos o trabajo pendiente:
  - MIA-002 queda parcial: ya existe tabla de eventos para despacho, avance y
    reverso, pero faltan eventos específicos de incidencias.
  - MIA-003 queda parcial: ya existe vínculo con despacho y modo de transporte,
    pero faltan campos específicos para vuelo, camión o contenedor.
  - MIA-004 queda parcial: reversos y auditoría quedan cubiertos; POD/documento
    de entrega queda pendiente de estructura de archivos.
- Commit: pendiente.

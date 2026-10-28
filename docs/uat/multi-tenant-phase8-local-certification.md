# Certificación local multiempresa — Fase 8

Fecha: 21/09/2026
Alcance: candidato local Sari; sin despliegue, DNS, SQL remoto ni alta real de
MYA.

## Resultado

La certificación técnica local es satisfactoria. El candidato todavía no se
considera autorizado para producción: falta ejecutar UAT manual autenticado y
el preflight sobre una copia reciente del proyecto productivo.

| Control | Resultado |
| --- | --- |
| Instalación limpia | 99 migraciones aplicadas hasta `20260921190000` |
| Upgrade pre-multiempresa | 81 -> 99 migraciones, correcto |
| Integridad del backfill | 15/15 tablas con conteos idénticos antes/después |
| Ownership | Cero `tenant_id` nulos o distintos de Sari en el ensayo de upgrade |
| RLS/RPC/Storage | 7/7 suites multiempresa correctas |
| Roles | `anon`, Cliente, Ventas, Pricing, Operaciones, Contabilidad, Finanzas, Admin y administrador de plataforma |
| Cruce Sari/MYA | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, RPC y Storage rechazados según rol |
| Supabase DB lint | Sin errores de esquema |
| Pruebas de aplicación | 138/138 |
| TypeScript | Sin errores |
| Build | 73/73 páginas |
| ESLint dirigido | Capa tenant nueva sin errores ni warnings |
| ESLint global | 212 errores y 41 warnings de deuda existente fuera del cambio SQL de Fase 8 |

## Entornos usados

- La pila de trabajo `sarierp` se mantuvo activa y no fue reseteada.
- La certificación se ejecutó en `sarierp_phase8_certification`, con puertos
  locales `553xx` y datos exclusivamente ficticios.
- La huella de `sarierp` antes de la prueba fue: migración máxima
  `20260921181000`, un tenant y cero perfiles, cotizaciones, shipments o
  facturas locales.
- No se usaron las credenciales de `.env.local` para mutar el proyecto
  Supabase vinculado.

## Rutas certificadas

### Instalación limpia

Se reconstruyó la base desde cero con todo el historial versionado. Después se
ejecutaron, con rollback, las suites:

1. `phase1_multitenant_foundation.sql`
2. `phase2_tenant_company_settings.sql`
3. `phase3_commercial_tenant_isolation.sql`
4. `phase4_operations_tenant_isolation.sql`
5. `phase5_finance_catalog_tenant_isolation.sql`
6. `phase6_portal_storage_api_isolation.sql`
7. `phase7_tenant_hostname_resolution.sql`

### Upgrade con datos

Se reconstruyó la base hasta `20260918200000`, se cargó un expediente ficticio
con Cliente, Cotización, contenedor, tarifa, pricing, Shipment, Shipping
Instruction, Booking, evento operativo, proveedor, cuenta por pagar, factura,
ítem y ticket de soporte, y se registraron sus conteos.

Después se aplicaron las 18 migraciones multiempresa. Las 15 tablas conservaron
exactamente una fila antes y después; todas quedaron bajo el tenant Sari y se
mantuvieron las relaciones Cotización -> Shipment -> Shipping Instruction ->
Booking -> Facturación.

Los fixtures reproducibles son:

- `supabase/tests/phase8_upgrade_fixture.sql`
- `supabase/tests/phase8_upgrade_verify.sql`

## Hallazgos corregidos durante la certificación

1. Las políticas de fotos Miami de `main` dependían de
   `is_demo_access_active()`, disponible solo en la rama Demo. Se reemplazó por
   el control productivo `is_approved_active_user()`.
2. El entrypoint productivo de facturación llamaba
   `is_restricted_demo_context()`. Se eliminó esa dependencia exclusiva de la
   rama Demo.
3. La aserción de Fase 4 contaba todas las policies multiempresa añadidas en
   fases posteriores. Se acotó a sus 27 tablas operativas.
4. Los triggers append-only de Booking 5C bloqueaban el backfill real con
   datos. La migración suspende únicamente triggers de usuario en las 27 tablas
   durante el backfill transaccional, los reactiva antes del preflight y aborta
   toda la transacción ante cualquier inconsistencia.
5. `is_platform_admin()` conservaba una referencia dinámica a una función de
   Demo. La migración `20260921190000` fija su definición productiva y sus
   permisos; el lint de esquema queda limpio.
6. El administrador de plataforma tenía permisos RLS explícitos para soporte,
   pero la interfaz exigía siempre un tenant y no podía abrir la mesa de ayuda.
   El dominio raíz ahora admite únicamente login y lectura/gestión de tickets de
   soporte; dashboard, perfil, creación de tickets y módulos operativos siguen
   cerrados. Los perfiles operativos y de plataforma son contextos mutuamente
   excluyentes.

## UAT local

El ensayo SQL cubrió de extremo a extremo los registros canónicos de
Cotización, Pricing, Shipment, Shipping Instruction, Booking, Operación y
Facturación. No sustituye el UAT visual autenticado por rol.

Antes de autorizar un corte se debe completar manualmente, en una copia reciente
de Production:

La matriz ejecutable y el formato de evidencia están en
`docs/uat/multi-tenant-phase8-manual-uat.md`.

- Ventas: crear y editar cotización; enviarla a Pricing.
- Pricing: registrar tarifas, publicar opción y verificar PDF comercial.
- Operaciones: crear Shipment/SI, aceptar expediente, crear Booking y evento.
- Contabilidad/Finanzas: validar costos, crear proforma/factura y revisar CxC/CxP.
- Cliente: consultar únicamente su cotización, envío, paquete y documentos.
- Admin de Sari: configuración, invitación y usuarios del tenant.
- Administrador de plataforma: soporte transversal sin lectura operativa
  implícita.
- Hostname: `sari.forwarders.app`, dominio raíz, dominio desconocido y dominio
  inactivo.

## Riesgos abiertos

- El lint global mantiene 212 errores y 41 warnings históricos. La capa tenant
  dirigida está limpia, TypeScript y build pasan, pero esta deuda debe tratarse
  en un frente separado para no mezclarla con el corte multiempresa.
- La duración real del backfill depende del volumen y bloqueos de Production;
  debe medirse sobre una copia reciente antes de fijar la ventana.
- No se certificaron DNS, TLS, Vercel, redirects OAuth ni entrega real de
  correos, porque pertenecen a la futura ventana autorizada.
- MYA no existe fuera de pruebas transaccionales y no debe habilitarse todavía.

## Validación incremental del 22/09/2026

- `npm.cmd test`: 139/139 pruebas correctas.
- `npx.cmd tsc --noEmit`: OK.
- ESLint dirigido a contexto tenant, Proxy, login, layouts, navegación, soporte
  y prueba de hostname: OK.
- `npm.cmd run build`: OK, 73/73 páginas.
- Smoke HTTP local con `Host: forwarders.app`:
  - `/login`: `200`.
  - `/support`: `307` a login sin sesión.
  - `/support/<uuid>`: `307` a login sin sesión.
  - `/dashboard`: `404`.
  - `/support/new`: `404`.
- Este smoke valida enrutamiento y cierre por defecto; no sustituye el UAT
  visual con una sesión real de administrador de plataforma.
